import { execFile, execFileSync } from "node:child_process";
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
                process.platform === "linux"
                  ? "permission denied accessing Docker (is the SystemDash user in the docker group?)"
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
        "Fix: sudo usermod -aG docker $(whoami) — then log out/in or restart the SystemDash " +
        "service (sudo systemctl restart systemdash). Pterodactyl/Wings containers use the same daemon."
      );
    }
    if (lower.includes("not installed") || lower.includes("not on path")) {
      return "Install Docker Engine, then: sudo systemctl enable --now docker";
    }
    if (lower.includes("daemon") || lower.includes("cannot connect")) {
      return "Start Docker: sudo systemctl start docker";
    }
    return "On the server, run docker ps as the same user that runs SystemDash to verify access.";
  }
  if (lower.includes("permission denied")) {
    return "Run SystemDash as Administrator, or ensure Docker Desktop is running for your user.";
  }
  if (lower.includes("not installed") || lower.includes("not on path")) {
    return "Install Docker Desktop and restart SystemDash after installation.";
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
