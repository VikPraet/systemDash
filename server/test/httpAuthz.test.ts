import assert from "node:assert/strict";
import path from "node:path";
import { describe, it, before, after } from "node:test";
import { DATA_DIR } from "../src/paths.js";
import {
  cookieHeader,
  ensureUsers,
  jsonRequest,
  listenServer,
  sessionFor,
} from "./harness.js";

describe("HTTP authorization", () => {
  let origin = "";
  let viewerCookie = "";
  let userCookie = "";
  let adminCookie = "";

  let close: () => Promise<void> = async () => {};

  before(async () => {
    const users = ensureUsers();
    viewerCookie = cookieHeader(sessionFor(users.viewer.id));
    userCookie = cookieHeader(sessionFor(users.user.id));
    adminCookie = cookieHeader(sessionFor(users.admin.id));
    const srv = await listenServer();
    origin = srv.origin;
    close = srv.close;
  });

  after(() => close());

  it("rejects unauthenticated privileged POSTs", async () => {
    const res = await jsonRequest(origin, "/api/fs/write", {
      method: "POST",
      body: { path: path.join(DATA_DIR, "x.txt"), content: "a" },
    });
    assert.equal(res.status, 401);
  });

  it("rejects viewer writes and viewer reads of auth.db", async () => {
    const write = await jsonRequest(origin, "/api/fs/write", {
      method: "POST",
      cookie: viewerCookie,
      body: { path: path.join(DATA_DIR, "x.txt"), content: "a" },
    });
    assert.equal(write.status, 403);

    const read = await jsonRequest(
      origin,
      `/api/fs/read?path=${encodeURIComponent(path.join(DATA_DIR, "auth.db"))}`,
      { cookie: viewerCookie }
    );
    assert.equal(read.status, 403);
    assert.deepEqual(read.json, { error: "permission denied" });
  });

  it("rejects a user calling admin user-management", async () => {
    const res = await jsonRequest(origin, "/api/users", {
      method: "POST",
      cookie: userCookie,
      body: { username: "intruder", password: "password1", role: "admin" },
    });
    assert.equal(res.status, 403);
  });

  it("lets an admin list users", async () => {
    const res = await jsonRequest(origin, "/api/users", { cookie: adminCookie });
    assert.equal(res.status, 200);
  });
});
