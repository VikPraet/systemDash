import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { destroySession, setUserRole, createUser } from "../src/auth.js";
import { watchAuthorizedSocket } from "../src/wsAuth.js";
import { insertProject } from "../src/projects.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cookieHeader,
  ensureUsers,
  listenServer,
  sessionFor,
  upgradeStatus,
} from "./harness.js";

class FakeSocket extends EventEmitter {
  readyState = 1;
  OPEN = 1;
  CONNECTING = 0;
  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
}

describe("WebSocket authorization", () => {
  let origin = "";
  let viewerCookie = "";
  let userCookie = "";
  let userId = 0;
  let projectId = 0;

  let close: () => Promise<void> = async () => {};

  before(async () => {
    const users = ensureUsers();
    userId = users.user.id;
    viewerCookie = cookieHeader(sessionFor(users.viewer.id));
    userCookie = cookieHeader(sessionFor(users.user.id));
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-proj-"));
    const project = insertProject({
      name: "log-test",
      localPath: folder,
      remoteUrl: "https://example.com/demo.git",
      branch: "main",
      accountId: null,
      runKind: "none",
      serviceKind: "website",
    });
    projectId = project.id;
    const srv = await listenServer();
    origin = srv.origin;
    close = srv.close;
  });

  after(() => close());

  it("rejects a viewer on the terminal WebSocket", async () => {
    assert.equal(await upgradeStatus(origin, "/api/terminal", viewerCookie), 403);
  });

  it("rejects a viewer on the project-log WebSocket", async () => {
    assert.equal(
      await upgradeStatus(origin, `/api/projects/${projectId}/logs`, viewerCookie),
      403
    );
  });

  it("rejects unauthenticated terminal upgrades", async () => {
    assert.equal(await upgradeStatus(origin, "/api/terminal"), 401);
  });

  it("closes a watched socket when the session is destroyed", async () => {
    const token = sessionFor(userId);
    const ws = new FakeSocket();
    let revoked = false;
    watchAuthorizedSocket({
      token,
      userId,
      ws: ws as unknown as WebSocket,
      onRevoked: () => {
        revoked = true;
      },
    });
    destroySession(token);
    assert.equal(revoked, true);
    assert.equal(ws.readyState, 3);
  });

  it("closes a watched socket when the user is demoted to viewer", async () => {
    const demote = createUser(`sddemote${Date.now()}`, "password1", "user");
    const token = sessionFor(demote.id);
    const ws = new FakeSocket();
    let revoked = false;
    watchAuthorizedSocket({
      token,
      userId: demote.id,
      ws: ws as unknown as WebSocket,
      onRevoked: () => {
        revoked = true;
      },
    });
    setUserRole(demote.id, "viewer");
    assert.equal(revoked, true);
  });

  it("allows an operator to upgrade the log socket", async () => {
    assert.equal(
      await upgradeStatus(origin, `/api/projects/${projectId}/logs`, userCookie),
      101
    );
  });
});
