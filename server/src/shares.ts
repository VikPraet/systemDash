import { execFile, spawn } from "node:child_process";
import { promises as fsp, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DATA_DIR, MOUNTS_DIR, CREDS_DIR } from "./paths.js";

export class ShareError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const execFileAsync = promisify(execFile);

export type ShareProtocol = "smb" | "nfs";

export interface NetworkShare {
  id: string;
  name: string;
  protocol: ShareProtocol;
  host: string;
  share: string;
  username: string;
  password: string;
  domain: string;
  createdAt: number;
}

export interface NetworkSharePublic {
  id: string;
  name: string;
  protocol: ShareProtocol;
  host: string;
  share: string;
  username: string;
  domain: string;
  hasPassword: boolean;
  path: string;
  remote: string;
  connected: boolean;
  error: string | null;
}

export interface ShareInput {
  name?: unknown;
  protocol?: unknown;
  host?: unknown;
  share?: unknown;
  username?: unknown;
  password?: unknown;
  domain?: unknown;
}

export interface SharesStatus {
  shares: NetworkSharePublic[];
  platform: string;
  protocols: ShareProtocol[];
  hint: string | null;
}

const SHARES_FILE = path.join(DATA_DIR, "shares.json");

const HOST_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?|\d{1,3}(?:\.\d{1,3}){3})$/;
const SMB_VERS = ["3.1.1", "3.0", "2.1", "2.0"];

let cached: NetworkShare[] | null = null;
const lastError = new Map<string, string>();

function protocolsForPlatform(): ShareProtocol[] {
  if (process.platform === "win32") return ["smb"];
  return ["smb", "nfs"];
}

function platformHint(): string | null {
  return "Use the same username and password Windows asks for when you map this drive. They are stored on this server and reused on reconnect.";
}

function remoteLabel(share: NetworkShare): string {
  if (share.protocol === "nfs") return `${share.host}:${normalizeNfsExport(share.share)}`;
  if (process.platform === "win32") return `\\\\${share.host}\\${share.share}`;
  return `//${share.host}/${share.share}`;
}

export function localSharePath(share: Pick<NetworkShare, "id" | "protocol" | "host" | "share">): string {
  if (process.platform === "win32" && share.protocol === "smb") {
    return `\\\\${share.host}\\${share.share}`;
  }
  return path.join(MOUNTS_DIR, share.id);
}

export function pathsEqual(a: string, b: string): boolean {
  const na = path.normalize(a).replace(/[\\/]+$/, "");
  const nb = path.normalize(b).replace(/[\\/]+$/, "");
  if (process.platform === "win32") return na.toLowerCase() === nb.toLowerCase();
  return na === nb;
}

function isUnder(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function isShareMountsPath(p: string): boolean {
  return isUnder(MOUNTS_DIR, p);
}

function toPublic(share: NetworkShare, connected: boolean): NetworkSharePublic {
  return {
    id: share.id,
    name: share.name,
    protocol: share.protocol,
    host: share.host,
    share: share.share,
    username: share.username,
    domain: share.domain,
    hasPassword: share.password.length > 0,
    path: localSharePath(share),
    remote: remoteLabel(share),
    connected,
    error: connected ? null : lastError.get(share.id) ?? null,
  };
}

async function loadShares(): Promise<NetworkShare[]> {
  if (cached) return cached;
  try {
    const raw = JSON.parse(await fsp.readFile(SHARES_FILE, "utf8")) as {
      shares?: unknown;
    };
    const list = Array.isArray(raw.shares) ? raw.shares : [];
    cached = list.map(coerceShare).filter((s): s is NetworkShare => s !== null);
  } catch {
    cached = [];
  }
  return cached;
}

function coerceShare(input: unknown): NetworkShare | null {
  const s = input as Partial<NetworkShare>;
  if (!s || typeof s !== "object") return null;
  if (typeof s.id !== "string" || !s.id) return null;
  if (s.protocol !== "smb" && s.protocol !== "nfs") return null;
  if (typeof s.host !== "string" || typeof s.share !== "string") return null;
  return {
    id: s.id,
    name: typeof s.name === "string" && s.name.trim() ? s.name.trim() : s.share,
    protocol: s.protocol,
    host: s.host,
    share: s.share,
    username: typeof s.username === "string" ? s.username : "",
    password: typeof s.password === "string" ? s.password : "",
    domain: typeof s.domain === "string" ? s.domain : "",
    createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
  };
}

async function persist(shares: NetworkShare[]): Promise<void> {
  cached = shares;
  await fsp.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fsp.writeFile(SHARES_FILE, JSON.stringify({ shares }, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeNfsExport(share: string): string {
  const s = share.replace(/\\/g, "/").trim();
  if (!s) return "/";
  return s.startsWith("/") ? s : `/${s}`;
}

function parseInput(input: ShareInput): Omit<NetworkShare, "id" | "createdAt"> {
  const protocol = str(input.protocol).toLowerCase() === "nfs" ? "nfs" : "smb";
  let host = str(input.host);
  let share = str(input.share);

  host = host.replace(/^smb:\/\//i, "").replace(/^nfs:\/\//i, "");
  host = host.replace(/^\\\\/, "").replace(/^\/\//, "");

  if (!share && (host.includes("/") || host.includes("\\"))) {
    const parts = host.split(/[/\\]+/).filter(Boolean);
    host = parts.shift() ?? "";
    share = parts.join("/");
    if (protocol === "nfs" && share && !share.startsWith("/")) share = `/${share}`;
  }

  if (protocol === "smb") {
    share = share.replace(/^[/\\]+/, "").replace(/[/\\]+$/, "");
  } else {
    share = normalizeNfsExport(share);
  }

  if (!HOST_RE.test(host)) {
    throw new ShareError(400, "host must be a hostname or IPv4 address");
  }
  if (!share || share === "/") {
    throw new ShareError(400, protocol === "nfs" ? "export path is required" : "share name is required");
  }
  if (/[<>:"|?*\u0000-\u001f]/.test(share) || share.includes("..")) {
    throw new ShareError(400, "share path contains invalid characters");
  }
  if (!protocolsForPlatform().includes(protocol)) {
    throw new ShareError(400, `${protocol.toUpperCase()} shares are not supported on this host`);
  }

  const name = str(input.name) || (protocol === "nfs" ? path.basename(share) || host : share);
  if (name.length > 64) throw new ShareError(400, "name is too long");

  const username = str(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  const domain = str(input.domain);
  if (username.length > 128 || domain.length > 64) {
    throw new ShareError(400, "username or domain is too long");
  }
  if (password.includes("\n") || password.includes("\r")) {
    throw new ShareError(400, "password cannot contain newlines");
  }
  if (protocol === "smb" && password && !username) {
    throw new ShareError(400, "username is required when a password is set");
  }

  return { name, protocol, host, share, username, password, domain };
}

function redact(text: string, secrets: string[]): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      out = out.split(secret).join("***");
    }
  }
  return out.slice(0, 400);
}

async function run(
  command: string,
  args: string[],
  secrets: string[] = [],
  timeout = 20_000
): Promise<{ ok: boolean; code: number; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
    });
    return { ok: true, code: 0, output: redact(`${stdout}\n${stderr}`, secrets) };
  } catch (err) {
    const e = err as {
      code?: string | number;
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const output = redact(`${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`, secrets);
    const status = typeof e.status === "number" ? e.status : Number(e.code);
    return {
      ok: false,
      code: Number.isFinite(status) ? status : 1,
      output,
    };
  }
}

function linuxBin(name: string): boolean {
  return ["/sbin", "/usr/sbin", "/usr/bin", "/bin"].some((dir) =>
    existsSync(path.join(dir, name))
  );
}

async function runElevated(
  file: string,
  args: string[],
  timeout = 20_000
): Promise<{ ok: boolean; output: string }> {
  const root = typeof process.getuid === "function" && process.getuid() === 0;
  if (root) return run(file, args, [], timeout);
  return run("sudo", ["-n", file, ...args], [], timeout);
}

async function writeViaSudo(file: string, contents: string): Promise<boolean> {
  const root = typeof process.getuid === "function" && process.getuid() === 0;
  if (root) {
    try {
      await fsp.writeFile(file, contents, { encoding: "utf8", mode: 0o440 });
      return true;
    } catch {
      return false;
    }
  }
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-n", "tee", "--", file], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 8_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.stdin?.end(contents);
  });
}

async function ensureLinuxPrereqs(protocol: ShareProtocol): Promise<void> {
  if (process.platform !== "linux") return;
  const helper = protocol === "nfs" ? "mount.nfs" : "mount.cifs";
  const pkg = protocol === "nfs" ? "nfs-common" : "cifs-utils";
  if (!linuxBin(helper)) {
    let install = await runElevated("apt-get", ["install", "-y", pkg], 180_000);
    if (!linuxBin(helper)) {
      await runElevated("apt-get", ["update"], 180_000);
      install = await runElevated("apt-get", ["install", "-y", pkg], 180_000);
    }
    if (!linuxBin(helper)) {
      const why = install.ok ? "" : install.output;
      throw new ShareError(
        400,
        `Could not install ${pkg} automatically${why ? `: ${why}` : ""}. The dashboard needs the same passwordless apt sudo used for OS updates.`
      );
    }
  }
  await ensureMountSudoers();
}

let mountSudoReady = false;

async function ensureMountSudoers(): Promise<void> {
  if (mountSudoReady) return;
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    mountSudoReady = true;
    return;
  }
  const probe = await run("sudo", ["-n", "mount", "-V"]);
  if (probe.ok) {
    mountSudoReady = true;
    return;
  }
  let user = "user";
  try {
    user = os.userInfo().username;
  } catch {
    user = process.env.USER || "user";
  }
  const dest = `/etc/sudoers.d/systemdash-mount-${user}`;
  const body =
    `# Added by Beacon when connecting a network drive\n` +
    `${user} ALL=(ALL) NOPASSWD: /bin/mount, /usr/bin/mount, /bin/umount, /usr/bin/umount\n`;
  if (await writeViaSudo(dest, body)) {
    await runElevated("chmod", ["440", dest]);
    const again = await run("sudo", ["-n", "mount", "-V"]);
    mountSudoReady = again.ok;
  }
}

async function runMount(args: string[], secrets: string[]): Promise<{ ok: boolean; output: string }> {
  const direct = await run("mount", args, secrets);
  if (direct.ok) return direct;
  const elevated = await run("sudo", ["-n", "mount", ...args], secrets);
  if (elevated.ok) return elevated;
  return {
    ok: false,
    output: [direct.output, elevated.output].filter(Boolean).join(" — ") || "mount failed",
  };
}

async function runUmount(target: string): Promise<void> {
  const direct = await run("umount", [target]);
  if (direct.ok) return;
  await run("sudo", ["-n", "umount", target]);
}

async function isMountPoint(dir: string): Promise<boolean> {
  try {
    const [st, parent] = await Promise.all([fsp.stat(dir), fsp.stat(path.dirname(dir))]);
    return st.dev !== parent.dev;
  } catch {
    return false;
  }
}

async function canList(dir: string): Promise<boolean> {
  try {
    await fsp.readdir(dir);
    return true;
  } catch {
    return false;
  }
}

export async function isShareConnected(share: NetworkShare): Promise<boolean> {
  const dest = localSharePath(share);
  if (process.platform === "win32") return canList(dest);
  if (!(await isMountPoint(dest))) return false;
  return canList(dest);
}

export async function isNetworkShareRoot(p: string): Promise<boolean> {
  const shares = await loadShares();
  return shares.some((s) => pathsEqual(localSharePath(s), p));
}

async function connectWindowsSmb(share: NetworkShare): Promise<void> {
  const unc = `\\\\${share.host}\\${share.share}`;
  const secrets = share.password ? [share.password] : [];
  const users = windowsUserCandidates(share);

  // Drop any stale session so we can apply (possibly new) credentials.
  await run("net.exe", ["use", unc, "/delete", "/y"], secrets);

  if (share.username && share.password) {
    for (const user of users) {
      await run(
        "cmdkey.exe",
        [`/add:${share.host}`, `/user:${user}`, `/pass:${share.password}`],
        secrets
      );
    }
    await run(
      "cmdkey.exe",
      [`/add:${share.host}/${share.share}`, `/user:${users[0]}`, `/pass:${share.password}`],
      secrets
    );
  }

  let last = "";
  for (const user of users) {
    const args = ["use", unc];
    if (share.password) args.push(share.password);
    args.push(`/user:${user}`, "/persistent:yes");
    const result = await run("net.exe", args, secrets);
    if (result.ok || (await canList(unc))) return;
    last = result.output;
    if (!/1326|86|1219|logon|denied|password|user name/i.test(result.output)) break;
  }

  const stored = await run("net.exe", ["use", unc, "/persistent:yes"], secrets);
  if (stored.ok || (await canList(unc))) return;
  last = last || stored.output;

  throw new ShareError(400, friendlyConnectError(last, "smb"));
}

function windowsUserCandidates(share: NetworkShare): string[] {
  const user = share.username.trim();
  if (!user) return ["guest"];
  const out: string[] = [];
  if (share.domain.trim()) out.push(`${share.domain.trim()}\\${user}`);
  out.push(user);
  out.push(`${share.host}\\${user}`);
  return [...new Set(out)];
}

async function writeCredFile(share: NetworkShare): Promise<string> {
  await fsp.mkdir(CREDS_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(CREDS_DIR, share.id);
  const lines = [
    `username=${share.username || "guest"}`,
    `password=${share.password}`,
  ];
  if (share.domain) lines.push(`domain=${share.domain}`);
  await fsp.writeFile(file, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  return file;
}

async function connectUnixSmb(share: NetworkShare): Promise<void> {
  const dest = localSharePath(share);
  const source = `//${share.host}/${share.share}`;
  await fsp.mkdir(dest, { recursive: true, mode: 0o700 });
  if (await isMountPoint(dest)) {
    if (await canList(dest)) return;
    await runUmount(dest);
  }

  const uid = (() => {
    try {
      return os.userInfo().uid;
    } catch {
      return 0;
    }
  })();
  const gid = (() => {
    try {
      return os.userInfo().gid;
    } catch {
      return 0;
    }
  })();

  const secrets = share.password ? [share.password] : [];
  const credFile = await writeCredFile(share);

  const baseOpts = [
    `uid=${uid}`,
    `gid=${gid}`,
    "iocharset=utf8",
    "file_mode=0664",
    "dir_mode=0775",
    "_netdev",
    "noserverino",
    "nounix",
  ];
  if (share.username) {
    baseOpts.push(`credentials=${credFile}`, "sec=ntlmssp");
  } else {
    baseOpts.push("guest", "noperm");
  }

  let last = "";
  for (const vers of SMB_VERS) {
    const opts = [...baseOpts, `vers=${vers}`].join(",");
    const result = await runMount(["-t", "cifs", source, dest, "-o", opts], secrets);
    if (result.ok) {
      if (await canList(dest)) return;
      await runUmount(dest);
      last = result.output || "mounted but not readable";
      continue;
    }
    last = result.output;
    if (/timeout|timed out|no route|not found|unknown host|name or service/i.test(result.output)) {
      break;
    }
  }

  throw new ShareError(400, friendlyConnectError(last, "smb"));
}

async function connectDarwinSmb(share: NetworkShare): Promise<void> {
  const dest = localSharePath(share);
  await fsp.mkdir(dest, { recursive: true, mode: 0o700 });
  if (await isMountPoint(dest)) {
    if (await canList(dest)) return;
    await runUmount(dest);
  }

  const user = share.username
    ? share.domain
      ? `${share.domain};${share.username}`
      : share.username
    : "guest";
  const auth = share.password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(share.password)}`
    : encodeURIComponent(user);
  const source = `//${auth}@${share.host}/${share.share}`;
  const secrets = share.password ? [share.password, encodeURIComponent(share.password)] : [];
  const result = await run("mount_smbfs", [source, dest], secrets);
  if (result.ok && (await canList(dest))) return;
  throw new ShareError(400, friendlyConnectError(result.output, "smb"));
}

async function connectUnixNfs(share: NetworkShare): Promise<void> {
  const dest = localSharePath(share);
  const source = `${share.host}:${normalizeNfsExport(share.share)}`;
  await fsp.mkdir(dest, { recursive: true, mode: 0o700 });
  if (await isMountPoint(dest)) {
    if (await canList(dest)) return;
    await runUmount(dest);
  }

  const nfsTypes = process.platform === "darwin" ? ["nfs"] : ["nfs4", "nfs"];
  let last = "";
  for (const t of nfsTypes) {
    const result = await runMount(["-t", t, source, dest, "-o", "_netdev"], []);
    if (result.ok) {
      if (await canList(dest)) return;
      await runUmount(dest);
      last = result.output || "mounted but not readable";
      continue;
    }
    last = result.output;
    if (/timeout|timed out|no route|not found|unknown host/i.test(result.output)) break;
  }
  throw new ShareError(400, friendlyConnectError(last, "nfs"));
}

function friendlyConnectError(raw: string, protocol: ShareProtocol): string {
  const text = raw.toLowerCase();
  if (/access is denied|permission denied|logon failure|logon unsuccessful|nt_status_logon_failure|nt_status_access_denied/.test(text)) {
    return "Access denied — check the username, password, and share permissions.";
  }
  if (/network path was not found|no such file|nt_status_bad_network_name|unknown error 1326/.test(text)) {
    return "Share not found — check the host and share name.";
  }
  if (/timeout|timed out|no route|host is down|not responding/.test(text)) {
    return "Could not reach the NAS — check the host address and that it is on this network.";
  }
  if (/cifs|mount.cifs|unknown filesystem type/.test(text)) {
    return "Could not mount SMB. The dashboard tried to install cifs-utils automatically — check that apt sudo works (same as OS updates).";
  }
  if (/nfs|mount.nfs/.test(text) && /unknown filesystem/.test(text)) {
    return "Could not mount NFS. The dashboard tried to install nfs-common automatically — check that apt sudo works (same as OS updates).";
  }
  if (/a password is required|sudo/.test(text) || /operation not permitted/.test(text)) {
    return "Could not mount the share (needs root mount). The dashboard tried to grant passwordless mount automatically; OS updates sudo is not enough for this. Run the service as root, or allow sudo mount/umount for this user.";
  }
  if (protocol === "nfs") return raw.trim() || "Failed to mount NFS export.";
  return raw.trim() || "Failed to connect to the network share.";
}

export async function connectShare(share: NetworkShare): Promise<void> {
  lastError.delete(share.id);
  try {
    if (process.platform === "linux") {
      await ensureLinuxPrereqs(share.protocol);
    }
    if (process.platform === "win32") {
      if (share.protocol !== "smb") {
        throw new ShareError(400, "NFS shares are not supported on Windows");
      }
      await connectWindowsSmb(share);
    } else if (share.protocol === "nfs") {
      await connectUnixNfs(share);
    } else if (process.platform === "darwin") {
      await connectDarwinSmb(share);
    } else {
      await connectUnixSmb(share);
    }
    if (!(await isShareConnected(share))) {
      throw new ShareError(400, "Connected, but the share is not readable.");
    }
  } catch (err) {
    const message = err instanceof ShareError ? err.message : "failed to connect";
    lastError.set(share.id, message);
    throw err;
  }
}

export async function disconnectShare(share: NetworkShare): Promise<void> {
  const dest = localSharePath(share);
  if (process.platform === "win32") {
    await run("net.exe", ["use", dest, "/delete", "/y"]);
    await run("cmdkey.exe", [`/delete:${share.host}`]);
    await run("cmdkey.exe", [`/delete:${share.host}/${share.share}`]);
    return;
  }
  if (await isMountPoint(dest)) {
    await runUmount(dest);
  }
  const cred = path.join(CREDS_DIR, share.id);
  await fsp.rm(cred, { force: true }).catch(() => {});
  if (existsSync(dest) && !(await isMountPoint(dest))) {
    await fsp.rmdir(dest).catch(() => {});
  }
}

export async function listShares(): Promise<SharesStatus> {
  const shares = await loadShares();
  const publics: NetworkSharePublic[] = [];
  for (const share of shares) {
    publics.push(toPublic(share, await isShareConnected(share)));
  }
  return {
    shares: publics,
    platform: process.platform,
    protocols: protocolsForPlatform(),
    hint: platformHint(),
  };
}

export async function addShare(input: ShareInput): Promise<NetworkSharePublic> {
  const parsed = parseInput(input);
  const shares = await loadShares();
  const dup = shares.find(
    (s) =>
      s.protocol === parsed.protocol &&
      s.host.toLowerCase() === parsed.host.toLowerCase() &&
      s.share.toLowerCase() === parsed.share.toLowerCase()
  );
  if (dup) throw new ShareError(409, "that share is already added");

  const share: NetworkShare = {
    ...parsed,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await persist([...shares, share]);
  try {
    await connectShare(share);
  } catch (err) {
    const next = (await loadShares()).filter((s) => s.id !== share.id);
    await persist(next);
    await disconnectShare(share).catch(() => {});
    throw err;
  }
  return toPublic(share, true);
}

export async function reconnectShare(id: string): Promise<NetworkSharePublic> {
  const shares = await loadShares();
  const share = shares.find((s) => s.id === id);
  if (!share) throw new ShareError(404, "share not found");
  await connectShare(share);
  return toPublic(share, true);
}

export async function removeShare(id: string): Promise<void> {
  const shares = await loadShares();
  const share = shares.find((s) => s.id === id);
  if (!share) throw new ShareError(404, "share not found");
  await disconnectShare(share).catch(() => {});
  await persist(shares.filter((s) => s.id !== id));
  lastError.delete(id);
}

/** Best-effort reconnect of saved shares at process start. */
export async function initShares(): Promise<void> {
  const shares = await loadShares();
  for (const share of shares) {
    try {
      if (!(await isShareConnected(share))) await connectShare(share);
    } catch (err) {
      const message = err instanceof ShareError ? err.message : "failed to connect";
      lastError.set(share.id, message);
      console.warn(`Network share "${share.name}" (${remoteLabel(share)}): ${message}`);
    }
  }
}
