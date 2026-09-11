import type { Request, Response } from "express";
import { parseCookies, SESSION_COOKIE, userForToken } from "./auth.js";
import { getSnapshot, type SystemSnapshot } from "./stats.js";

export const SYSTEM_STREAM_PATH = "/api/system/stream";
export const SYSTEM_STREAM_INTERVAL_MS = 1000;
const COLLECT_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export type SnapshotCollector = () => Promise<SystemSnapshot>;
export type SessionVerifier = (token: string | undefined) => boolean;

export interface SystemTelemetryOptions {
  collect: SnapshotCollector;
  /** How often to sample and broadcast. Defaults to 1 second. */
  intervalMs?: number;
  /** Return false to drop the client (revoked/expired session). */
  verifySession?: SessionVerifier;
}

interface StreamClient {
  id: number;
  res: Response;
  token: string | undefined;
  alive: boolean;
}

/**
 * One shared sampling loop that broadcasts `SystemSnapshot` SSE events to every
 * connected dashboard. Collection runs at most once per interval regardless of
 * how many browsers are listening.
 */
export class SystemTelemetryHub {
  private readonly collect: SnapshotCollector;
  private readonly intervalMs: number;
  private readonly verifySession: SessionVerifier;
  private readonly clients = new Set<StreamClient>();
  private nextId = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inTick = false;
  private lastSnapshot: SystemSnapshot | null = null;

  constructor(options: SystemTelemetryOptions) {
    this.collect = options.collect;
    this.intervalMs = options.intervalMs ?? SYSTEM_STREAM_INTERVAL_MS;
    this.verifySession =
      options.verifySession ?? ((token) => userForToken(token) != null);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  get running(): boolean {
    return this.timer != null;
  }

  get latestSnapshot(): SystemSnapshot | null {
    return this.lastSnapshot;
  }

  handle(req: Request, res: Response): void {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];

    req.setTimeout(0);
    res.setTimeout(0);
    req.socket.setTimeout(0);
    req.socket.setNoDelay?.(true);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const client: StreamClient = {
      id: ++this.nextId,
      res,
      token,
      alive: true,
    };
    this.clients.add(client);

    const onClose = () => this.removeClient(client);
    req.on("close", onClose);
    res.on("close", onClose);
    req.on("aborted", onClose);

    // First body byte so reverse proxies (Cloudflare) flush instead of holding
    // an empty stream until the first snapshot — the dashboard otherwise shows
    // "host isn't responding" while /api/health is fine.
    try {
      res.write(":\n\n");
    } catch {
      this.removeClient(client);
      return;
    }

    if (this.lastSnapshot) {
      this.send(client, "snapshot", this.lastSnapshot);
    }

    this.ensureLoop();
  }

  async prime(): Promise<void> {
    if (this.lastSnapshot) return;
    try {
      this.lastSnapshot = await withTimeout(this.collect(), COLLECT_TIMEOUT_MS, "system snapshot");
    } catch (err) {
      console.error("Failed to prime system telemetry:", err);
    }
  }
  dispose(): void {
    for (const client of [...this.clients]) {
      this.removeClient(client);
    }
    this.stopLoop();
    this.lastSnapshot = null;
  }

  private ensureLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    void this.tick();
  }

  private stopLoop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.inTick) return;
    this.inTick = true;
    try {
      this.evictUnauthorized();
      if (this.clients.size === 0) {
        this.stopLoop();
        return;
      }

      let snapshot: SystemSnapshot;
      try {
        snapshot = await withTimeout(this.collect(), COLLECT_TIMEOUT_MS, "system snapshot");
      } catch (err) {
        console.error("Failed to collect system snapshot:", err);
        this.broadcast("error", { error: "failed to collect system stats" });
        return;
      }

      this.lastSnapshot = snapshot;
      this.evictUnauthorized();
      if (this.clients.size === 0) {
        this.stopLoop();
        return;
      }
      this.broadcast("snapshot", snapshot);
    } finally {
      this.inTick = false;
      if (this.clients.size === 0) this.stopLoop();
    }
  }

  private evictUnauthorized(): void {
    const verdict = new Map<string | undefined, boolean>();
    for (const client of [...this.clients]) {
      if (!client.alive) continue;
      let ok = verdict.get(client.token);
      if (ok === undefined) {
        try {
          ok = this.verifySession(client.token);
        } catch {
          ok = false;
        }
        verdict.set(client.token, ok);
      }
      if (!ok) this.dropUnauthorized(client);
    }
  }

  private dropUnauthorized(client: StreamClient): void {
    this.send(client, "unauthorized", { error: "authentication required" });
    this.removeClient(client);
  }

  private broadcast(event: string, data: unknown): void {
    for (const client of [...this.clients]) {
      this.send(client, event, data);
    }
  }

  private send(client: StreamClient, event: string, data: unknown): void {
    if (!client.alive || client.res.writableEnded || client.res.destroyed) {
      this.removeClient(client);
      return;
    }
    try {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.removeClient(client);
    }
  }

  private removeClient(client: StreamClient): void {
    if (!client.alive) return;
    client.alive = false;
    this.clients.delete(client);
    if (!client.res.writableEnded && !client.res.destroyed) {
      try {
        client.res.end();
      } catch {
        // already closed
      }
    }
    if (this.clients.size === 0) this.stopLoop();
  }
}

let defaultHub: SystemTelemetryHub | null = null;

function getDefaultHub(): SystemTelemetryHub {
  if (!defaultHub) {
    defaultHub = new SystemTelemetryHub({
      collect: () => getSnapshot(),
      intervalMs: SYSTEM_STREAM_INTERVAL_MS,
      verifySession: (token) => userForToken(token) != null,
    });
  }
  return defaultHub;
}

/** Express handler for `GET /api/system/stream`. */
export function handleSystemStream(req: Request, res: Response): void {
  getDefaultHub().handle(req, res);
}

/** Take one snapshot at boot so the first Cloudflare client is not an empty stream. */
export function primeSystemTelemetry(): Promise<void> {
  return getDefaultHub().prime();
}
