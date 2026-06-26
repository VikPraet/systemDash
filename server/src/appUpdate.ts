import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export class AppUpdateError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface InstalledVersion {
  version: string;
  commit: string | null;
  platform: string | null;
  builtAt: string | null;
  fromRelease: boolean;
}

export interface AppUpdateStatus {
  enabled: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  canInstall: boolean;
  repo: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  installRoot: string | null;
  platform: string;
  hint: string | null;
  checkedAt: string | null;
}

export interface AppUpdateJob {
  running: boolean;
  phase: "idle" | "download" | "extract" | "finalize" | "restart" | "done" | "error";
  progress: number;
  log: string;
  error: string | null;
}

interface VersionFile {
  version: string;
  commit?: string;
  platform?: string;
  builtAt?: string;
}

interface GithubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  body: string | null;
  assets: Array<{
    name: string;
    browser_download_url: string;
    url: string;
  }>;
}

const OUTPUT_TAIL = 24_000;
const GITHUB_CACHE_MS = 5 * 60_000;
const DEFAULT_REPO = "VikPraet/systemDash";

let githubCache: { at: number; release: GithubRelease } | null = null;

let appUpdateJob: AppUpdateJob = {
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

function appendLog(line: string): void {
  appUpdateJob.log = tail(appUpdateJob.log ? `${appUpdateJob.log}\n${line}` : line);
}

function parseVersionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.+_-]/)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

function readPackageVersion(): string {
  try {
    const rootPkg = require("../../package.json") as { version?: string };
    if (rootPkg.version) return rootPkg.version;
  } catch {
    // fall through
  }
  return process.env.npm_package_version ?? "0.0.0";
}

function appRoot(): string {
  return process.cwd();
}

function readInstalledVersion(): InstalledVersion {
  const versionPath = path.join(appRoot(), "VERSION.json");
  if (fs.existsSync(versionPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(versionPath, "utf8")) as VersionFile;
      return {
        version: raw.version,
        commit: raw.commit ?? null,
        platform: raw.platform ?? null,
        builtAt: raw.builtAt ?? null,
        fromRelease: true,
      };
    } catch {
      // fall through
    }
  }
  return {
    version: readPackageVersion(),
    commit: null,
    platform: null,
    builtAt: null,
    fromRelease: false,
  };
}

function resolveInstallRoot(): string | null {
  const env = process.env.SYSTEMDASH_HOME?.trim();
  if (env) return path.resolve(env);

  const cwd = appRoot();
  const marker = `${path.sep}releases${path.sep}`;
  const idx = cwd.indexOf(marker);
  if (idx !== -1) return cwd.slice(0, idx);

  const siblingReleases = path.resolve(cwd, "..", "releases");
  if (fs.existsSync(siblingReleases)) {
    return path.dirname(siblingReleases);
  }

  return null;
}

function resolvePlatform(): string {
  const installed = readInstalledVersion();
  if (installed.platform) return installed.platform;
  if (process.platform === "linux") return "linux-x64";
  if (process.platform === "win32") return "win32-x64";
  if (process.platform === "darwin") return "darwin-x64";
  return `${process.platform}-x64`;
}

function resolveRepo(): string | null {
  const env = process.env.GITHUB_REPO?.trim();
  if (env) return env.replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "");
  return DEFAULT_REPO;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SystemDash",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchLatestRelease(force = false): Promise<GithubRelease> {
  const repo = resolveRepo();
  if (!repo) {
    throw new AppUpdateError(503, "GITHUB_REPO is not configured");
  }

  if (!force && githubCache && Date.now() - githubCache.at < GITHUB_CACHE_MS) {
    return githubCache.release;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: githubHeaders(),
  });

  if (res.status === 404) {
    throw new AppUpdateError(404, "No GitHub releases found for this repository");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppUpdateError(
      res.status,
      body.includes("rate limit")
        ? "GitHub API rate limit exceeded — set GITHUB_TOKEN or try again later"
        : `GitHub API error (${res.status})`
    );
  }

  const release = (await res.json()) as GithubRelease;
  githubCache = { at: Date.now(), release };
  return release;
}

function releaseVersion(tag: string): string {
  return tag.replace(/^v/i, "");
}

function findAsset(release: GithubRelease, platform: string): GithubRelease["assets"][number] | null {
  const version = releaseVersion(release.tag_name);
  const expected = `systemdash-${version}-${platform}.tar.gz`;
  return release.assets.find((asset) => asset.name === expected) ?? null;
}

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const headers: Record<string, string> = { ...githubHeaders() };
  if (url.includes("api.github.com")) {
    headers.Accept = "application/octet-stream";
  }

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new AppUpdateError(res.status, `Failed to download release asset (${res.status})`);
  }

  const total = Number(res.headers.get("content-length") ?? 0);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });

  const file = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.length;
      if (!file.write(value)) {
        await new Promise<void>((resolve) => file.once("drain", resolve));
      }
      if (total > 0 && onProgress) {
        onProgress(Math.min(88, Math.round((received / total) * 88)));
      }
    }
  } finally {
    file.end();
    await new Promise<void>((resolve, reject) => {
      file.on("finish", resolve);
      file.on("error", reject);
    });
  }
}

async function restartService(): Promise<void> {
  const unit = process.env.SYSTEMDASH_SERVICE?.trim() || "systemdash";
  const elevate =
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    process.getuid() !== 0;
  const cmd = elevate ? "sudo" : "systemctl";
  const args = elevate ? ["-n", "systemctl", "restart", unit] : ["restart", unit];
  try {
    await exec(cmd, args);
    appendLog(`Requested systemd restart (${unit})`);
  } catch {
    appendLog(
      elevate
        ? "Could not restart via sudo systemctl — add a sudoers rule or restart manually"
        : "Could not restart via systemd — restart the service manually"
    );
  }
}

export function getAppUpdateJob(): AppUpdateJob {
  return { ...appUpdateJob };
}

export async function getAppUpdateStatus(opts?: {
  force?: boolean;
}): Promise<AppUpdateStatus> {
  const installed = readInstalledVersion();
  const installRoot = resolveInstallRoot();
  const platform = resolvePlatform();
  const repo = resolveRepo();

  const base: AppUpdateStatus = {
    enabled: false,
    currentVersion: installed.version,
    latestVersion: null,
    updateAvailable: false,
    canInstall: false,
    repo,
    releaseUrl: null,
    releaseNotes: null,
    publishedAt: null,
    installRoot,
    platform,
    hint: null,
    checkedAt: null,
  };

  if (process.platform !== "linux") {
    return {
      ...base,
      hint: "In-app SystemDash updates are only supported on Linux release installs.",
    };
  }

  if (!installRoot) {
    return {
      ...base,
      hint: installed.fromRelease
        ? "Set SYSTEMDASH_HOME to the install root (parent of releases/)."
        : "Running from source — use install-release.sh for production installs.",
    };
  }

  if (!repo) {
    return {
      ...base,
      hint: "Set GITHUB_REPO (owner/name) to enable release checks.",
    };
  }

  try {
    const release = await fetchLatestRelease(opts?.force ?? false);
    const latestVersion = releaseVersion(release.tag_name);
    const asset = findAsset(release, platform);
    const newer = compareVersions(installed.version, latestVersion) < 0;

    let hint: string | null = null;
    if (!asset) {
      hint = `No release asset for ${platform} in ${release.tag_name}.`;
    }

    return {
      enabled: true,
      currentVersion: installed.version,
      latestVersion,
      updateAvailable: newer,
      canInstall: newer && asset !== null,
      repo,
      releaseUrl: release.html_url,
      releaseNotes: release.body,
      publishedAt: release.published_at,
      installRoot,
      platform,
      hint,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof AppUpdateError ? err.message : (err as Error).message;
    return {
      ...base,
      enabled: true,
      hint: message,
      checkedAt: new Date().toISOString(),
    };
  }
}

export function startAppUpdate(): void {
  if (appUpdateJob.running) {
    throw new AppUpdateError(409, "A SystemDash update is already running");
  }

  void (async () => {
    appUpdateJob = {
      running: true,
      phase: "download",
      progress: 4,
      log: "",
      error: null,
    };

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "systemdash-update-"));

    try {
      const status = await getAppUpdateStatus({ force: true });
      if (!status.installRoot || !status.repo || !status.latestVersion) {
        throw new AppUpdateError(503, status.hint ?? "Update is not available");
      }
      if (!status.updateAvailable || !status.canInstall) {
        throw new AppUpdateError(400, "No newer SystemDash release to install");
      }

      const release = await fetchLatestRelease(true);
      const asset = findAsset(release, status.platform);
      if (!asset) {
        throw new AppUpdateError(404, `Release asset not found for ${status.platform}`);
      }

      const version = status.latestVersion;
      const archive = path.join(tmpDir, asset.name);
      const target = path.join(status.installRoot, "releases", version);
      const current = path.join(status.installRoot, "current");

      appendLog(`Downloading ${asset.name}…`);
      await downloadFile(asset.url || asset.browser_download_url, archive, (pct) => {
        appUpdateJob.progress = Math.max(appUpdateJob.progress, pct);
      });

      appUpdateJob.phase = "extract";
      appUpdateJob.progress = 90;
      appendLog(`Extracting to ${target}…`);
      await fs.promises.rm(target, { recursive: true, force: true });
      await fs.promises.mkdir(target, { recursive: true });
      await exec("tar", ["-xzf", archive, "-C", target]);

      appUpdateJob.phase = "finalize";
      appUpdateJob.progress = 96;
      appendLog(`Pointing current → releases/${version}`);
      await fs.promises.rm(current, { recursive: true, force: true });
      await fs.promises.symlink(target, current);

      appUpdateJob.phase = "restart";
      appUpdateJob.progress = 99;
      appendLog(`Installed SystemDash ${version}`);
      appUpdateJob.phase = "done";
      appUpdateJob.progress = 100;
      appendLog("Restarting SystemDash…");

      setTimeout(() => {
        void restartService().finally(() => {
          process.exit(0);
        });
      }, 400);
    } catch (err) {
      appUpdateJob.phase = "error";
      appUpdateJob.error =
        err instanceof AppUpdateError ? err.message : (err as Error).message;
      appendLog(appUpdateJob.error);
    } finally {
      appUpdateJob.running = false;
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  })();
}

/** Dev helper: path to VERSION.json relative to server package. */
export function installedVersionPath(): string {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(serverDir, "../../VERSION.json");
}
