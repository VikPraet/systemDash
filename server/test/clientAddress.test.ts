import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientIp, isSecureRequest, isTrustedProxyIp } from "../src/clientAddress.js";

describe("clientAddress", () => {
  it("trusts loopback and ignores unknown peers", () => {
    assert.equal(isTrustedProxyIp("127.0.0.1"), true);
    assert.equal(isTrustedProxyIp("::1"), true);
    assert.equal(isTrustedProxyIp("8.8.8.8"), false);
  });

  it("ignores X-Forwarded-For on a direct (untrusted) connection", () => {
    const req = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      socket: { remoteAddress: "203.0.113.50" },
    };
    assert.equal(clientIp(req), "203.0.113.50");
    req.headers["x-forwarded-for"] = "198.51.100.2";
    assert.equal(clientIp(req), "203.0.113.50");
  });

  it("uses the first X-Forwarded-For hop from a trusted proxy", () => {
    const req = {
      headers: { "x-forwarded-for": "198.51.100.1, 127.0.0.1" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    assert.equal(clientIp(req), "198.51.100.1");
  });

  it("does not honor forwarded proto from an untrusted peer", () => {
    const req = {
      headers: { "x-forwarded-proto": "https" },
      socket: { remoteAddress: "203.0.113.50", encrypted: false as boolean | undefined },
    };
    assert.equal(isSecureRequest(req), false);
  });

  it("honors forwarded proto from loopback", () => {
    const req = {
      headers: { "x-forwarded-proto": "https" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    assert.equal(isSecureRequest(req), true);
  });
});
