import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { resetAuthThrottle } from "../src/authThrottle.js";
import { clientIp } from "../src/clientAddress.js";
import { loginKeys } from "../src/authThrottle.js";
import { gateAuthAttempt, recordAuthFailure } from "../src/authThrottle.js";
import {
  cookieHeader,
  ensureUsers,
  jsonRequest,
  listenServer,
  sessionFor,
} from "./harness.js";

describe("auth HTTP", () => {
  let origin = "";
  let close: () => Promise<void> = async () => {};

  before(async () => {
    ensureUsers();
    const srv = await listenServer();
    origin = srv.origin;
    close = srv.close;
  });

  after(() => close());

  it("returns 429 after repeated failed logins", async () => {
    resetAuthThrottle();
    const body = { username: "nosuch", password: "wrongpass" };
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await jsonRequest(origin, "/api/auth/login", { method: "POST", body });
      last = res.status;
    }
    assert.equal(last, 429);
    const json = (await jsonRequest(origin, "/api/auth/login", { method: "POST", body })).json as {
      error?: string;
    };
    assert.equal(json.error, "too many attempts, try again later");
  });

  it("does not let rotating X-Forwarded-For bypass limits on a direct IP", async () => {
    resetAuthThrottle();
    const direct = {
      headers: { "x-forwarded-for": "198.51.100.1" },
      socket: { remoteAddress: "203.0.113.77" },
    };
    for (let i = 0; i < 5; i++) {
      direct.headers["x-forwarded-for"] = `198.51.100.${i + 1}`;
      const keys = loginKeys(clientIp(direct), "alice");
      assert.equal(await gateAuthAttempt(keys), "ok");
      recordAuthFailure(keys);
    }
    direct.headers["x-forwarded-for"] = "198.51.100.99";
    const keys = loginKeys(clientIp(direct), "alice");
    assert.equal(await gateAuthAttempt(keys), "locked");
  });

  it("keeps a 401 body for a single bad password", async () => {
    resetAuthThrottle();
    const res = await jsonRequest(origin, "/api/auth/login", {
      method: "POST",
      body: { username: "sdadmin", password: "nope-nope" },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(res.json, { error: "invalid username or password" });
  });

  it("accepts a valid session cookie on /api/auth/me", async () => {
    const { admin } = ensureUsers();
    const res = await jsonRequest(origin, "/api/auth/me", {
      cookie: cookieHeader(sessionFor(admin.id)),
    });
    assert.equal(res.status, 200);
  });
});
