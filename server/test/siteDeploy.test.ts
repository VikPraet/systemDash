import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertSystemdUnitReady,
  renderSystemdUnit,
  systemdWorkDir,
} from "../src/siteDeploy.js";
import { ProjectsError, type ProjectSummary } from "../src/projects.js";

function stub(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 7,
    name: "hook",
    localPath: "",
    remoteUrl: "",
    branch: "main",
    accountId: null,
    createdAt: 0,
    siteUrl: null,
    runKind: "systemd",
    serviceKind: "website",
    port: 3002,
    boot: true,
    container: null,
    composeFile: null,
    unit: "hook",
    publishFrom: null,
    publishTo: null,
    startCommand: "node server/dist/index.js",
    healthPath: null,
    embedPreview: false,
    embedUrl: null,
    notes: null,
    managed: true,
    clonedByBeacon: true,
    image: null,
    dockerfile: null,
    buildContext: null,
    buildCommand: null,
    workDir: null,
    cpuLimit: null,
    memoryLimitMb: null,
    replicas: 1,
    restartPolicy: "always",
    restartMaxRetries: null,
    restartBackoffMs: 3000,
    schedule: null,
    autoscaleEnabled: false,
    autoscaleMin: 1,
    autoscaleMax: 1,
    autoscaleCpuTarget: null,
    autoscaleMemTarget: null,
    autodeploy: false,
    autodeployIntervalS: 0,
    lastRun: null,
    ...over,
  };
}

describe("systemd unit guards", () => {
  it("refuses a missing working directory (the hook /opt/hook failure)", () => {
    const project = stub({ workDir: "/opt/hook-does-not-exist" });
    assert.throws(
      () => assertSystemdUnitReady(project, "node server/dist/index.js"),
      (err: unknown) =>
        err instanceof ProjectsError &&
        err.status === 400 &&
        /working directory does not exist/i.test(err.message)
    );
  });

  it("refuses a relative node start file that is not built yet", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-unit-"));
    try {
      const project = stub({ workDir: dir, localPath: dir });
      assert.throws(
        () => assertSystemdUnitReady(project, "/usr/bin/node server/dist/index.js"),
        (err: unknown) =>
          err instanceof ProjectsError && /start file not found/i.test(err.message)
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows a unit when the working directory and start file exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-unit-ok-"));
    const script = path.join(dir, "server", "dist", "index.js");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "console.log(1)\n");
    try {
      const project = stub({ workDir: dir, localPath: dir });
      assert.doesNotThrow(() =>
        assertSystemdUnitReady(project, "/usr/bin/node server/dist/index.js")
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders EnvironmentFile with a dash so a missing env file cannot crash-loop", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-unit-env-"));
    const project = stub({ workDir: dir, localPath: dir });
    const body = renderSystemdUnit(project, "/usr/bin/node server/dist/index.js");
    assert.match(body, /EnvironmentFile=-\S+workers[\\/]7[\\/]env/);
    assert.match(body, /StartLimitBurst=5/);
    assert.equal(systemdWorkDir(project), dir);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
