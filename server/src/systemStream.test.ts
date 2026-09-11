import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { SystemSnapshot } from "./stats.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-sse-"));
process.env.SYSTEMDASH_DATA_DIR = dataDir;

const { SystemTelemetryHub } = await import("./systemStream.js");
const { closeAuthDb } = await import("./db.js");
const {
  createSession,
  createUser,
  destroySession,
  requireAuth,
  SESSION_COOKIE,
} = await import("./auth.js");

const hubs: InstanceType<typeof SystemTelemetryHub>[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  for (const hub of hubs) hub.dispose();
  hubs.length = 0;
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        })
    )
  );
  servers.length = 0;
});

after(() => {
  closeAuthDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("system telemetry SSE", () => {
  it("rejects unauthenticated access", async () => {
    const hub = createHub();
    const { url } = await listen(gatedApp(hub));
    const res = await fetch(`${url}/api/system/stream`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get("content-type") ?? "", /json/);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "authentication required");
    assert.equal(hub.clientCount, 0);
  });

  it("accepts an authenticated connection as text/event-stream", async () => {
    const hub = createHub();
    const { url } = await listen(gatedApp(hub));
    const cookie = await sessionCookie();
    const stream = await openStream(`${url}/api/system/stream`, cookie);
    assert.equal(stream.res.status, 200);
    assert.equal(stream.res.headers.get("content-type"), "text/event-stream");
    stream.ctrl.abort();
  });

  it("sends an initial snapshot immediately without waiting for the interval", async () => {
    let collects = 0;
    const hub = createHub({
      intervalMs: 30_000,
      collect: async () => fakeSnap(++collects),
    });
    const { url } = await listen(gatedApp(hub));
    const cookie = await sessionCookie();
    const stream = await openStream(`${url}/api/system/stream`, cookie);
    const event = await stream.next(1000);
    assert.equal(event.event, "snapshot");
    assert.equal((event.data as SystemSnapshot).timestamp, 1);
    assert.equal(collects, 1);
    stream.ctrl.abort();
  });

  it("primes a snapshot so the first client is not an empty stream", async () => {
    const hub = createHub({
      intervalMs: 30_000,
      collect: async () => fakeSnap(9),
    });
    await hub.prime();
    assert.equal(hub.latestSnapshot?.timestamp, 9);
  });

  it("pushes repeated snapshot updates from one sampling loop", async () => {
    let collects = 0;
    const hub = createHub({
      intervalMs: 40,
      collect: async () => fakeSnap(++collects),
    });
    const { url } = await listen(gatedApp(hub));
    const cookie = await sessionCookie();
    const stream = await openStream(`${url}/api/system/stream`, cookie);
    const first = await stream.next();
    const second = await stream.next();
    const third = await stream.next();
    assert.equal(first.event, "snapshot");
    assert.equal(second.event, "snapshot");
    assert.equal(third.event, "snapshot");
    assert.equal((first.data as SystemSnapshot).timestamp, 1);
    assert.equal((second.data as SystemSnapshot).timestamp, 2);
    assert.equal((third.data as SystemSnapshot).timestamp, 3);
    stream.ctrl.abort();
  });

  it("removes a disconnected client and stops the shared loop", async () => {
    const hub = createHub({ intervalMs: 40 });
    const { url } = await listen(gatedApp(hub));
    const cookie = await sessionCookie();
    const stream = await openStream(`${url}/api/system/stream`, cookie);
    await stream.next();
    assert.equal(hub.clientCount, 1);
    assert.equal(hub.running, true);
    stream.ctrl.abort();
    await waitFor(() => hub.clientCount === 0 && hub.running === false);
  });

  it("broadcasts one shared sample to multiple clients", async () => {
    let collects = 0;
    const hub = createHub({
      intervalMs: 40,
      collect: async () => fakeSnap(++collects),
    });
    const { url } = await listen(gatedApp(hub));
    const cookieA = await sessionCookie();
    const cookieB = await sessionCookie();
    const a = await openStream(`${url}/api/system/stream`, cookieA);
    const b = await openStream(`${url}/api/system/stream`, cookieB);
    await Promise.all([a.next(), b.next()]);
    const [secondA, secondB] = await Promise.all([a.next(), b.next()]);
    assert.equal(
      (secondA.data as SystemSnapshot).timestamp,
      (secondB.data as SystemSnapshot).timestamp
    );
    assert.equal(hub.clientCount, 2);
    assert.ok(collects < 6, `expected a shared loop, got ${collects} collects`);
    a.ctrl.abort();
    b.ctrl.abort();
    await waitFor(() => hub.clientCount === 0);
  });

  it("closes the stream after the session is revoked", async () => {
    const hub = createHub({ intervalMs: 40 });
    const { url } = await listen(gatedApp(hub));
    const { cookie, token } = await session();
    const stream = await openStream(`${url}/api/system/stream`, cookie);
    await stream.next();
    destroySession(token);
    const event = await stream.next(1500).catch((err: Error) => err);
    if (event instanceof Error) {
      assert.match(event.message, /stream ended|aborted|aborted/i);
    } else {
      assert.equal(event.event, "unauthorized");
    }
    await waitFor(() => hub.clientCount === 0);
  });
});

function createHub(
  options: {
    intervalMs?: number;
    collect?: () => Promise<SystemSnapshot>;
    verifySession?: (token: string | undefined) => boolean;
  } = {}
) {
  let n = 0;
  const hub = new SystemTelemetryHub({
    intervalMs: options.intervalMs ?? 50,
    collect: options.collect ?? (async () => fakeSnap(++n)),
    verifySession: options.verifySession,
  });
  hubs.push(hub);
  return hub;
}

function gatedApp(hub: InstanceType<typeof SystemTelemetryHub>) {
  const app = express();
  app.use("/api", requireAuth);
  app.get("/api/system/stream", (req, res) => hub.handle(req, res));
  return app;
}

async function listen(app: express.Express) {
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listen address");
  return { url: `http://127.0.0.1:${addr.port}`, server };
}

async function session() {
  const user = createUser(`sse${Math.random().toString(16).slice(2, 10)}`, "password1", "admin");
  const { token } = createSession(user.id);
  return { token, cookie: `${SESSION_COOKIE}=${token}` };
}

async function sessionCookie() {
  return (await session()).cookie;
}

async function openStream(url: string, cookie: string) {
  const ctrl = new AbortController();
  const res = await fetch(url, {
    headers: { cookie, Accept: "text/event-stream" },
    signal: ctrl.signal,
  });
  const reader = res.body?.getReader() ?? null;
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    res,
    ctrl,
    async next(timeoutMs = 2000): Promise<ParsedEvent> {
      if (!reader) throw new Error("no body");
      const deadline = Date.now() + timeoutMs;
      while (true) {
        const sep = buffer.indexOf("\n\n");
        if (sep >= 0) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = parseBlock(block);
          if (parsed) return parsed;
          continue;
        }
        if (Date.now() > deadline) throw new Error("timed out waiting for SSE event");
        if (ctrl.signal.aborted) throw new Error("aborted");
        const remaining = Math.max(1, deadline - Date.now());
        const result = await Promise.race([
          reader.read(),
          delay(remaining).then(() => null),
        ]);
        if (!result) throw new Error("timed out waiting for SSE event");
        if (result.done) throw new Error("stream ended");
        buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, "\n");
      }
    },
  };
}

interface ParsedEvent {
  event: string;
  data: unknown;
}

function parseBlock(block: string): ParsedEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx < 0 ? line : line.slice(0, idx);
    let value = idx < 0 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // keep raw
  }
  return { event, data };
}

function fakeSnap(n: number): SystemSnapshot {
  return {
    timestamp: n,
    app: { name: "Beacon", version: "test" },
    host: {
      hostname: "test-host",
      platform: "test",
      distro: "test",
      release: "1",
      arch: "x64",
      kernel: "test",
      uptimeSeconds: 1,
      systemManufacturer: "",
      systemModel: "",
    },
    cpu: {
      manufacturer: "",
      brand: "",
      physicalCores: 1,
      cores: 1,
      baseSpeedGHz: 1,
      maxSpeedGHz: 1,
      currentSpeedGHz: 1,
      minSpeedGHz: 1,
      loadPercent: 0,
      perCoreLoad: [0],
      perCoreSpeed: [1],
      temperatureC: null,
    },
    memory: {
      totalBytes: 1,
      usedBytes: 0,
      freeBytes: 1,
      activeBytes: 0,
      availableBytes: 1,
      usedPercent: 0,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
    },
    disks: [],
    gpus: [],
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(pred: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await delay(15);
  }
}
