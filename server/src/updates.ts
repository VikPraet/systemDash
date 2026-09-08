import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import { APP_NAME } from "./brand.js";

export type UpdateScope = "packages" | "all";
export type UpdatePhase = "refresh" | "apply";

export class UpdatesError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface PendingPackage {
  name: string;
  description: string | null;
  currentVersion: string | null;
  newVersion: string;
  source: string;
}

export interface UpdatesStatus {
  available: boolean;
  platform: string;
  manager: "apt" | "winget" | "softwareupdate" | null;
  pendingCount: number | null;
  items: PendingPackage[];
  canInstall: boolean;
  hint: string | null;
}

export interface UpdateJob {
  running: boolean;
  phase: "idle" | "refresh" | "apply" | "done" | "error";
  progress: number;
  log: string;
  error: string | null;
}

export interface UpdatesPhaseResult {
  ok: boolean;
  phase: UpdatePhase;
  label: string;
  output: string;
}

export interface UpdatesRunResult {
  ok: boolean;
  scope: UpdateScope;
  message: string;
  output: string;
  steps: Array<{ label: string; output: string }>;
}

const OUTPUT_TAIL = 48_000;
const RUN_TIMEOUT_MS = 20 * 60_000;

let updateJob: UpdateJob = {
  running: false,
  phase: "idle",
  progress: 0,
  log: "",
  error: null,
};

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
          rejectCommandError(file, elevate, out || err.message, err);
          return;
        }
        resolve(out);
      }
    );
  });
}

function rejectCommandError(
  file: string,
  elevate: boolean,
  out: string,
  err: Error
): void {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    throw new UpdatesError(503, `${file} is not installed`);
  }
  if (elevate && /sudo: a password is required|sudo: no tty present/i.test(out)) {
    throw new UpdatesError(
      403,
      `root privileges required — configure passwordless sudo for apt, or run ${APP_NAME} as root`
    );
  }
  const lower = out.toLowerCase();
  if (lower.includes("permission denied") || lower.includes("access is denied")) {
    throw new UpdatesError(403, out);
  }
  throw new UpdatesError(500, out || err.message);
}

function runSpawn(
  file: string,
  args: string[],
  onChunk?: (text: string) => void
): Promise<void> {
  const elevate = needsElevation();
  const cmd = elevate ? "sudo" : file;
  const cmdArgs = elevate ? ["-n", file, ...args] : args;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
      windowsHide: true,
    });

    const append = (buf: Buffer) => {
      const text = buf.toString();
      updateJob.log = tail(updateJob.log + text);
      onChunk?.(text);
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => reject(err));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new UpdatesError(504, "update timed out"));
    }, RUN_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new UpdatesError(500, updateJob.log || `command exited with code ${code ?? "?"}`));
    });
  });
}

function detectManager(): UpdatesStatus["manager"] {
  if (process.platform === "linux" && commandExists("apt-get")) return "apt";
  if (process.platform === "darwin" && commandExists("softwareupdate")) return "softwareupdate";
  if (process.platform === "win32" && commandExists("winget")) return "winget";
  return null;
}

function parseAptUpgradableLine(line: string): Omit<PendingPackage, "description"> | null {
  const m =
    /^([^/]+)\/(\S+)\s+(\S+)\s+\S+(?:\s+\[upgradable from:\s*([^\]]+)\])?/.exec(line);
  if (!m) return null;
  const source = m[2].split(",")[0] ?? m[2];
  return {
    name: m[1],
    source,
    newVersion: m[3],
    currentVersion: m[4]?.trim() ?? null,
  };
}

async function packageDescription(name: string): Promise<string | null> {
  try {
    const out = await run("apt-cache", ["show", name], { timeout: 15_000, elevate: false });
    const line = out
      .split("\n")
      .find((l) => l.startsWith("Description-en: ") || l.startsWith("Description: "));
    return line ? line.replace(/^Description(-en)?: /, "").trim() : null;
  } catch {
    return null;
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function aptPending(opts?: {
  refresh?: boolean;
  descriptions?: boolean;
}): Promise<PendingPackage[]> {
  const refresh = opts?.refresh ?? false;
  const descriptions = opts?.descriptions ?? false;

  if (refresh) {
    await run("apt-get", ["update"], { timeout: 300_000, elevate: true });
  }
  const list = await run("apt", ["list", "--upgradable"], { timeout: 60_000, elevate: false });
  const parsed = list
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Listing"))
    .map(parseAptUpgradableLine)
    .filter((p): p is Omit<PendingPackage, "description"> => p !== null);

  if (!descriptions) {
    return parsed.map((pkg) => ({ ...pkg, description: null }));
  }

  const describe = parsed.slice(0, 24);
  const described = await mapPool(describe, 3, async (pkg) => ({
    ...pkg,
    description: await packageDescription(pkg.name),
  }));
  const tail = parsed.slice(24).map((pkg) => ({ ...pkg, description: null }));
  return [...described, ...tail];
}

async function wingetPending(): Promise<PendingPackage[]> {
  const out = await run("winget", ["upgrade", "--disable-interactivity"], {
    timeout: 180_000,
    elevate: false,
  });
  const items: PendingPackage[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^-+$/.test(trimmed)) continue;
    if (/^Name\s+Id\s+/i.test(trimmed)) continue;
    if (/upgrades available|no installed package|no applicable updates/i.test(trimmed)) continue;
    const name = trimmed.split(/\s{2,}/)[0]?.trim();
    if (name) {
      items.push({
        name,
        description: null,
        currentVersion: null,
        newVersion: "upgrade available",
        source: "winget",
      });
    }
  }
  return items;
}

async function macPending(): Promise<PendingPackage[]> {
  const out = await run("softwareupdate", ["-l"], { timeout: 120_000, elevate: false });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("*") || line.startsWith("-"))
    .map((line) => {
      const label = line.replace(/^[*-]\s*/, "").split(",")[0]?.trim() ?? line;
      return {
        name: label,
        description: null,
        currentVersion: null,
        newVersion: "update available",
        source: "softwareupdate",
      };
    });
}

export function getUpdateJob(): UpdateJob {
  return { ...updateJob, log: updateJob.log };
}

let statusCache: { at: number; key: string; data: UpdatesStatus } | null = null;
const statusInFlight = new Map<string, Promise<UpdatesStatus>>();
const STATUS_CACHE_MS = 45_000;

function statusCacheKey(opts?: { refresh?: boolean; descriptions?: boolean }): string {
  return `${opts?.refresh ? 1 : 0}:${opts?.descriptions ? 1 : 0}`;
}

export async function getUpdatesStatus(opts?: {
  refresh?: boolean;
  descriptions?: boolean;
}): Promise<UpdatesStatus> {
  const key = statusCacheKey(opts);
  const existing = statusInFlight.get(key);
  if (existing) return existing;

  const p = getUpdatesStatusInner(opts).finally(() => {
    statusInFlight.delete(key);
  });
  statusInFlight.set(key, p);
  return p;
}

async function getUpdatesStatusInner(opts?: {
  refresh?: boolean;
  descriptions?: boolean;
}): Promise<UpdatesStatus> {
  const cacheKey = statusCacheKey(opts);
  if (
    !opts?.refresh &&
    statusCache?.key === cacheKey &&
    Date.now() - statusCache.at < STATUS_CACHE_MS
  ) {
    return statusCache.data;
  }

  const manager = detectManager();
  const base: UpdatesStatus = {
    available: manager !== null,
    platform: process.platform,
    manager,
    pendingCount: null,
    items: [],
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
        `Configure passwordless sudo for apt (e.g. visudo), or run ${APP_NAME} as root.`;
    }
  }

  try {
    const refresh = opts?.refresh ?? false;
    if (!refresh && manager !== "apt") {
      if (statusCache) return statusCache.data;
      return {
        ...base,
        pendingCount: 0,
        hint: "Click Refresh to scan for updates.",
      };
    }

    const items =
      manager === "apt"
        ? await aptPending({
            refresh,
            descriptions: opts?.descriptions ?? false,
          })
        : manager === "winget"
          ? await wingetPending()
          : await macPending();
    const result = { ...base, pendingCount: items.length, items };
    if (!opts?.refresh) {
      statusCache = { at: Date.now(), key: cacheKey, data: result };
    }
    return result;
  } catch (err) {
    const message = err instanceof UpdatesError ? err.message : (err as Error).message;
    return { ...base, hint: message };
  }
}

function bumpApplyProgress(): void {
  updateJob.progress = Math.min(95, updateJob.progress + 1);
}

export function startUpdateJob(opts: {
  scope: UpdateScope;
  packages?: string[];
}): void {
  if (updateJob.running) {
    throw new UpdatesError(409, "An update is already running");
  }

  const manager = detectManager();
  if (!manager) {
    throw new UpdatesError(503, "No supported package manager on this host");
  }

  updateJob = {
    running: true,
    phase: "refresh",
    progress: 5,
    log: "",
    error: null,
  };

  void (async () => {
    try {
      if (manager === "apt") {
        updateJob.phase = "refresh";
        updateJob.progress = 8;
        await runSpawn("apt-get", ["update"], () => {
          updateJob.progress = Math.min(18, updateJob.progress + 1);
        });

        updateJob.phase = "apply";
        updateJob.progress = 20;

        const dpkgOpts = [
          "-o",
          "Dpkg::Options::=--force-confdef",
          "-o",
          "Dpkg::Options::=--force-confold",
        ];

        if (opts.packages?.length) {
          await runSpawn(
            "apt-get",
            ["install", "-y", ...dpkgOpts, "--only-upgrade", ...opts.packages],
            bumpApplyProgress
          );
        } else {
          await runSpawn(
            "apt-get",
            [
              "-y",
              ...dpkgOpts,
              opts.scope === "all" ? "full-upgrade" : "upgrade",
            ],
            bumpApplyProgress
          );
        }
      } else if (manager === "winget") {
        updateJob.phase = "apply";
        updateJob.progress = 30;
        await runSpawn(
          "winget",
          [
            "upgrade",
            "--all",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--disable-interactivity",
          ],
          bumpApplyProgress
        );
      } else {
        updateJob.phase = "apply";
        updateJob.progress = 30;
        await runSpawn(
          "softwareupdate",
          ["-ia", "--agree-to-license"],
          bumpApplyProgress
        );
      }

      updateJob.phase = "done";
      updateJob.progress = 100;
    } catch (err) {
      updateJob.phase = "error";
      updateJob.error =
        err instanceof UpdatesError ? err.message : (err as Error).message;
    } finally {
      updateJob.running = false;
    }
  })();
}

export async function runUpdatePhase(
  phase: UpdatePhase,
  scope?: UpdateScope
): Promise<UpdatesPhaseResult> {
  const manager = detectManager();
  if (!manager) {
    throw new UpdatesError(503, "No supported package manager on this host");
  }

  if (phase === "apply" && scope !== "packages" && scope !== "all") {
    throw new UpdatesError(400, 'scope must be "packages" or "all" for apply');
  }

  if (manager === "apt") {
    if (phase === "refresh") {
      const output = await run("apt-get", ["update"], { elevate: true });
      return { ok: true, phase, label: "Refreshed package lists", output: tail(output) };
    }
    const output = await run(
      "apt-get",
      [
        "-y",
        "-o",
        "Dpkg::Options::=--force-confdef",
        "-o",
        "Dpkg::Options::=--force-confold",
        scope === "all" ? "full-upgrade" : "upgrade",
      ],
      { elevate: true }
    );
    return {
      ok: true,
      phase,
      label: scope === "all" ? "Applied full system upgrade" : "Applied package upgrades",
      output: tail(output),
    };
  }

  if (phase === "refresh") {
    return {
      ok: true,
      phase,
      label: "Ready",
      output: "Package index check skipped on this platform.",
    };
  }

  if (manager === "winget") {
    const output = await run(
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
    return { ok: true, phase, label: "Applied package upgrades", output: tail(output) };
  }

  const output = await run(
    "softwareupdate",
    ["-ia", "--agree-to-license"],
    { elevate: true }
  );
  return { ok: true, phase, label: "Applied system updates", output: tail(output) };
}

export async function runSystemUpdate(scope: UpdateScope): Promise<UpdatesRunResult> {
  const refresh = await runUpdatePhase("refresh");
  const apply = await runUpdatePhase("apply", scope);
  const steps = [
    { label: refresh.label, output: refresh.output },
    { label: apply.label, output: apply.output },
  ];
  const output = steps.map((s) => `==> ${s.label}\n${s.output}`).join("\n\n");
  const message =
    scope === "all"
      ? "System upgrade finished (packages + OS components)."
      : "Package upgrade finished.";

  return { ok: true, scope, message, output: tail(output), steps };
}
