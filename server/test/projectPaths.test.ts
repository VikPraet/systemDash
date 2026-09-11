import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fallbackProjectsDir, parentDir } from "../src/projectPaths.js";

describe("projectPaths", () => {
  it("defaults Windows clones to C:\\Projects", () => {
    assert.equal(fallbackProjectsDir("C:\\Users\\vik", "win32"), "C:\\Projects");
  });

  it("defaults Linux clones to /home/vadmin when that home exists", () => {
    assert.equal(
      fallbackProjectsDir("/opt/systemdash", "linux", (p) => p === "/home/vadmin"),
      "/home/vadmin"
    );
  });

  it("uses the process home on Linux when vadmin is not on the host", () => {
    assert.equal(
      fallbackProjectsDir("/home/other", "linux", () => false),
      "/home/other"
    );
  });

  it("does not clone into /opt even if that is the process home", () => {
    assert.equal(
      fallbackProjectsDir("/opt/systemdash", "linux", () => false),
      "/home/vadmin"
    );
  });

  it("returns the parent of a project folder", () => {
    const project = path.join(os.homedir(), "hook");
    assert.equal(parentDir(project), os.homedir());
  });

  it("rejects filesystem roots as a remembered parent", () => {
    assert.equal(parentDir(path.parse(process.cwd()).root), null);
  });
});
