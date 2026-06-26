import { execFile } from "node:child_process";
import fs from "node:fs";

export type UpdateScope = "packages" | "all";

export class UpdatesError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface UpdatesStatus {
  available: boolean;
  platform: string;
  manager: "apt" | "winget" | "softwareupdate" | null;
  pendingCount: number | null;
  packages: string[];
  canInstall: boolean;
  hint: string | null;
}

export interface UpdatesRunResult {
  ok: boolean;
  scope: UpdateScope;
  message: string;
  output: string;
}

const OUTPUT_TAIL = 12_000;
const RUN_TIMEOUT_MS = 20 * 60_000;

function tail(text: string): string {
  if (text.length <= OUTPUT_TAIL) return text;
  return `…\n${text.slice(text.length - OUTPUT_TAIL)}`;
}

function commandExists(bin: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  if (process.platform === "win32") {
    const roots = pathEnv.split(";").filter(Boolean);
    for (const root of roots) {
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

function needsElevation(): boolean {
  return process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0;
}

function run(
  file: string,
  args: string[],
  opts?: { timeout?: number; elevate?: boolean }
): Promise<string> {
  const timeout = opts?.timeout ?? RUN_TIMEOUT_MS;
  const elevate = opts?.elevate ?? needsElevation();
  const cmd = elevate ? "sudo" : file;
  const cmdArgs = elevate ? ["-n", file, ...args] : args;

  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      cmdArgs,
      {
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        timeout,
        env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
      },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ""}${stderr ?? ""}`.trim();
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            reject(new UpdatesError(503, `${file} is not installed`));
            return;
          }
          if (elevate && /sudo: a password is required|sudo: no tty present/i.test(out)) {
            reject(
              new UpdatesError(
                403,
                "root privileges required — configure passwordless sudo for apt, or run SystemDash as root"
              )
            );
            return;
          }
          reject(new UpdatesError(500, out || err.message));
          return;
        }
        resolve(out);
      }
    );
  });
}

function detectManager(): UpdatesStatus["manager"] {
  if (process.platform === "linux" && commandExists("apt-get")) return "apt";
  if (process.platform === "darwin" && commandExists("softwareupdate")) return "softwareupdate";
  if (process.platform === "win32" && commandExists("winget")) return "winget";
  return null;
}

async function aptPending(): Promise<{ count: number; packages: string[] }> {
  const list = await run("apt", ["list", "--upgradable"], { timeout: 120_000, elevate: false });
  const packages = list
    .split("\n")
    .filter((line) => line && !line.startsWith("Listing"))
    .map((line) => line.split("/")[0] ?? line);
  return { count: packages.length, packages: packages.slice(0, 30) };
}

async function wingetPending(): Promise<{ count: number; packages: string[] }> {
  const out = await run(
    "winget",
    ["upgrade", "--disable-interactivity"],
    { timeout: 180_000, elevate: false }
  );
  const packages: string[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^-+$/.test(trimmed)) continue;
    if (/^Name\s+Id\s+/i.test(trimmed)) continue;
    if (/upgrades available|no installed package|no applicable updates/i.test(trimmed)) continue;
    const name = trimmed.split(/\s{2,}/)[0]?.trim();
    if (name) packages.push(name);
  }
  return { count: packages.length, packages: packages.slice(0, 30) };
}

async function macPending(): Promise<{ count: number; packages: string[] }> {
  const out = await run("softwareupdate", ["-l"], { timeout: 120_000, elevate: false });
  const packages = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("*") || line.startsWith("-"))
    .map((line) => line.replace(/^[*-]\s*/, "").split(",")[0]?.trim() ?? line)
    .filter(Boolean);
  return { count: packages.length, packages: packages.slice(0, 30) };
}

export async function getUpdatesStatus(): Promise<UpdatesStatus> {
  const manager = detectManager();
  const base: UpdatesStatus = {
    available: manager !== null,
    platform: process.platform,
    manager,
    pendingCount: null,
    packages: [],
    canInstall: manager !== null,
    hint: null,
  };

  if (!manager) {
    return {
      ...base,
      hint: "No supported package manager found (apt, winget, or softwareupdate).",
    };
  }

  if (needsElevation() && manager === "apt") {
    try {
      await run("sudo", ["-n", "true"], { timeout: 5_000, elevate: false });
    } catch {
      base.canInstall = false;
      base.hint =
        "Configure passwordless sudo for apt (e.g. visudo), or run SystemDash as root.";
    }
  }

  try {
    const pending =
      manager === "apt"
        ? await aptPending()
        : manager === "winget"
          ? await wingetPending()
          : await macPending();
    return { ...base, pendingCount: pending.count, packages: pending.packages };
  } catch (err) {
    const message = err instanceof UpdatesError ? err.message : (err as Error).message;
    return { ...base, hint: message };
  }
}

export async function runSystemUpdate(scope: UpdateScope): Promise<UpdatesRunResult> {
  const manager = detectManager();
  if (!manager) {
    throw new UpdatesError(503, "No supported package manager on this host");
  }

  let output = "";
  if (manager === "apt") {
    output += `${await run("apt-get", ["-qq", "update"], { elevate: true })}\n`;
    if (scope === "packages") {
      output += await run(
        "apt-get",
        ["-y", "-o", "Dpkg::Options::=--force-confdef", "-o", "Dpkg::Options::=--force-confold", "upgrade"],
        { elevate: true }
      );
    } else {
      output += await run(
        "apt-get",
        ["-y", "-o", "Dpkg::Options::=--force-confdef", "-o", "Dpkg::Options::=--force-confold", "full-upgrade"],
        { elevate: true }
      );
    }
  } else if (manager === "winget") {
    output = await run(
      "winget",
      [
        "upgrade",
        "--all",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--disable-interactivity",
      ],
      { elevate: false }
    );
  } else {
    output = await run(
      "softwareupdate",
      ["-ia", "--agree-to-license"],
      { elevate: true }
    );
  }

  const message =
    scope === "all" && manager === "apt"
      ? "System upgrade finished (packages + OS components)."
      : "Package upgrade finished.";

  return {
    ok: true,
    scope,
    message,
    output: tail(output),
  };
}
