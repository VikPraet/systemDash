import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  AUTH_LOCKED_MESSAGE,
  authThrottleSize,
  clearAuthFailures,
  gateAuthAttempt,
  loginKeys,
  recordAuthFailure,
  resetAuthThrottle,
} from "../src/authThrottle.js";

describe("authThrottle", () => {
  beforeEach(() => resetAuthThrottle());

  it("locks after repeated failures and clears on success", async () => {
    const keys = loginKeys("203.0.113.9", "alice");
    for (let i = 0; i < 5; i++) {
      assert.equal(await gateAuthAttempt(keys), "ok");
      recordAuthFailure(keys);
    }
    assert.equal(await gateAuthAttempt(keys), "locked");
    clearAuthFailures(keys);
    assert.equal(await gateAuthAttempt(keys), "ok");
  });

  it("locks by shared IP while another IP stays open", async () => {
    const a = loginKeys("203.0.113.9", "alice");
    for (let i = 0; i < 5; i++) recordAuthFailure(a);
    assert.equal(await gateAuthAttempt(loginKeys("203.0.113.9", "bob")), "locked");
    assert.equal(await gateAuthAttempt(loginKeys("203.0.113.10", "bob")), "ok");
  });

  it("prunes expired keys", () => {
    recordAuthFailure(["login:user:x".repeat(3)]);
    assert.ok(authThrottleSize() >= 1);
    resetAuthThrottle();
    assert.equal(authThrottleSize(), 0);
  });

  it("exports the 429 message used by routes", () => {
    assert.equal(AUTH_LOCKED_MESSAGE, "too many attempts, try again later");
  });
});
