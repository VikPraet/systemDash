import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  envMapForRuntime,
  listProjects,
  projectHasFolder,
  projectHasGit,
  ProjectsError,
  requireProject,
  resolveAccountForProject,
  updateProject,
  workerScratchDir,
  writeWorkerEnvFile,
  type ProjectSummary,
} from "./projects.js";
import {
  buildManagedImage,
  dockerAvailable,
  ensureContainer,
  findContainer,
  listLabeledContainers,
  removeContainer,
  replicaName,
  removeLabeledResources,
  runManagedContainer,
} from "./docker.js";
import {
  applySystemdUnit,
  composeDown,
  composeUp,
  runSystemctl,
  systemdUnitPath,
} from "./siteDeploy.js";
import { checkRemote, gitPull } from "./gitRemote.js";
import { getSnapshot } from "./stats.js";
import { mergeProjectEnv } from "./projectEnv.js";

const LOG_TAIL = 80_000;
const TICK_MS = 15_000;

interface ReplicaProc {
  child: ChildProcessWithoutNullStreams;
  projectId: number;
  replica: number;
  stopping: boolean;
  retries: number;
}

const procs = new Map<string, ReplicaProc>();
const logs = new Map<number, string>();
const lastAutodeploy = new Map<number, number>();
const lastCronMinute = new Map<number, string>();
const listeners = new Map<number, Set<(chunk: string) => void>>();

let tickTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

function procKey(projectId: number, replica: number): string {
  return `${projectId}:${replica}`;
}

function appendLog(projectId: number, text: string): void {
  const prev = logs.get(projectId) ?? "";
  const next = prev.length + text.length > LOG_TAIL ? `…\n${(prev + text).slice(-LOG_TAIL)}` : prev + text;
  logs.set(projectId, next);
  const subs = listeners.get(projectId);
  if (subs) for (const fn of subs) fn(text);
}

export function workerLogTail(projectId: number): string {
  return logs.get(projectId) ?? "";
}

export function subscribeWorkerLogs(projectId: number, fn: (chunk: string) => void): () => void {
  let set = listeners.get(projectId);
  if (!set) {
    set = new Set();
    listeners.set(projectId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(projectId);
  };
}

export function processReplicaRunning(projectId: number): number {
  let n = 0;
  for (const p of procs.values()) {
    if (p.projectId === projectId && !p.stopping && p.child.exitCode == null) n += 1;
  }
  return n;
}

function desiredReplicas(p: ProjectSummary): number {
  if (p.schedule) return 0;
  if (p.autoscaleEnabled) return p.replicas;
  return Math.max(1, p.replicas);
}

function cronFieldMatch(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  for (const part of field.split(",")) {
    const step = part.split("/");
    const range = step[0];
    const inc = step[1] ? Number(step[1]) : 1;
    if (!Number.isFinite(inc) || inc < 1) return false;
    if (range === "*") {
      if ((value - min) % inc === 0) return true;
      continue;
    }
    const dash = range.split("-");
    const a = Number(dash[0]);
    const b = dash[1] !== undefined ? Number(dash[1]) : a;
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (a < min || b > max || a > b) continue;
    if (value >= a && value <= b && (value - a) % inc === 0) return true;
  }
  return false;
}

export function cronMatches(expr: string, at: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return (
    cronFieldMatch(parts[0], at.getMinutes(), 0, 59) &&
    cronFieldMatch(parts[1], at.getHours(), 0, 23) &&
    cronFieldMatch(parts[2], at.getDate(), 1, 31) &&
    cronFieldMatch(parts[3], at.getMonth() + 1, 1, 12) &&
    cronFieldMatch(parts[4], at.getDay(), 0, 6)
  );
}

function stopReplica(projectId: number, replica: number): void {
  const key = procKey(projectId, replica);
  const live = procs.get(key);
  if (!live) return;
  live.stopping = true;
  try {
    live.child.kill("SIGTERM");
  } catch {
    // gone
  }
  procs.delete(key);
}

export function stopAllReplicas(projectId: number): void {
  for (const [key, p] of [...procs.entries()]) {
    if (p.projectId === projectId) {
      p.stopping = true;
      try {
        p.child.kill("SIGTERM");
      } catch {
        // gone
      }
      procs.delete(key);
    }
  }
}

function spawnNative(project: ProjectSummary, replica: number): void {
  const cmd = project.startCommand?.trim();
  if (!cmd) throw new ProjectsError(400, "start command is required");
  const cwd =
    project.workDir?.trim() ||
    (projectHasFolder(project) ? project.localPath : os.homedir());
  const env = mergeProjectEnv({
    ...envMapForRuntime(project.id),
    BEACON_REPLICA: String(replica),
  });
  const file = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const args = process.platform === "win32" ? ["/c", cmd] : ["-lc", cmd];
  appendLog(project.id, `[replica ${replica}] ${cmd}\n`);
  const child = spawn(file, args, { cwd, env, windowsHide: true }) as ChildProcessWithoutNullStreams;
  const rec: ReplicaProc = { child, projectId: project.id, replica, stopping: false, retries: 0 };
  procs.set(procKey(project.id, replica), rec);
  child.stdout.on("data", (b: Buffer) => appendLog(project.id, b.toString()));
  child.stderr.on("data", (b: Buffer) => appendLog(project.id, b.toString()));
  child.on("error", (err) => appendLog(project.id, `${err.message}\n`));
  child.on("close", (code) => {
    appendLog(project.id, `[replica ${replica}] exited ${code ?? "?"}\n`);
    const still = procs.get(procKey(project.id, replica));
    if (still !== rec) return;
    procs.delete(procKey(project.id, replica));
    if (rec.stopping) return;
    const latest = requireProject(project.id);
    if (latest.serviceKind !== "worker" || latest.runKind !== "process") return;
    if (latest.restartPolicy === "no") return;
    if (latest.restartPolicy === "on-failure" && code === 0) return;
    rec.retries += 1;
    if (
      latest.restartPolicy === "on-failure" &&
      latest.restartMaxRetries != null &&
      rec.retries > latest.restartMaxRetries
    ) {
      appendLog(project.id, "restart retries exhausted\n");
      return;
    }
    const wait = Math.min(60_000, Math.max(500, latest.restartBackoffMs));
    setTimeout(() => {
      try {
        const now = requireProject(project.id);
        if (now.runKind === "process") spawnNative(now, replica);
      } catch {
        // deleted
      }
    }, wait).unref?.();
  });
}

async function reconcileProcess(project: ProjectSummary, want: number): Promise<void> {
  const have = [...procs.values()].filter((p) => p.projectId === project.id && !p.stopping);
  for (const extra of have.filter((p) => p.replica >= want)) {
    stopReplica(project.id, extra.replica);
  }
  for (let i = 0; i < want; i++) {
    const live = procs.get(procKey(project.id, i));
    if (!live || live.child.exitCode != null) spawnNative(project, i);
  }
}

const IMAGE_BY_MARKER: Array<[string, string]> = [
  ["package.json", "node:22-alpine"],
  ["requirements.txt", "python:3.12-slim"],
  ["pyproject.toml", "python:3.12-slim"],
  ["go.mod", "golang:1.23-alpine"],
  ["Cargo.toml", "rust:1-slim"],
  ["composer.json", "php:8.3-cli"],
  ["Gemfile", "ruby:3.3-slim"],
];

const FALLBACK_IMAGE = "alpine:3.20";

/** Picks a base image (or Dockerfile) from what is in the project folder. */
function detectWorkerRuntime(project: ProjectSummary): {
  dockerfile: string | null;
  image: string;
  reason: string;
} {
  if (projectHasFolder(project)) {
    if (fs.existsSync(path.join(project.localPath, "Dockerfile"))) {
      return { dockerfile: "Dockerfile", image: "", reason: "found a Dockerfile" };
    }
    for (const [marker, image] of IMAGE_BY_MARKER) {
      if (fs.existsSync(path.join(project.localPath, marker))) {
        return { dockerfile: null, image, reason: `found ${marker}` };
      }
    }
  }
  return { dockerfile: null, image: FALLBACK_IMAGE, reason: "nothing to go on" };
}

/** The image to run, building the Dockerfile when there is one. Never requires the user to set it. */
async function resolveImage(project: ProjectSummary, onChunk?: (t: string) => void): Promise<string> {
  let dockerfile = project.dockerfile;
  let context = project.buildContext || ".";
  if (!dockerfile && !project.image) {
    const guess = detectWorkerRuntime(project);
    if (guess.dockerfile) {
      onChunk?.(`no image set — building ${guess.dockerfile} (${guess.reason})\n`);
      dockerfile = guess.dockerfile;
      context = ".";
    } else {
      if (!project.startCommand?.trim()) {
        throw new ProjectsError(
          400,
          `no image and no Dockerfile here, so ${guess.image} would start and exit — set a start command or an image`
        );
      }
      onChunk?.(`no image set — using ${guess.image} (${guess.reason})\n`);
      return guess.image;
    }
  }
  if (dockerfile) {
    if (!projectHasFolder(project)) throw new ProjectsError(400, "Dockerfile build needs a project folder");
    return buildManagedImage(project.id, project.localPath, dockerfile, context, onChunk);
  }
  return project.image as string;
}

/**
 * Attached workers point at a container Beacon did not create. Start it when it exists;
 * create it when it does not, which hands ownership to Beacon from then on.
 */
async function reconcileAttached(project: ProjectSummary, onChunk?: (t: string) => void): Promise<void> {
  const name = project.container?.trim() || replicaName(project.id, 0, null);
  const found = await findContainer(name);
  if (found) {
    onChunk?.(`${found.running ? "restarting" : "starting"} ${name}\n`);
    await ensureContainer(name, project.boot);
    return;
  }
  onChunk?.(`container ${name} does not exist — creating it\n`);
  const image = await resolveImage(project, onChunk);
  await runManagedContainer({
    projectId: project.id,
    replica: 0,
    name,
    image,
    command: project.startCommand,
    envFile: writeWorkerEnvFile(project.id),
    workDir: project.workDir,
    cpuLimit: project.cpuLimit,
    memoryLimitMb: project.memoryLimitMb,
    restart: project.restartPolicy,
  });
  updateProject(project.id, { managed: true, container: name });
  onChunk?.(`created ${name} — Beacon manages it from here\n`);
}

async function reconcileDocker(project: ProjectSummary, want: number, onChunk?: (t: string) => void): Promise<void> {
  if (!dockerAvailable()) throw new ProjectsError(503, "Docker is not available on this host");
  if (!project.managed) {
    await reconcileAttached(project, onChunk);
    return;
  }
  const image = await resolveImage(project, onChunk);
  const envFile = writeWorkerEnvFile(project.id);
  const labeled = await listLabeledContainers(project.id);
  const keep = new Set<string>();
  for (let i = 0; i < want; i++) {
    const name = replicaName(project.id, want === 1 ? 0 : i, project.container);
    keep.add(name);
    onChunk?.(`starting ${name}\n`);
    await runManagedContainer({
      projectId: project.id,
      replica: i,
      name,
      image,
      command: project.startCommand,
      envFile,
      workDir: project.workDir,
      cpuLimit: project.cpuLimit,
      memoryLimitMb: project.memoryLimitMb,
      restart: project.restartPolicy,
    });
  }
  for (const c of labeled) {
    if (!keep.has(c.name)) {
      onChunk?.(`removing extra ${c.name}\n`);
      await removeContainer(c.id, true);
    }
  }
}

async function reconcileSystemd(project: ProjectSummary, onChunk?: (t: string) => void): Promise<void> {
  const unit = project.unit || `beacon-w-${project.id}.service`;
  const start = project.startCommand;
  if (!start) throw new ProjectsError(400, "start command is required for systemd workers");
  writeWorkerEnvFile(project.id);
  const chunk = onChunk ?? ((t: string) => appendLog(project.id, t));
  await applySystemdUnit(project, unit, start, chunk);
}

async function reconcileCompose(project: ProjectSummary, onChunk?: (t: string) => void): Promise<void> {
  if (!projectHasFolder(project)) throw new ProjectsError(400, "Compose needs a project folder");
  const file = project.composeFile || "compose.yaml";
  const chunk = onChunk ?? ((t: string) => appendLog(project.id, t));
  await composeUp(project.localPath, file, chunk, envMapForRuntime(project.id));
}

export async function reconcileWorker(projectId: number, onChunk?: (t: string) => void): Promise<void> {
  const project = requireProject(projectId);
  if (project.serviceKind !== "worker") return;
  const log = (t: string) => {
    appendLog(projectId, t);
    onChunk?.(t);
  };
  let want = desiredReplicas(project);
  if (project.autoscaleEnabled) {
    want = await scaledReplicas(project);
  }
  if (project.schedule) want = 0;
  log(`reconcile ${project.runKind} replicas=${want}\n`);
  switch (project.runKind) {
    case "process":
      await reconcileProcess(project, want);
      break;
    case "docker":
      await reconcileDocker(project, want, log);
      break;
    case "systemd":
      if (want > 0) await reconcileSystemd(project, log);
      break;
    case "compose":
      if (want > 0) await reconcileCompose(project, log);
      break;
    default:
      break;
  }
}

async function scaledReplicas(project: ProjectSummary): Promise<number> {
  const min = Math.max(1, project.autoscaleMin);
  const max = Math.max(min, project.autoscaleMax);
  try {
    const snap = await getSnapshot();
    let score = 0;
    let n = 0;
    if (project.autoscaleCpuTarget) {
      score += snap.cpu.loadPercent / project.autoscaleCpuTarget;
      n += 1;
    }
    if (project.autoscaleMemTarget) {
      score += snap.memory.usedPercent / project.autoscaleMemTarget;
      n += 1;
    }
    if (!n) return project.replicas;
    const ratio = score / n;
    if (ratio > 1.1) return Math.min(max, project.replicas + 1);
    if (ratio < 0.5) return Math.max(min, project.replicas - 1);
    return Math.min(max, Math.max(min, project.replicas));
  } catch {
    return Math.min(max, Math.max(min, project.replicas));
  }
}

async function maybeAutodeploy(project: ProjectSummary): Promise<void> {
  if (!project.autodeploy || !projectHasGit(project) || !projectHasFolder(project)) return;
  const interval = Math.max(30, project.autodeployIntervalS) * 1000;
  const last = lastAutodeploy.get(project.id) ?? 0;
  if (Date.now() - last < interval) return;
  lastAutodeploy.set(project.id, Date.now());
  try {
    const check = await checkRemote({
      localPath: project.localPath,
      branch: project.branch,
      account: resolveAccountForProject(project),
      remoteUrl: project.remoteUrl,
    });
    if (!check.ok || check.behind <= 0) return;
    appendLog(project.id, `autodeploy: ${check.behind} behind, pulling\n`);
    await gitPull({
      localPath: project.localPath,
      branch: project.branch,
      account: resolveAccountForProject(project),
      remoteUrl: project.remoteUrl,
      onChunk: (t) => appendLog(project.id, t),
    });
    await reconcileWorker(project.id);
  } catch (err) {
    appendLog(project.id, `autodeploy failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

async function maybeCron(project: ProjectSummary): Promise<void> {
  if (!project.schedule) return;
  const now = new Date();
  const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  if (lastCronMinute.get(project.id) === stamp) return;
  if (!cronMatches(project.schedule, now)) return;
  lastCronMinute.set(project.id, stamp);
  appendLog(project.id, `schedule ${project.schedule} fired\n`);
  if (project.runKind === "process") {
    spawnNative(project, 0);
    return;
  }
  await reconcileWorker(project.id);
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    for (const p of listProjects()) {
      if (p.serviceKind !== "worker") continue;
      await maybeAutodeploy(p);
      await maybeCron(p);
      if (p.autoscaleEnabled && !p.schedule) {
        await reconcileWorker(p.id);
      }
    }
  } catch (err) {
    console.error("worker tick failed:", err);
  } finally {
    ticking = false;
  }
}

export function startWorkerSupervisor(): void {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    void tick();
  }, TICK_MS);
  tickTimer.unref?.();
  for (const p of listProjects()) {
    if (p.serviceKind !== "worker" || !p.boot) continue;
    void reconcileWorker(p.id).catch((err) => {
      console.error(`worker boot reconcile ${p.id} failed:`, err);
    });
  }
}

export interface PurgePreview {
  containers: string[];
  images: string[];
  volumes: string[];
  unit: string | null;
  scratch: string | null;
  localPath: string | null;
  cloneOwned: boolean;
}

export async function purgePreview(project: ProjectSummary): Promise<PurgePreview> {
  const preview: PurgePreview = {
    containers: [],
    images: [],
    volumes: [],
    unit: null,
    scratch: workerScratchDir(project.id),
    localPath: project.clonedByBeacon && project.localPath ? project.localPath : null,
    cloneOwned: !!project.clonedByBeacon,
  };
  if (project.managed && (project.runKind === "docker" || project.runKind === "compose")) {
    try {
      preview.containers = (await listLabeledContainers(project.id)).map((c) => c.name);
    } catch {
      preview.containers = [];
    }
  }
  if (project.managed && project.runKind === "systemd" && project.unit) {
    preview.unit = project.unit;
  }
  return preview;
}

export async function purgeWorker(project: ProjectSummary): Promise<string[]> {
  const notes: string[] = [];
  stopAllReplicas(project.id);
  logs.delete(project.id);
  listeners.delete(project.id);
  if (project.managed && project.runKind === "docker") {
    notes.push(...(await removeLabeledResources(project.id)));
  }
  if (project.managed && project.runKind === "compose" && projectHasFolder(project)) {
    try {
      await composeDown(project.localPath, project.composeFile || "compose.yaml", (t) => notes.push(t.trim()));
    } catch (err) {
      notes.push(`compose down: ${err instanceof Error ? err.message : String(err)}`);
    }
    notes.push(...(await removeLabeledResources(project.id)));
  }
  if (project.managed && project.runKind === "systemd" && project.unit) {
    const unit = project.unit;
    try {
      await runSystemctl(["disable", "--now", unit], (t) => notes.push(t.trim()));
    } catch (err) {
      notes.push(`systemctl: ${err instanceof Error ? err.message : String(err)}`);
    }
    const generated = systemdUnitPath(unit);
    try {
      if (fs.existsSync(generated)) fs.unlinkSync(generated);
      notes.push(`removed ${generated}`);
    } catch (err) {
      notes.push(`unit file: ${err instanceof Error ? err.message : String(err)}`);
    }
    const userDest = path.join(os.homedir(), ".config", "systemd", "user", unit.endsWith(".service") ? unit : `${unit}.service`);
    try {
      if (fs.existsSync(userDest)) fs.unlinkSync(userDest);
    } catch {
      // ignore
    }
  }
  const scratch = workerScratchDir(project.id);
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
    notes.push(`removed ${scratch}`);
  } catch (err) {
    notes.push(`scratch: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (project.clonedByBeacon && project.localPath) {
    try {
      fs.rmSync(project.localPath, { recursive: true, force: true });
      notes.push(`removed clone ${project.localPath}`);
    } catch (err) {
      notes.push(`clone: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return notes.filter(Boolean);
}
