import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

function runDocker(args: string[], maxBuffer = 8 * 1024 * 1024): Promise<string> {
  return execDocker(dockerBin, args, maxBuffer, true);
}

function execDocker(
  bin: string,
  args: string[],
  maxBuffer: number,
  mayRetry: boolean
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer, windowsHide: true, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || "").trim();
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT" && mayRetry) {
            const next = resolveDockerBin();
            if (next !== bin) {
              dockerBin = next;
              execDocker(next, args, maxBuffer, false).then(resolve, reject);
              return;
            }
          }
          if (code === "ENOENT") {
            reject(
              new DockerError(
                503,
                "Docker is not installed or not on PATH — restart SystemDash after installing Docker, or set DOCKER_BIN"
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
                "permission denied accessing Docker — run elevated or add your user to the docker group"
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

/** Whether the Docker CLI can talk to a running daemon. */
export async function getDockerStatus(): Promise<DockerStatus> {
  try {
    const version = (await runDocker(["version", "--format", "{{.Server.Version}}"])).trim();
    return { available: true, version: version || null, error: null };
  } catch (e) {
    const msg =
      e instanceof DockerError ? e.message : "Docker is not available on this host";
    return { available: false, version: null, error: msg };
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
