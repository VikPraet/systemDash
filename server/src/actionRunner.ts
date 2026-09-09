import { spawn } from "node:child_process";
import fs from "node:fs";
import {
  finishRun,
  getLatestRun,
  insertRun,
  requireAction,
  requireProject,
  resolveAccountForProject,
  projectHasGit,
  projectHasFolder,
  writeWorkerEnvFile,
  envMapForRuntime,
  type ActionRun,
  type ActionStep,
  type ProjectSummary,
  ProjectsError,
} from "./projects.js";
import { checkRemote, gitAvailable, gitPull, type GitCheckResult } from "./gitRemote.js";
import {
  containerAction,
  dockerAvailable,
  dockerComposeAvailable,
  DockerError,
  ensureContainer,
} from "./docker.js";
import { applySystemdUnit, composeUp, publishFolder, runSystemctl } from "./siteDeploy.js";
import { reconcileWorker } from "./workers.js";
import { mergeProjectEnv } from "./projectEnv.js";

export interface ActionJob {
  running: boolean;
  projectId: number;
  actionId: number | null;
  actionName: string;
  phase: "idle" | "running" | "done" | "error";
  stepIndex: number;
  stepCount: number;
  stepLabel: string;
  progress: number;
  log: string;
  error: string | null;
  runId: number | null;
}

const OUTPUT_TAIL = 48_000;
const COMMAND_TIMEOUT_MS = 20 * 60_000;

const jobs = new Map<number, ActionJob>();

function tail(text: string): string {
  if (text.length <= OUTPUT_TAIL) return text;
  return `…\n${text.slice(text.length - OUTPUT_TAIL)}`;
}

function idleJob(projectId: number, last?: ActionRun | null): ActionJob {
  if (!last) {
    return {
      running: false,
      projectId,
      actionId: null,
      actionName: "",
      phase: "idle",
      stepIndex: 0,
      stepCount: 0,
      stepLabel: "",
      progress: 0,
      log: "",
      error: null,
      runId: null,
    };
  }
  return {
    running: false,
    projectId,
    actionId: last.actionId,
    actionName: last.actionName,
    phase: last.status === "ok" ? "done" : last.status === "error" ? "error" : "idle",
    stepIndex: 0,
    stepCount: 0,
    stepLabel: "",
    progress: last.status === "ok" ? 100 : 0,
    log: last.log,
    error: last.error,
    runId: last.id,
  };
}

export function getProjectJob(projectId: number): ActionJob {
  const live = jobs.get(projectId);
  if (live) return live;
  return idleJob(projectId, getLatestRun(projectId));
}

function appendLog(job: ActionJob, text: string): void {
  job.log = tail(job.log + text);
}

function stepLabel(step: ActionStep): string {
  switch (step.type) {
    case "git_pull":
      return "git pull";
    case "command":
      return step.command || "command";
    case "docker_restart":
      return `docker restart ${step.container ?? ""}`.trim();
    case "docker_ensure":
      return `ensure Docker ${step.container ?? ""}`.trim();
    case "compose_up":
      return `compose up ${step.source ?? ""}`.trim();
    case "systemd_restart":
      return `systemctl restart ${step.unit ?? ""}`.trim();
    case "systemd_enable":
      return `systemctl enable ${step.unit ?? ""}`.trim();
    case "systemd_apply":
      return `apply systemd ${step.unit ?? ""}`.trim();
    case "publish":
      return `publish ${step.source ?? ""} → ${step.dest ?? ""}`;
    case "worker_apply":
      return "apply worker";
    default:
      return step.type;
  }
}

function commandExists(bin: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  if (process.platform === "win32") {
    for (const root of pathEnv.split(";").filter(Boolean)) {
      if (fs.existsSync(`${root}\\${bin}.exe`) || fs.existsSync(`${root}\\${bin}.cmd`)) {
        return true;
      }
    }
    return false;
  }
  for (const dir of pathEnv.split(":").filter(Boolean)) {
    if (fs.existsSync(`${dir}/${bin}`)) return true;
  }
  return false;
}

export function projectsCapabilities(): {
  platform: string;
  git: boolean;
  systemd: boolean;
  compose: boolean;
  docker: boolean;
} {
  return {
    platform: process.platform,
    git: gitAvailable(),
    systemd: process.platform === "linux" && commandExists("systemctl"),
    compose: dockerComposeAvailable(),
    docker: dockerAvailable(),
  };
}

function runCommand(
  cwd: string,
  command: string,
  onChunk: (text: string) => void,
  projectId: number
): Promise<void> {
  const isWin = process.platform === "win32";
  const file = isWin ? process.env.ComSpec || "cmd.exe" : "/bin/bash";
  const args = isWin ? ["/d", "/s", "/c", command] : ["-lc", command];
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      env: mergeProjectEnv({
        ...envMapForRuntime(projectId),
        FORCE_COLOR: process.env.FORCE_COLOR || "1",
        CLICOLOR_FORCE: "1",
        npm_config_color: "always",
        TERM: process.env.TERM && process.env.TERM !== "dumb" ? process.env.TERM : "xterm-256color",
      }),
      windowsHide: true,
    });
    let log = "";
    const append = (buf: Buffer) => {
      const text = buf.toString();
      log = tail(log + text);
      onChunk(text);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => reject(err));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ProjectsError(504, "command timed out"));
    }, COMMAND_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new ProjectsError(500, log.trim() || `command exited with code ${code ?? "?"}`)
      );
    });
  });
}

function runSystemctlRestart(unit: string, onChunk: (text: string) => void): Promise<void> {
  return runSystemctl(["restart", unit], onChunk);
}

async function runStep(
  job: ActionJob,
  step: ActionStep,
  project: ProjectSummary
): Promise<void> {
  const account = resolveAccountForProject(project);
  const onChunk = (text: string) => appendLog(job, text);
  const { localPath, branch, remoteUrl } = project;

  switch (step.type) {
    case "git_pull":
      if (!projectHasGit(project) || !projectHasFolder(project)) {
        throw new ProjectsError(400, "this project has no git checkout");
      }
      await gitPull({
        localPath,
        branch,
        account,
        remoteUrl,
        onChunk,
      });
      return;
    case "command":
      if (!step.command) throw new ProjectsError(400, "command is empty");
      if (!projectHasFolder(project)) {
        throw new ProjectsError(400, "this project has no folder to run commands in");
      }
      await runCommand(localPath, step.command, onChunk, project.id);
      return;
    case "docker_restart":
      if (!step.container) throw new ProjectsError(400, "container is empty");
      appendLog(job, `Restarting container ${step.container}…\n`);
      try {
        await containerAction(step.container, "restart");
      } catch (err) {
        if (err instanceof DockerError) {
          throw new ProjectsError(err.status, err.message);
        }
        throw err;
      }
      appendLog(job, "Container restarted.\n");
      return;
    case "docker_ensure": {
      const name = step.container || project.container;
      if (project.managed || (project.serviceKind === "worker" && project.runKind === "docker")) {
        await reconcileWorker(project.id, onChunk);
        appendLog(job, "Managed container applied.\n");
        return;
      }
      if (!name) throw new ProjectsError(400, "container is empty");
      appendLog(job, `Ensuring container ${name}…\n`);
      try {
        await ensureContainer(name, project.boot);
      } catch (err) {
        if (err instanceof DockerError) {
          throw new ProjectsError(err.status, err.message);
        }
        throw err;
      }
      if (project.boot) appendLog(job, "Restart policy: unless-stopped\n");
      appendLog(job, "Container is running.\n");
      return;
    }
    case "compose_up": {
      if (!projectHasFolder(project)) {
        throw new ProjectsError(400, "Compose needs a project folder");
      }
      const file = step.source || project.composeFile || "compose.yaml";
      await composeUp(localPath, file, onChunk, envMapForRuntime(project.id));
      return;
    }
    case "systemd_restart":
      if (!step.unit) throw new ProjectsError(400, "unit is empty");
      appendLog(job, `Restarting ${step.unit}…\n`);
      await runSystemctlRestart(step.unit, onChunk);
      appendLog(job, "Service restarted.\n");
      return;
    case "systemd_enable": {
      const unit = step.unit || project.unit;
      if (!unit) throw new ProjectsError(400, "unit is empty");
      appendLog(job, `Enabling ${unit}…\n`);
      await runSystemctl(["enable", "--now", unit], onChunk);
      await runSystemctlRestart(unit, onChunk);
      appendLog(job, "Service enabled and running.\n");
      return;
    }
    case "systemd_apply": {
      const unit = step.unit || project.unit;
      const start = step.command || project.startCommand;
      if (!unit) throw new ProjectsError(400, "unit is empty");
      if (!start) throw new ProjectsError(400, "start command is empty");
      writeWorkerEnvFile(project.id);
      await applySystemdUnit(project, unit, start, onChunk);
      return;
    }
    case "publish": {
      const from = step.source || project.publishFrom;
      const dest = step.dest || project.publishTo;
      if (!from || !dest) throw new ProjectsError(400, "publish from/to is required");
      await publishFolder(localPath, from, dest, onChunk);
      return;
    }
    case "worker_apply": {
      await reconcileWorker(project.id, onChunk);
      appendLog(job, "Worker applied.\n");
      return;
    }
    default:
      throw new ProjectsError(400, `unknown step type ${(step as ActionStep).type}`);
  }
}

export function startActionRun(projectId: number, actionId: number): ActionJob {
  const live = jobs.get(projectId);
  if (live?.running) {
    throw new ProjectsError(409, "an action is already running for this project");
  }
  const project = requireProject(projectId);
  const action = requireAction(projectId, actionId);
  if (action.steps.length === 0) {
    throw new ProjectsError(400, "this action has no steps");
  }

  const run = insertRun({
    projectId,
    actionId,
    actionName: action.name,
  });

  const job: ActionJob = {
    running: true,
    projectId,
    actionId,
    actionName: action.name,
    phase: "running",
    stepIndex: 0,
    stepCount: action.steps.length,
    stepLabel: stepLabel(action.steps[0]),
    progress: 4,
    log: `Starting “${action.name}” (${action.steps.length} step${action.steps.length === 1 ? "" : "s"})\n`,
    error: null,
    runId: run.id,
  };
  jobs.set(projectId, job);

  void (async () => {
    try {
      for (let i = 0; i < action.steps.length; i++) {
        const step = action.steps[i];
        job.stepIndex = i;
        job.stepLabel = stepLabel(step);
        job.progress = Math.round(((i + 0.15) / action.steps.length) * 100);
        appendLog(job, `\n==> ${i + 1}/${action.steps.length} ${job.stepLabel}\n`);
        await runStep(job, step, project);
        job.progress = Math.round(((i + 1) / action.steps.length) * 100);
      }
      job.phase = "done";
      job.progress = 100;
      job.stepIndex = action.steps.length;
      appendLog(job, "\nDone.\n");
      finishRun(run.id, "ok", job.log, null);
    } catch (err) {
      const message =
        err instanceof ProjectsError ? err.message : (err as Error).message;
      job.phase = "error";
      job.error = message;
      appendLog(job, `\nFAILED: ${message}\n`);
      finishRun(run.id, "error", job.log, message);
    } finally {
      job.running = false;
    }
  })();

  return job;
}

export async function checkProjectRemote(projectId: number): Promise<GitCheckResult> {
  const live = jobs.get(projectId);
  if (live?.running) {
    throw new ProjectsError(409, "an action is already running for this project");
  }
  const project = requireProject(projectId);
  if (!projectHasGit(project) || !projectHasFolder(project)) {
    throw new ProjectsError(400, "this project has no git remote");
  }
  const account = resolveAccountForProject(project);
  return checkRemote({
    localPath: project.localPath,
    branch: project.branch,
    account,
    remoteUrl: project.remoteUrl,
  });
}
