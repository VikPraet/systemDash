import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { composeServices, dockerBinPath, listLabeledContainers } from "./docker.js";
import { ProjectsError, updateProject, type ProjectSummary } from "./projects.js";
import { resolveUnderProject, runSystemctl, unitFileName } from "./siteDeploy.js";

const exec = promisify(execFile);
async function command(file: string, args: string[]) {
  return (await exec(file, args, { timeout: 30_000, windowsHide: true })).stdout.trim();
}
export async function systemdTarget(project: ProjectSummary) {
  if (process.platform !== "linux" || !project.unit) throw new ProjectsError(400, "Configure a systemd unit on a Linux host first");
  const name = unitFileName(project.unit);
  for (const user of [false, true]) {
    try {
      const out = await command("systemctl", [...(user ? ["--user"] : []), "show", "--property=LoadState", "--value", name]);
      if (out && out !== "not-found") return { name, user };
    } catch { /* Try the other scope. */ }
  }
  throw new ProjectsError(400, `${name} is not installed`);
}
async function containers(project: ProjectSummary): Promise<string[]> {
  if (project.runKind === "compose") return (await composeServices(project.localPath, resolveUnderProject(project.localPath, project.composeFile || "compose.yaml"))).map(c => c.name);
  if (project.managed) return (await listLabeledContainers(project.id)).map(c => c.id);
  return project.container ? [project.container] : [];
}
export async function readProjectBoot(project: ProjectSummary, inspect = command): Promise<boolean | null> {
  try {
    if (project.runKind === "systemd") {
      const { name, user } = await systemdTarget(project);
      const state = await command("systemctl", [...(user ? ["--user"] : []), "show", "--property=UnitFileState", "--value", name]);
      if (state === "enabled") return true;
      if (["disabled", "masked", "static", "enabled-runtime"].includes(state)) return false;
      return null;
    }
    if (["docker", "compose"].includes(project.runKind)) {
      const ids = await containers(project);
      if (!ids.length) return null;
      const policies = await Promise.all(ids.map(id => inspect(dockerBinPath(), ["inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", id])));
      return policies.some(p => p === "always" || p === "unless-stopped");
    }
  } catch { /* An unavailable runtime must not overwrite the saved setting. */ }
  return null;
}
export async function syncProjectBoot<T extends ProjectSummary>(project: T): Promise<T> {
  const boot = await readProjectBoot(project);
  if (boot !== null && boot !== project.boot) updateProject(project.id, { boot });
  return { ...project, boot: boot ?? project.boot };
}
export async function setProjectBoot(project: ProjectSummary, boot: boolean) {
  if (project.runKind === "systemd") {
    const { name, user } = await systemdTarget(project);
    await runSystemctl([boot ? "enable" : "disable", name], () => {}, user);
  } else if (["docker", "compose"].includes(project.runKind)) {
    const ids = await containers(project);
    for (const id of ids) await command(dockerBinPath(), ["update", "--restart", boot ? "unless-stopped" : "no", id]);
  }
}
export async function controlExternalProject(project: ProjectSummary, action: "start" | "stop") {
  if (project.runKind === "systemd") {
    const { name, user } = await systemdTarget(project);
    await runSystemctl([action, name], () => {}, user);
  } else if (["docker", "compose"].includes(project.runKind)) {
    const ids = await containers(project);
    if (!ids.length) throw new ProjectsError(400, "Deploy this project first to create its containers");
    for (const id of ids) await command(dockerBinPath(), [action, id]);
  } else throw new ProjectsError(400, "This project has no controllable runtime");
}
