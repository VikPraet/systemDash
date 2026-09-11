import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectsError, projectsDataDir, type ProjectSummary } from "./projects.js";
import { dockerBinPath } from "./docker.js";
import { APP_NAME } from "./brand.js";
import { mergeProjectEnv } from "./projectEnv.js";

const SYSTEMD_TIMEOUT_MS = 60_000;
const COMPOSE_TIMEOUT_MS = 20 * 60_000;
const LOG_TAIL = 16_000;

function tail(text: string): string {
  if (text.length <= LOG_TAIL) return text;
  return `…\n${text.slice(text.length - LOG_TAIL)}`;
}

function isFsRoot(p: string): boolean {
  const n = path.normalize(p);
  return path.parse(n).root === n;
}

export function resolveUnderProject(localPath: string, rel: string): string {
  const trimmed = rel.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    throw new ProjectsError(400, "use a path relative to the project folder");
  }
  if (trimmed.split("/").some((part) => part === "..")) {
    throw new ProjectsError(400, "path cannot contain ..");
  }
  const resolved = path.normalize(path.join(localPath, trimmed));
  const root = path.normalize(localPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ProjectsError(400, "path must stay inside the project folder");
  }
  return resolved;
}

export async function publishFolder(
  localPath: string,
  fromRel: string,
  destAbs: string,
  onChunk: (text: string) => void
): Promise<void> {
  const from = resolveUnderProject(localPath, fromRel);
  const dest = path.normalize(destAbs.trim());
  if (!path.isAbsolute(dest)) {
    throw new ProjectsError(400, "publish destination must be an absolute path");
  }
  if (isFsRoot(dest)) {
    throw new ProjectsError(400, "cannot publish to a drive or filesystem root");
  }
  if (!fs.existsSync(from)) {
    throw new ProjectsError(400, `publish source not found: ${fromRel}`);
  }
  onChunk(`Copying ${from} → ${dest}\n`);
  await fsp.mkdir(dest, { recursive: true });
  await fsp.cp(from, dest, { recursive: true, force: true });
  onChunk("Publish complete.\n");
}

function spawnLogged(
  file: string,
  args: string[],
  opts: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv },
  onChunk: (text: string) => void
): Promise<void> {
  const timeout = opts.timeout ?? SYSTEMD_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env ?? mergeProjectEnv({
        FORCE_COLOR: process.env.FORCE_COLOR || "1",
        CLICOLOR_FORCE: "1",
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
    child.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        reject(new ProjectsError(503, `${file} is not installed or not on PATH`));
        return;
      }
      reject(err);
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ProjectsError(504, `${file} timed out`));
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new ProjectsError(500, log.trim() || `${file} exited with code ${code ?? "?"}`)
      );
    });
  });
}

export function composeUp(
  localPath: string,
  composeFile: string,
  onChunk: (text: string) => void,
  projectEnv?: Record<string, string>
): Promise<void> {
  const file = resolveUnderProject(localPath, composeFile);
  if (!fs.existsSync(file)) {
    throw new ProjectsError(400, `compose file not found: ${composeFile}`);
  }
  onChunk(`docker compose -f ${composeFile} up -d\n`);
  return spawnLogged(
    dockerBinPath(),
    ["compose", "-f", file, "up", "-d"],
    {
      cwd: localPath,
      timeout: COMPOSE_TIMEOUT_MS,
      env: mergeProjectEnv({
        ...projectEnv,
        FORCE_COLOR: process.env.FORCE_COLOR || "1",
        CLICOLOR_FORCE: "1",
        TERM: process.env.TERM && process.env.TERM !== "dumb" ? process.env.TERM : "xterm-256color",
      }),
    },
    onChunk
  );
}

export function composeDown(
  localPath: string,
  composeFile: string,
  onChunk: (text: string) => void
): Promise<void> {
  const file = resolveUnderProject(localPath, composeFile);
  onChunk(`docker compose -f ${composeFile} down -v\n`);
  return spawnLogged(
    dockerBinPath(),
    ["compose", "-f", file, "down", "-v"],
    { cwd: localPath, timeout: COMPOSE_TIMEOUT_MS },
    onChunk
  );
}

function needsSudo(): boolean {
  return (
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    process.getuid() !== 0
  );
}

export function unitFileName(unit: string): string {
  return unit.endsWith(".service") ? unit : `${unit}.service`;
}

export function systemdUnitPath(unit: string): string {
  return path.join(projectsDataDir(), "units", unitFileName(unit));
}

export function installedSystemUnitPath(unit: string): string {
  return `/etc/systemd/system/${unitFileName(unit)}`;
}

export function systemdWorkDir(project: Pick<ProjectSummary, "workDir" | "localPath">): string | null {
  const wd = (project.workDir || project.localPath || "").trim();
  return wd || null;
}

/**
 * Refuse to enable a unit that systemd would crash-loop (missing folder or
 * start file). Throws ProjectsError — does not process.exit.
 */
export function assertSystemdUnitReady(
  project: Pick<ProjectSummary, "workDir" | "localPath">,
  startCommand: string
): void {
  const start = startCommand.trim();
  if (!start) {
    throw new ProjectsError(400, "Cannot enable systemd: start command is empty.");
  }
  const wd = systemdWorkDir(project);
  if (wd) {
    let st: fs.Stats;
    try {
      st = fs.statSync(wd);
    } catch {
      throw new ProjectsError(
        400,
        `Cannot enable systemd: working directory does not exist (${wd}). Clone or publish the app first.`
      );
    }
    if (!st.isDirectory()) {
      throw new ProjectsError(
        400,
        `Cannot enable systemd: working directory is not a folder (${wd}).`
      );
    }
  }
  const nodeScript = start.match(/^(?:\/usr\/bin\/)?node\s+(\S+)/);
  if (nodeScript && !path.isAbsolute(nodeScript[1])) {
    if (!wd) {
      throw new ProjectsError(
        400,
        `Cannot enable systemd: ${nodeScript[1]} is relative but no working directory is set.`
      );
    }
    const script = path.join(wd, nodeScript[1]);
    if (!fs.existsSync(script)) {
      throw new ProjectsError(
        400,
        `Cannot enable systemd: start file not found (${script}). Build the app before enabling start-on-boot.`
      );
    }
  }
}

export function renderSystemdUnit(project: ProjectSummary, startCommand: string): string {
  const exec = startCommand.trim().startsWith("/")
    ? startCommand.trim()
    : `/bin/bash -lc ${JSON.stringify(startCommand.trim())}`;
  const restart =
    project.restartPolicy === "no" ? "no" : project.restartPolicy === "on-failure" ? "on-failure" : "always";
  const desc = project.name.replace(/[\n\r]/g, " ").slice(0, 80);
  const envFile = path.join(projectsDataDir(), "workers", String(project.id), "env");
  const extras: string[] = [];
  // "-" means systemd ignores a missing file instead of failing spawn (Result=resources).
  extras.push(`EnvironmentFile=-${envFile}`);
  if (project.cpuLimit && project.cpuLimit > 0) {
    extras.push(`CPUQuota=${Math.round(project.cpuLimit * 100)}%`);
  }
  if (project.memoryLimitMb && project.memoryLimitMb > 0) {
    extras.push(`MemoryMax=${project.memoryLimitMb}M`);
  }
  const extraBlock = extras.length ? `${extras.join("\n")}\n` : "";
  const wd = systemdWorkDir(project);
  return `[Unit]
Description=${APP_NAME}: ${desc}
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
${wd ? `WorkingDirectory=${wd}\n` : ""}ExecStart=${exec}
Restart=${restart}
RestartSec=${Math.max(1, Math.round((project.restartBackoffMs || 3000) / 1000))}
${extraBlock}
[Install]
WantedBy=multi-user.target
`;
}

export async function writeSystemdUnit(
  project: ProjectSummary,
  unit: string,
  startCommand: string,
  onChunk: (text: string) => void
): Promise<string> {
  const dest = systemdUnitPath(unit);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const body = renderSystemdUnit(project, startCommand);
  await fsp.writeFile(dest, body, "utf8");
  onChunk(`Wrote unit file ${dest}\n`);
  return dest;
}

async function trySpawn(
  file: string,
  args: string[],
  onChunk: (text: string) => void
): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { env: mergeProjectEnv(), windowsHide: true });
    let log = "";
    const append = (buf: Buffer) => {
      const text = buf.toString();
      log = tail(log + text);
      onChunk(text);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => {
      log = tail(log + (err.message || String(err)));
      resolve({ ok: false, log });
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, log: tail(log + "timed out") });
    }, SYSTEMD_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, log });
    });
  });
}

export async function runSystemctl(
  args: string[],
  onChunk: (text: string) => void,
  user = false
): Promise<void> {
  if (process.platform !== "linux") {
    throw new ProjectsError(400, "systemd is only available on Linux");
  }
  const elevate = !user && needsSudo();
  const file = elevate ? "sudo" : "systemctl";
  const full = user
    ? ["--user", ...args]
    : elevate
      ? ["-n", "systemctl", ...args]
      : args;
  onChunk(`${file} ${full.join(" ")}\n`);
  try {
    await spawnLogged(file, full, { timeout: SYSTEMD_TIMEOUT_MS }, onChunk);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (elevate && /sudo: a password is required|sudo: no tty present/i.test(msg)) {
      throw new ProjectsError(
        403,
        `root privileges required — configure passwordless sudo for systemctl, or run ${APP_NAME} as root`
      );
    }
    throw err;
  }
}

async function confirmOrDisableUnit(
  fileName: string,
  user: boolean,
  onChunk: (text: string) => void
): Promise<void> {
  await new Promise((r) => setTimeout(r, 1500));
  try {
    await runSystemctl(["is-active", "--quiet", fileName], onChunk, user);
  } catch {
    onChunk("Unit did not stay active — disabling so it cannot crash-loop.\n");
    try {
      await runSystemctl(["disable", "--now", fileName], onChunk, user);
    } catch {
      // still report the start failure
    }
    throw new ProjectsError(
      400,
      `${fileName} failed to stay running. Beacon disabled it so systemd will not restart it every few seconds. Fix the working directory and start command, then apply again.`
    );
  }
}

export async function applySystemdUnit(
  project: ProjectSummary,
  unit: string,
  startCommand: string,
  onChunk: (text: string) => void
): Promise<void> {
  if (process.platform !== "linux") {
    throw new ProjectsError(400, "systemd apply is only available on Linux");
  }
  assertSystemdUnitReady(project, startCommand);
  const generated = await writeSystemdUnit(project, unit, startCommand, onChunk);
  const fileName = unitFileName(unit);
  const userDir = path.join(os.homedir(), ".config", "systemd", "user");
  const userDest = path.join(userDir, fileName);

  onChunk("Trying user systemd…\n");
  try {
    await fsp.mkdir(userDir, { recursive: true });
    await fsp.copyFile(generated, userDest);
    await runSystemctl(["daemon-reload"], onChunk, true);
    await runSystemctl(["enable", "--now", fileName], onChunk, true);
    await confirmOrDisableUnit(fileName, true, onChunk);
    onChunk(`Enabled user unit ${fileName}\n`);
    if (project.boot) {
      onChunk(
        "Start-on-boot for a user unit needs lingering: loginctl enable-linger $USER\n"
      );
    }
    return;
  } catch (err) {
    if (err instanceof ProjectsError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    onChunk(`User systemd failed: ${msg}\n`);
  }

  const systemDest = installedSystemUnitPath(unit);
  onChunk("Trying system systemd via sudo -n…\n");
  const copy = await trySpawn("sudo", ["-n", "cp", generated, systemDest], onChunk);
  if (copy.ok) {
    await runSystemctl(["daemon-reload"], onChunk, false);
    await runSystemctl(["enable", "--now", fileName], onChunk, false);
    await confirmOrDisableUnit(fileName, false, onChunk);
    onChunk(`Enabled system unit ${fileName}\n`);
    return;
  }

  const cmds = [
    `sudo cp ${generated} ${systemDest}`,
    `sudo systemctl daemon-reload`,
    `sudo systemctl enable --now ${fileName}`,
  ];
  onChunk(
    "Could not install the unit automatically (no passwordless sudo / user systemd).\n" +
      "Install it with:\n  " +
      cmds.join("\n  ") +
      "\n"
  );
  throw new ProjectsError(
    403,
    `unit written to ${generated} — copy it into systemd with the commands in the log`
  );
}

export async function disableManagedSystemdUnit(
  unit: string,
  onChunk: (text: string) => void
): Promise<void> {
  if (process.platform !== "linux") return;
  const fileName = unitFileName(unit);
  try {
    await runSystemctl(["disable", "--now", fileName], onChunk, true);
    return;
  } catch {
    // try system unit
  }
  await runSystemctl(["disable", "--now", fileName], onChunk, false);
}

export async function removeInstalledSystemUnit(
  unit: string,
  onChunk: (text: string) => void
): Promise<void> {
  if (process.platform !== "linux") return;
  const dest = installedSystemUnitPath(unit);
  const rm = await trySpawn("sudo", ["-n", "rm", "-f", dest], onChunk);
  if (rm.ok) {
    try {
      await runSystemctl(["daemon-reload"], onChunk, false);
    } catch {
      // ignore
    }
    onChunk(`removed ${dest}\n`);
  }
}
