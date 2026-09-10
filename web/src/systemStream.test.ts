import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  resetSystemStreamForTests,
  subscribeSystemSnapshot,
} from "./systemStream";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetSystemStreamForTests();
});

describe("subscribeSystemSnapshot", () => {
  it("delivers snapshots and reconnects after the stream ends", async () => {
    const calls: string[] = [];
    const snapshots: number[] = [];
    let errors = 0;

    mockFetch(async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return sseResponse([snapshotEvent(1)]);
      }
      return sseResponse([snapshotEvent(2)], { hang: true, signal: init?.signal });
    });

    const unsub = subscribeSystemSnapshot(
      {
        onSnapshot: (snap) => snapshots.push(snap.timestamp),
        onError: () => {
          errors += 1;
        },
      },
      { url: "/api/system/stream", reconnectMs: 20, timeoutMs: 2000 }
    );

    await waitFor(() => snapshots.includes(1) && snapshots.includes(2));
    assert.ok(calls.length >= 2);
    assert.ok(errors >= 1);
    unsub();
  });

  it("aborts the shared connection when the last subscriber leaves", async () => {
    let aborted = false;
    mockFetch(async (_url, init) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return sseResponse([], { hang: true, signal: init?.signal });
    });

    const unsub = subscribeSystemSnapshot(
      { onSnapshot: () => {} },
      { url: "/api/system/stream", closeDelayMs: 0, timeoutMs: 5000 }
    );
    await delay(20);
    unsub();
    await waitFor(() => aborted);
  });

  it("reuses one connection across StrictMode unmount/remount", async () => {
    let opens = 0;
    mockFetch(async (_url, init) => {
      opens += 1;
      return sseResponse([], { hang: true, signal: init?.signal });
    });

    const first = subscribeSystemSnapshot(
      { onSnapshot: () => {} },
      { url: "/api/system/stream", closeDelayMs: 0, timeoutMs: 5000 }
    );
    first();
    const second = subscribeSystemSnapshot(
      { onSnapshot: () => {} },
      { url: "/api/system/stream", closeDelayMs: 0, timeoutMs: 5000 }
    );

    await delay(30);
    assert.equal(opens, 1);
    second();
  });

  it("shares a single fetch across simultaneous subscribers", async () => {
    let opens = 0;
    const snapshots: number[][] = [[], []];
    mockFetch(async (_url, init) => {
      opens += 1;
      return sseResponse([snapshotEvent(7)], { hang: true, signal: init?.signal });
    });

    const a = subscribeSystemSnapshot(
      { onSnapshot: (snap) => snapshots[0].push(snap.timestamp) },
      { url: "/api/system/stream", timeoutMs: 2000 }
    );
    const b = subscribeSystemSnapshot(
      { onSnapshot: (snap) => snapshots[1].push(snap.timestamp) },
      { url: "/api/system/stream", timeoutMs: 2000 }
    );

    await waitFor(() => snapshots[0].includes(7) && snapshots[1].includes(7));
    assert.equal(opens, 1);
    a();
    b();
  });

  it("does not reconnect after an unauthenticated response", async () => {
    let opens = 0;
    let unauthorized = 0;
    const errors: string[] = [];
    mockFetch(async () => {
      opens += 1;
      return new Response(JSON.stringify({ error: "authentication required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    });

    const unsub = subscribeSystemSnapshot(
      {
        onSnapshot: () => {},
        onError: (message) => errors.push(message),
        onUnauthorized: () => {
          unauthorized += 1;
        },
      },
      { url: "/api/system/stream", reconnectMs: 20, timeoutMs: 1000 }
    );

    await waitFor(() => unauthorized === 1);
    await delay(60);
    assert.equal(opens, 1);
    assert.equal(unauthorized, 1);
    unsub();
  });

  it("stops reconnecting when the server revokes the session mid-stream", async () => {
    let opens = 0;
    let unauthorized = 0;
    mockFetch(async () => {
      opens += 1;
      return sseResponse([
        snapshotEvent(1),
        "event: unauthorized\ndata: {\"error\":\"authentication required\"}\n\n",
      ]);
    });

    const snapshots: number[] = [];
    const unsub = subscribeSystemSnapshot(
      {
        onSnapshot: (snap) => snapshots.push(snap.timestamp),
        onUnauthorized: () => {
          unauthorized += 1;
        },
      },
      { url: "/api/system/stream", reconnectMs: 20, timeoutMs: 2000 }
    );

    await waitFor(() => unauthorized === 1 && snapshots.includes(1));
    await delay(60);
    assert.equal(opens, 1);
    unsub();
  });

  it("reconnects after a silent timeout", async () => {
    let opens = 0;
    mockFetch(async (_url, init) => {
      opens += 1;
      if (opens === 1) return sseResponse([], { hang: true, signal: init?.signal });
      return sseResponse([snapshotEvent(9)], { hang: true, signal: init?.signal });
    });

    const snapshots: number[] = [];
    const errors: string[] = [];
    const unsub = subscribeSystemSnapshot(
      {
        onSnapshot: (snap) => snapshots.push(snap.timestamp),
        onError: (message) => errors.push(message),
      },
      { url: "/api/system/stream", timeoutMs: 40, reconnectMs: 20 }
    );

    await waitFor(() => snapshots.includes(9));
    assert.ok(opens >= 2);
    assert.ok(errors.some((e) => e === "Timed out waiting for the host"));
    unsub();
  });
});

function snapshotEvent(timestamp: number): string {
  return `event: snapshot\ndata: ${JSON.stringify({ timestamp })}\n\n`;
}

function mockFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>
): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return impl(url, init);
  }) as typeof fetch;
}

function sseResponse(
  chunks: string[],
  opts: { hang?: boolean; signal?: AbortSignal | null } = {}
): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (opts.signal?.aborted) {
        controller.close();
        return;
      }
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
        return;
      }
      if (opts.hang) {
        await new Promise<void>((resolve, reject) => {
          if (opts.signal?.aborted) {
            resolve();
            return;
          }
          const timer = setTimeout(resolve, 60_000);
          opts.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            },
            { once: true }
          );
        }).catch(() => {});
        controller.close();
        return;
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(pred: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await delay(10);
  }
}
