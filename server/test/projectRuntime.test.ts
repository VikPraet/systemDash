import assert from "node:assert/strict";
import { test } from "node:test";
import { readProjectBoot } from "../src/projectRuntime.js";
import type { ProjectSummary } from "../src/projects.js";
const project = { runKind: "docker", managed: false, container: "existing-app", boot: false } as ProjectSummary;
test("startup reads the container policy even when Beacon saved the opposite", async () => {
  for (const policy of ["always", "unless-stopped"]) {
    assert.equal(await readProjectBoot(project, async (_file, args) => {
      assert.deepEqual(args, ["inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", "existing-app"]);
      return policy;
    }), true);
  }
  for (const policy of ["no", "on-failure"]) {
    assert.equal(await readProjectBoot({ ...project, boot: true }, async () => policy), false);
  }
});
test("unavailable runtime leaves the saved startup preference alone", async () => {
  assert.equal(await readProjectBoot(project, async () => { throw new Error("offline"); }), null);
  assert.equal(await readProjectBoot({ ...project, container: null }, async () => { throw new Error("must not inspect"); }), null);
});
