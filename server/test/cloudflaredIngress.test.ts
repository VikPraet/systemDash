import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertIngressPreserved,
  insertYamlIngress,
  parseCloudflaredConfig,
} from "../src/cloudflared.js";
import { ProjectsError } from "../src/projects.js";

const BASE = `tunnel: c998ea71-6347-4f64-9f6c-92a12d0dd8e0
credentials-file: /etc/cloudflared/creds.json
ingress:
  - hostname: dash.ill4.life
    service: http://127.0.0.1:3001
  - hostname: webmin.ill4.life
    service: https://localhost:10000
  - service: http_status:404
`;

describe("cloudflared ingress guards", () => {
  it("keeps dash.ill4.life when inserting another hostname", () => {
    const next = insertYamlIngress(BASE, "hook.ill4.life", "http://127.0.0.1:3002");
    assert.doesNotThrow(() => assertIngressPreserved(BASE, next));
    const hosts = parseCloudflaredConfig(next).map((r) => r.hostname);
    assert.ok(hosts.includes("dash.ill4.life"));
    assert.ok(hosts.includes("hook.ill4.life"));
    assert.ok(hosts.includes("webmin.ill4.life"));
  });

  it("refuses a patched file that would drop an existing hostname", () => {
    const broken = `ingress:
  - hostname: hook.ill4.life
    service: http://127.0.0.1:3002
  - service: http_status:404
`;
    assert.throws(
      () => assertIngressPreserved(BASE, broken),
      (err: unknown) =>
        err instanceof ProjectsError &&
        err.status === 400 &&
        /would drop dash\.ill4\.life/i.test(err.message)
    );
  });
});
