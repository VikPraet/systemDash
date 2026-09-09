import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { DATA_DIR } from "../src/paths.js";
import { assertFsReadable, HttpError, isSensitiveFsPath } from "../src/files.js";

describe("viewer filesystem restriction", () => {
  it("treats DATA_DIR as sensitive", async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const authDb = path.join(DATA_DIR, "auth.db");
    fs.writeFileSync(authDb, "x");
    assert.equal(await isSensitiveFsPath(authDb), true);
    await assert.rejects(() => assertFsReadable(authDb, "viewer"), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 403);
      return true;
    });
    await assert.doesNotReject(() => assertFsReadable(authDb, "user"));
    await assert.doesNotReject(() => assertFsReadable(authDb, "admin"));
  });

  it("treats ~/.ssh as sensitive", async () => {
    const ssh = path.join(os.homedir(), ".ssh");
    assert.equal(await isSensitiveFsPath(ssh), true);
    await assert.rejects(() => assertFsReadable(ssh, "viewer"), (err: unknown) => {
      return err instanceof HttpError && err.status === 403;
    });
  });

  it("allows an ordinary file for viewers", async () => {
    const file = path.join(os.tmpdir(), `beacon-ok-${process.pid}.txt`);
    fs.writeFileSync(file, "ok");
    assert.equal(await isSensitiveFsPath(file), false);
    await assert.doesNotReject(() => assertFsReadable(file, "viewer"));
  });

  it("blocks traversal into DATA_DIR and symlink escape", async () => {
    const authDb = path.join(DATA_DIR, "auth.db");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(authDb, "x");
    const sneaky = path.join(DATA_DIR, "workers", "..", "auth.db");
    await assert.rejects(() => assertFsReadable(sneaky, "viewer"), (err: unknown) => {
      return err instanceof HttpError && err.status === 403;
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-link-"));
    const link = path.join(dir, "leak.db");
    try {
      fs.symlinkSync(authDb, link);
    } catch {
      return;
    }
    await assert.rejects(() => assertFsReadable(link, "viewer"), (err: unknown) => {
      return err instanceof HttpError && err.status === 403;
    });
  });
});
