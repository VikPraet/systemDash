import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseProjectEnv, mergeProjectEnv } from "../src/projectEnv.js";

describe("projectEnv", () => {
  it("does not copy arbitrary Beacon secrets", () => {
    const prev = process.env.BEACON_TEST_SECRET;
    process.env.BEACON_TEST_SECRET = "should-not-leak";
    process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || "ghp_test_token";
    try {
      const env = baseProjectEnv();
      assert.equal(env.BEACON_TEST_SECRET, undefined);
      assert.equal(env.GITHUB_TOKEN, undefined);
      assert.ok(env.PATH || env.Path);
    } finally {
      if (prev === undefined) delete process.env.BEACON_TEST_SECRET;
      else process.env.BEACON_TEST_SECRET = prev;
    }
  });

  it("merges explicitly configured project variables", () => {
    const env = mergeProjectEnv({
      APP_SETTING: "from-project",
      BEACON_REPLICA: "2",
    });
    assert.equal(env.APP_SETTING, "from-project");
    assert.equal(env.BEACON_REPLICA, "2");
    assert.equal(env.BEACON_TEST_SECRET, undefined);
  });
});
