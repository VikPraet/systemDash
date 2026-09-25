import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { startSuspendedPage, stopSuspendedPage } from "../src/suspendedPage.js";

test("suspended website serves an escaped, uncacheable 503 and releases its port", async () => {
  const reserve = http.createServer();
  await new Promise<void>(resolve => reserve.listen(0, resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const project = { id: 9876, name: '<script>alert("x")</script>', port, serviceKind: "website" as const };
  try {
    await startSuspendedPage(project);
    await startSuspendedPage(project);
    const response = await fetch(`http://localhost:${port}/some/deep/path`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("retry-after"), "60");
    const body = await response.text();
    assert.match(body, /Service suspended/);
    assert.match(body, /&lt;script&gt;/);
    assert.ok(!body.includes('<script>'));
    const head = await fetch(`http://localhost:${port}/`, { method: "HEAD" });
    assert.equal(head.status, 503);
    assert.equal(await head.text(), "");
  } finally { await stopSuspendedPage(project.id); }
  const restarted = http.createServer((_req, res) => res.end("running"));
  try {
    await new Promise<void>((resolve, reject) => { restarted.once("error", reject); restarted.listen(port, resolve); });
    assert.equal(await (await fetch(`http://localhost:${port}/`)).text(), "running");
  } finally { await new Promise<void>(resolve => restarted.close(() => resolve())); }
});

test("workers and websites without a port do not open a listener", async () => {
  await startSuspendedPage({ id: 9877, name: "worker", port: 3001, serviceKind: "worker" });
  await startSuspendedPage({ id: 9878, name: "website", port: null, serviceKind: "website" });
  await stopSuspendedPage(9877);
  await stopSuspendedPage(9878);
});
