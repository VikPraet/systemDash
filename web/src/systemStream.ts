import type { SystemSnapshot } from "./types";

export const SYSTEM_STREAM_PATH = "/api/system/stream";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RECONNECT_MS = 1000;
const DEFAULT_CLOSE_DELAY_MS = 0;

export interface SystemStreamHandlers {
  onSnapshot: (snap: SystemSnapshot) => void;
  onError?: (message: string) => void;
  onUnauthorized?: () => void;
}

export interface SystemStreamOptions {
  url?: string;
  timeoutMs?: number;
  reconnectMs?: number;
  /** Delay before tearing down the shared fetch when the last listener leaves.
   *  0 coalesces React StrictMode unmount/remount in the same tick. */
  closeDelayMs?: number;
}

interface SseEvent {
  event: string;
  data: string;
}

let listeners = new Set<SystemStreamHandlers>();
let refCount = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let pumpAbort: AbortController | null = null;
let pumping = false;
let pumpGeneration = 0;
let activeOptions: Required<Pick<SystemStreamOptions, "url" | "timeoutMs" | "reconnectMs" | "closeDelayMs">> =
  {
    url: SYSTEM_STREAM_PATH,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    reconnectMs: DEFAULT_RECONNECT_MS,
    closeDelayMs: DEFAULT_CLOSE_DELAY_MS,
  };

/**
 * Subscribe to live system snapshots over SSE.
 *
 * Connections are ref-counted at module scope so React StrictMode's
 * mount → unmount → remount does not open two streams.
 */
export function subscribeSystemSnapshot(
  handlers: SystemStreamHandlers,
  options: SystemStreamOptions = {}
): () => void {
  if (refCount === 0) {
    activeOptions = {
      url: options.url ?? SYSTEM_STREAM_PATH,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      reconnectMs: options.reconnectMs ?? DEFAULT_RECONNECT_MS,
      closeDelayMs: options.closeDelayMs ?? DEFAULT_CLOSE_DELAY_MS,
    };
  }

  listeners.add(handlers);
  refCount += 1;

  if (closeTimer != null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  ensurePump();

  return () => {
    listeners.delete(handlers);
    refCount = Math.max(0, refCount - 1);
    if (refCount > 0) return;
    if (closeTimer != null) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      closeTimer = null;
      if (refCount === 0) stopPump();
    }, activeOptions.closeDelayMs);
  };
}

/** Abort any in-flight stream and drop listeners. Tests only. */
export function resetSystemStreamForTests(): void {
  listeners = new Set();
  refCount = 0;
  if (closeTimer != null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  stopPump();
  activeOptions = {
    url: SYSTEM_STREAM_PATH,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    reconnectMs: DEFAULT_RECONNECT_MS,
    closeDelayMs: DEFAULT_CLOSE_DELAY_MS,
  };
}

function ensurePump(): void {
  if (pumping) return;
  pumping = true;
  const generation = ++pumpGeneration;
  const opts = activeOptions;
  void runPump(generation, opts);
}

function stopPump(): void {
  pumpGeneration += 1;
  pumping = false;
  pumpAbort?.abort();
  pumpAbort = null;
}

async function runPump(
  generation: number,
  opts: typeof activeOptions
): Promise<void> {
  try {
    while (refCount > 0 && generation === pumpGeneration) {
      const ctrl = new AbortController();
      pumpAbort = ctrl;
      try {
        await readOnce(ctrl, opts);
        if (refCount <= 0 || generation !== pumpGeneration) break;
        emitError("Connection lost");
      } catch (err) {
        if (ctrl.signal.aborted || generation !== pumpGeneration || refCount <= 0) {
          break;
        }
        if (isUnauthorizedError(err)) {
          emitUnauthorized();
          break;
        }
        emitError(errorMessage(err));
      } finally {
        if (pumpAbort === ctrl) pumpAbort = null;
      }

      if (refCount <= 0 || generation !== pumpGeneration) break;
      await sleep(opts.reconnectMs, ctrl.signal).catch(() => {});
    }
  } finally {
    if (generation === pumpGeneration) pumping = false;
  }
}

async function readOnce(
  ctrl: AbortController,
  opts: typeof activeOptions
): Promise<void> {
  const timeout = new AbortController();
  const onAbort = () => timeout.abort();
  ctrl.signal.addEventListener("abort", onAbort);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const bumpIdle = () => {
    if (idleTimer != null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => timeout.abort(), opts.timeoutMs);
  };
  bumpIdle();

  try {
    const res = await fetch(opts.url, {
      signal: anySignal([ctrl.signal, timeout.signal]),
      credentials: "same-origin",
      headers: { Accept: "text/event-stream" },
    });

    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    if (!res.body) {
      throw new Error("Connection lost");
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      throw new Error("Unexpected response from host");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const cancelBody = () => {
      void reader.cancel().catch(() => {});
    };
    timeout.signal.addEventListener("abort", cancelBody, { once: true });

    while (true) {
      if (timeout.signal.aborted && !ctrl.signal.aborted) throw idleError();
      const { done, value } = await reader.read();
      if (timeout.signal.aborted && !ctrl.signal.aborted) throw idleError();
      if (done) break;
      if (ctrl.signal.aborted) break;
      bumpIdle();
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSseBlock(block);
        if (!parsed) continue;
        if (parsed.event === "unauthorized") {
          throw new UnauthorizedError();
        }
        if (parsed.event === "error") {
          emitError(readErrorMessage(parsed.data));
          continue;
        }
        if (parsed.event === "snapshot" || parsed.event === "message") {
          const snap = parseSnapshot(parsed.data);
          if (snap) emitSnapshot(snap);
        }
      }
    }
  } catch (err) {
    if (timeout.signal.aborted && !ctrl.signal.aborted) {
      throw idleError();
    }
    throw err;
  } finally {
    if (idleTimer != null) clearTimeout(idleTimer);
    ctrl.signal.removeEventListener("abort", onAbort);
  }
}

function parseSseBlock(block: string): SseEvent | null {
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
  return { event, data: dataLines.join("\n") };
}

function parseSnapshot(raw: string): SystemSnapshot | null {
  try {
    const value = JSON.parse(raw) as SystemSnapshot;
    if (!value || typeof value.timestamp !== "number") return null;
    return value;
  } catch {
    return null;
  }
}

function readErrorMessage(raw: string): string {
  try {
    const value = JSON.parse(raw) as { error?: string };
    if (typeof value.error === "string" && value.error) return value.error;
  } catch {
    // use fallback
  }
  return "Connection lost";
}

function emitSnapshot(snap: SystemSnapshot): void {
  for (const listener of [...listeners]) listener.onSnapshot(snap);
}

function emitError(message: string): void {
  for (const listener of [...listeners]) listener.onError?.(message);
}

function emitUnauthorized(): void {
  for (const listener of [...listeners]) listener.onUnauthorized?.();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Connection lost";
}

function idleError(): Error {
  const err = new Error("Timed out waiting for the host");
  err.name = "AbortError";
  return err;
}

class UnauthorizedError extends Error {
  constructor() {
    super("authentication required");
    this.name = "UnauthorizedError";
  }
}

function isUnauthorizedError(err: unknown): boolean {
  return err instanceof UnauthorizedError;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      ctrl.abort();
      return ctrl.signal;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  return ctrl.signal;
}
