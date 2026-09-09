import { execFile, execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_NAME } from "./brand.js";

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/;

/** Resolves the Docker CLI binary. On Windows, uses the default install path when PATH is stale. */
function resolveDockerBin(): string {
  if (process.env.DOCKER_BIN) return process.env.DOCKER_BIN;
  if (process.platform === "win32") {
    const roots = new Set(
      [
        process.env.ProgramFiles,
        process.env["ProgramFiles(x86)"],
        "C:\\Program Files",
      ].filter(Boolean) as string[]
    );
    for (const root of roots) {
      const exe = path.join(root, "Docker", "Docker", "resources", "bin", "docker.exe");
      if (fs.existsSync(exe)) return exe;
    }
  }
  return "docker";
}

let dockerBin = resolveDockerBin();

export class DockerError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface DockerStatus {
  available: boolean;
  version: string | null;
  error: string | null;
  hint: string | null;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  running: boolean;
}

interface PsRow {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  Ports: string;
}

function runDocker(
  args: string[],
  maxBuffer = 8 * 1024 * 1024,
  opts?: { cwd?: string; timeout?: number }
): Promise<string> {
  return execDocker(dockerBin, args, maxBuffer, true, opts);
}

function execDocker(
  bin: string,
  args: string[],
  maxBuffer: number,
  mayRetry: boolean,
  opts?: { cwd?: string; timeout?: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        maxBuffer,
        windowsHide: true,
        timeout: opts?.timeout ?? 60_000,
        cwd: opts?.cwd,
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || "").trim();
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT" && mayRetry) {
            const next = resolveDockerBin();
            if (next !== bin) {
              dockerBin = next;
              execDocker(next, args, maxBuffer, false, opts).then(resolve, reject);
              return;
            }
          }
          if (code === "ENOENT") {
            reject(
              new DockerError(
                503,
                `Docker is not installed or not on PATH — restart ${APP_NAME} after installing Docker, or set DOCKER_BIN`
              )
            );
            return;
          }
          const lower = msg.toLowerCase();
          if (
            lower.includes("cannot connect") ||
            lower.includes("daemon") ||
            lower.includes("docker desktop") ||
            lower.includes("is the docker daemon running")
          ) {
            reject(new DockerError(503, "Docker daemon is not running"));
            return;
          }
          if (lower.includes("permission denied") || lower.includes("access is denied")) {
            reject(
              new DockerError(
                403,
                process.platform === "linux"
                  ? `permission denied accessing Docker (is the ${APP_NAME} user in the docker group?)`
                  : "permission denied accessing Docker — run elevated or use Docker Desktop"
              )
            );
            return;
          }
          reject(new DockerError(500, msg || "docker command failed"));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

export function assertContainerId(id: string): string {
  const v = id.trim();
  if (!ID_RE.test(v)) {
    throw new DockerError(400, "invalid container id");
  }
  return v;
}

function dockerHint(message: string): string | null {
  const lower = message.toLowerCase();
  if (process.platform === "linux") {
    if (lower.includes("permission denied")) {
      return (
        "Fix: sudo usermod -aG docker $(whoami) — then log out/in or restart the " +
        `${APP_NAME} service (sudo systemctl restart systemdash). Pterodactyl/Wings containers use the same daemon.`
      );
    }
    if (lower.includes("not installed") || lower.includes("not on path")) {
      return "Install Docker Engine, then: sudo systemctl enable --now docker";
    }
    if (lower.includes("daemon") || lower.includes("cannot connect")) {
      return "Start Docker: sudo systemctl start docker";
    }
    return `On the server, run docker ps as the same user that runs ${APP_NAME} to verify access.`;
  }
  if (lower.includes("permission denied")) {
    return `Run ${APP_NAME} as Administrator, or ensure Docker Desktop is running for your user.`;
  }
  if (lower.includes("not installed") || lower.includes("not on path")) {
    return `Install Docker Desktop and restart ${APP_NAME} after installation.`;
  }
  if (lower.includes("daemon") || lower.includes("cannot connect")) {
    return "Start Docker Desktop and wait until the engine is ready.";
  }
  return null;
}

/** Whether the Docker CLI can talk to a running daemon. */
export async function getDockerStatus(): Promise<DockerStatus> {
  try {
    const version = (await runDocker(["version", "--format", "{{.Server.Version}}"])).trim();
    return { available: true, version: version || null, error: null, hint: null };
  } catch (e) {
    const msg =
      e instanceof DockerError ? e.message : "Docker is not available on this host";
    return { available: false, version: null, error: msg, hint: dockerHint(msg) };
  }
}

/** Lists all containers on the host (running and stopped). */
export async function listContainers(): Promise<DockerContainer[]> {
  const out = await runDocker(["ps", "-a", "--no-trunc", "--format", "{{json .}}"]);
  const rows: DockerContainer[] = [];
  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as PsRow;
      const primaryName =
        raw.Names?.replace(/^\//, "").split(",")[0]?.trim() || raw.ID.slice(0, 12);
      rows.push({
        id: raw.ID,
        name: primaryName,
        image: raw.Image,
        status: raw.Status,
        state: raw.State,
        ports: raw.Ports || "",
        running: raw.State === "running",
      });
    } catch {
      // Skip malformed lines rather than failing the whole listing.
    }
  }
  rows.sort((a, b) => {
    if (a.running !== b.running) return a.running ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export async function containerAction(
  id: string,
  action: "start" | "stop" | "restart"
): Promise<void> {
  const cid = assertContainerId(id);
  await runDocker([action, cid]);
}

/** Removes a container. Uses `-f` when `force` so running containers can be removed. */
export async function removeContainer(id: string, force = false): Promise<void> {
  const cid = assertContainerId(id);
  await runDocker(force ? ["rm", "-f", cid] : ["rm", cid]);
}

/** Returns the tail of a container's stdout/stderr log. */
export async function containerLogs(id: string, tail = 300): Promise<string> {
  const cid = assertContainerId(id);
  const lines = Math.max(1, Math.min(5000, Math.round(tail)));
  return runDocker(["logs", "--tail", String(lines), cid], 16 * 1024 * 1024);
}

let composeAvail: boolean | undefined;

export function dockerComposeAvailable(): boolean {
  if (composeAvail !== undefined) return composeAvail;
  try {
    execFileSync(resolveDockerBin(), ["compose", "version"], {
      timeout: 8_000,
      windowsHide: true,
      stdio: "pipe",
    });
    composeAvail = true;
  } catch {
    composeAvail = false;
  }
  return composeAvail;
}

export async function composeServices(
  cwd: string,
  composeFile: string
): Promise<Array<{ name: string; state: string; running: boolean }>> {
  const out = await runDocker(
    ["compose", "-f", composeFile, "ps", "-a", "--format", "json"],
    2 * 1024 * 1024,
    { cwd, timeout: 12_000 }
  );
  const rows: Array<{ name: string; state: string; running: boolean }> = [];
  const chunks = out.trim().startsWith("[")
    ? (() => {
        try {
          const parsed = JSON.parse(out) as unknown;
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [];
        }
      })()
    : out.split(/\r?\n/).flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed) return [];
        try {
          return [JSON.parse(trimmed) as unknown];
        } catch {
          return [];
        }
      });
  for (const raw of chunks) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { Name?: string; Names?: string; Service?: string; State?: string; Status?: string };
    const name = (row.Name || row.Names || row.Service || "").replace(/^\//, "").split(",")[0]?.trim();
    const state = (row.State || row.Status || "").toLowerCase();
    if (!name) continue;
    rows.push({
      name,
      state: row.State || row.Status || "unknown",
      running: state === "running" || state.startsWith("running") || state.includes("up"),
    });
  }
  return rows;
}

export async function findContainer(idOrName: string): Promise<DockerContainer | null> {
  const want = assertContainerId(idOrName);
  const rows = await listContainers();
  return (
    rows.find(
      (c) => c.name === want || c.id === want || c.id.startsWith(want)
    ) ?? null
  );
}

/** Start if stopped, restart if running, optionally set restart-unless-stopped. */
export async function ensureContainer(idOrName: string, boot: boolean): Promise<void> {
  const found = await findContainer(idOrName);
  if (!found) {
    throw new DockerError(
      404,
      `container ${idOrName} not found — create it first (Compose up or docker run)`
    );
  }
  await runDocker([found.running ? "restart" : "start", found.id]);
  if (boot) {
    await runDocker(["update", "--restart", "unless-stopped", found.id]);
  }
}

export function dockerBinPath(): string {
  return dockerBin;
}

export function spawnDockerLogs(
  container: string,
  tail: number
): ChildProcessWithoutNullStreams {
  const cid = assertContainerId(container);
  return spawn(
    dockerBinPath(),
    ["logs", "-f", "--tail", String(Math.max(1, Math.min(2000, tail))), cid],
    { windowsHide: true }
  );
}

export function dockerAvailable(): boolean {
  try {
    execFileSync(resolveDockerBin(), ["version"], {
      timeout: 8_000,
      windowsHide: true,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

export const BEACON_PROJECT_LABEL = "beacon.project";
export const BEACON_MANAGED_LABEL = "beacon.managed";

export function replicaName(projectId: number, replica: number, base?: string | null): string {
  const prefix = (base && ID_RE.test(base) ? base : `beacon-w-${projectId}`).slice(0, 200);
  return replica <= 0 ? prefix : `${prefix}-${replica}`;
}

export async function listLabeledContainers(projectId: number): Promise<DockerContainer[]> {
  const out = await runDocker([
    "ps",
    "-a",
    "--no-trunc",
    "--filter",
    `label=${BEACON_PROJECT_LABEL}=${projectId}`,
    "--format",
    "{{json .}}",
  ]);
  const rows: DockerContainer[] = [];
  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as PsRow;
      const primaryName =
        raw.Names?.replace(/^\//, "").split(",")[0]?.trim() || raw.ID.slice(0, 12);
      rows.push({
        id: raw.ID,
        name: primaryName,
        image: raw.Image,
        status: raw.Status,
        state: raw.State,
        ports: raw.Ports || "",
        running: raw.State === "running",
      });
    } catch {
      // skip
    }
  }
  return rows;
}

export async function listLabeledImages(projectId: number): Promise<string[]> {
  const out = await runDocker([
    "images",
    "--filter",
    `label=${BEACON_PROJECT_LABEL}=${projectId}`,
    "--format",
    "{{.ID}}",
  ]);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function listLabeledVolumes(projectId: number): Promise<string[]> {
  const out = await runDocker([
    "volume",
    "ls",
    "--filter",
    `label=${BEACON_PROJECT_LABEL}=${projectId}`,
    "--format",
    "{{.Name}}",
  ]);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function buildManagedImage(
  projectId: number,
  cwd: string,
  dockerfile: string,
  context: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const tag = `beacon-worker-${projectId}:latest`;
  const args = [
    "build",
    "-t",
    tag,
    "-f",
    dockerfile,
    "--label",
    `${BEACON_PROJECT_LABEL}=${projectId}`,
    "--label",
    `${BEACON_MANAGED_LABEL}=1`,
    context || ".",
  ];
  onChunk?.(`docker ${args.join(" ")}\n`);
  await runDocker(args, 32 * 1024 * 1024, { cwd, timeout: 20 * 60_000 });
  return tag;
}

export async function runManagedContainer(opts: {
  projectId: number;
  replica: number;
  name: string;
  image: string;
  command?: string | null;
  envFile?: string | null;
  workDir?: string | null;
  cpuLimit?: number | null;
  memoryLimitMb?: number | null;
  restart: "always" | "on-failure" | "no";
}): Promise<void> {
  const existing = await findContainer(opts.name);
  if (existing) {
    await runDocker(["rm", "-f", existing.id]);
  }
  const args = [
    "run",
    "-d",
    "--name",
    opts.name,
    "--label",
    `${BEACON_PROJECT_LABEL}=${opts.projectId}`,
    "--label",
    `${BEACON_MANAGED_LABEL}=1`,
    "--label",
    `beacon.replica=${opts.replica}`,
    "--restart",
    opts.restart === "always" ? "unless-stopped" : opts.restart === "on-failure" ? "on-failure" : "no",
  ];
  if (opts.envFile) args.push("--env-file", opts.envFile);
  if (opts.workDir) args.push("-w", opts.workDir);
  if (opts.cpuLimit && opts.cpuLimit > 0) args.push("--cpus", String(opts.cpuLimit));
  if (opts.memoryLimitMb && opts.memoryLimitMb > 0) args.push("--memory", `${opts.memoryLimitMb}m`);
  args.push(opts.image);
  if (opts.command?.trim()) {
    if (process.platform === "win32") {
      args.push("cmd", "/c", opts.command.trim());
    } else {
      args.push("/bin/sh", "-lc", opts.command.trim());
    }
  }
  await runDocker(args, 8 * 1024 * 1024, { timeout: 120_000 });
}

export async function removeLabeledResources(projectId: number): Promise<string[]> {
  const notes: string[] = [];
  try {
    const containers = await listLabeledContainers(projectId);
    for (const c of containers) {
      await runDocker(["rm", "-f", c.id]);
      notes.push(`removed container ${c.name}`);
    }
  } catch (err) {
    notes.push(`containers: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const images = await listLabeledImages(projectId);
    for (const img of images) {
      await runDocker(["rmi", "-f", img]);
      notes.push(`removed image ${img.slice(0, 12)}`);
    }
  } catch (err) {
    notes.push(`images: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const vols = await listLabeledVolumes(projectId);
    for (const v of vols) {
      await runDocker(["volume", "rm", "-f", v]);
      notes.push(`removed volume ${v}`);
    }
  } catch (err) {
    notes.push(`volumes: ${err instanceof Error ? err.message : String(err)}`);
  }
  return notes;
}

export async function inspectContainer(id: string): Promise<{
  mounts: Array<{ Source: string; Destination: string }>;
  args: string[];
  env: string[];
}> {
  const out = await runDocker(["inspect", id]);
  const data = JSON.parse(out) as Array<{
    Mounts?: Array<{ Source?: string; Destination?: string }>;
    Args?: string[];
    Config?: { Env?: string[]; Cmd?: string[] };
  }>;
  const c = data[0];
  return {
    mounts: (c?.Mounts ?? [])
      .filter((m) => m.Source && m.Destination)
      .map((m) => ({ Source: m.Source as string, Destination: m.Destination as string })),
    args: c?.Args ?? c?.Config?.Cmd ?? [],
    env: c?.Config?.Env ?? [],
  };
}
