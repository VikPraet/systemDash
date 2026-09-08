import { execFile } from "node:child_process";
import { createWriteStream, existsSync, promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { APP_NAME } from "./brand.js";
import { checkpointAuthDb, closeAuthDb } from "./db.js";
import { checkpointHistory, closeHistory } from "./history.js";
import {
  BACKUPS_DIR,
  DATA_DIR,
  isPathInside,
} from "./paths.js";
import { checkpointProjectsDb, closeProjectsDb } from "./projects.js";
import { readAppVersion } from "./version.js";

export class BackupError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type BackupReason = "manual" | "pre-update" | "pre-restore";

export interface BackupSnapshot {
  id: string;
  fileName: string;
  reason: BackupReason;
  createdAt: number;
  sizeBytes: number;
}

export interface BackupManifest {
  format: number;
  app: string;
  version: string;
  createdAt: number;
  reason: BackupReason;
}

const KEEP = 7;
const MANIFEST_FORMAT = 1;
const CONFIRM = "RESTORE";
const FILE_RE =
  /^beacon-(\d{8})-(\d{6})-(manual|pre-update|pre-restore)\.tar\.gz$/;
const ID_RE = /^[A-Za-z0-9._-]{1,128}\.tar\.gz$/;

const INCLUDE_FILES = [
  "auth.db",
  "auth.db-wal",
  "auth.db-shm",
  "history.db",
  "history.db-wal",
  "history.db-shm",
  "projects.db",
  "projects.db-wal",
  "projects.db-shm",
  "settings.json",
  "shares.json",
  "access.json",
];

const INCLUDE_DIRS = ["share-creds", "units"];

let busy = false;

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

function utcStamp(ms = Date.now()): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(
    d.getUTCHours()
  )}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function parseReason(name: string): BackupReason {
  const m = name.match(FILE_RE);
  if (m && (m[3] === "manual" || m[3] === "pre-update" || m[3] === "pre-restore")) {
    return m[3];
  }
  return "manual";
}

function parseCreatedAt(name: string, mtimeMs: number): number {
  const m = name.match(FILE_RE);
  if (!m) return mtimeMs;
  const d = m[1];
  const t = m[2];
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : mtimeMs;
}

function snapshotFromFile(fileName: string, sizeBytes: number, mtimeMs: number): BackupSnapshot {
  return {
    id: fileName,
    fileName,
    reason: parseReason(fileName),
    createdAt: parseCreatedAt(fileName, mtimeMs),
    sizeBytes,
  };
}

async function ensureBackupsDir(): Promise<void> {
  await fsp.mkdir(BACKUPS_DIR, { recursive: true, mode: 0o700 });
}

function resolveSnapshotPath(id: string): string {
  if (!ID_RE.test(id)) throw new BackupError(400, "invalid snapshot id");
  const full = path.resolve(BACKUPS_DIR, id);
  if (!isPathInside(BACKUPS_DIR, full) || path.basename(full) !== id) {
    throw new BackupError(400, "invalid snapshot id");
  }
  return full;
}

async function copyIncluded(fromDir: string, toDir: string): Promise<void> {
  await fsp.mkdir(toDir, { recursive: true, mode: 0o700 });
  for (const name of INCLUDE_FILES) {
    const src = path.join(fromDir, name);
    if (!existsSync(src)) continue;
    await fsp.copyFile(src, path.join(toDir, name));
  }
  for (const name of INCLUDE_DIRS) {
    const src = path.join(fromDir, name);
    if (!existsSync(src)) continue;
    await fsp.cp(src, path.join(toDir, name), { recursive: true });
  }
}

async function clearIncluded(dir: string): Promise<void> {
  for (const name of INCLUDE_FILES) {
    await fsp.rm(path.join(dir, name), { force: true });
  }
  for (const name of INCLUDE_DIRS) {
    await fsp.rm(path.join(dir, name), { recursive: true, force: true });
  }
}

function checkpointAll(): void {
  checkpointAuthDb();
  checkpointHistory();
  checkpointProjectsDb();
}

function closeAllDbs(): void {
  closeHistory();
  closeAuthDb();
  closeProjectsDb();
}

async function pruneSnapshots(): Promise<void> {
  const list = await listSnapshots();
  for (const extra of list.slice(KEEP)) {
    await fsp.rm(resolveSnapshotPath(extra.id), { force: true });
  }
}

export async function listSnapshots(): Promise<BackupSnapshot[]> {
  await ensureBackupsDir();
  let names: string[] = [];
  try {
    names = await fsp.readdir(BACKUPS_DIR);
  } catch {
    return [];
  }
  const out: BackupSnapshot[] = [];
  for (const name of names) {
    if (!name.endsWith(".tar.gz") || !ID_RE.test(name)) continue;
    const full = path.join(BACKUPS_DIR, name);
    try {
      const st = await fsp.stat(full);
      if (!st.isFile()) continue;
      out.push(snapshotFromFile(name, st.size, st.mtimeMs));
    } catch {
      // Skip unreadable entries.
    }
  }
  out.sort((a, b) => b.createdAt - a.createdAt || b.fileName.localeCompare(a.fileName));
  return out;
}

export async function createSnapshot(reason: BackupReason): Promise<BackupSnapshot> {
  if (busy) throw new BackupError(409, "a backup operation is already running");
  busy = true;
  const createdAt = Date.now();
  const fileName = `beacon-${utcStamp(createdAt)}-${reason}.tar.gz`;
  const dest = path.join(BACKUPS_DIR, fileName);
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), "systemdash-backup-"));
  try {
    await ensureBackupsDir();
    checkpointAll();
    await copyIncluded(DATA_DIR, staging);
    const manifest: BackupManifest = {
      format: MANIFEST_FORMAT,
      app: APP_NAME,
      version: readAppVersion(),
      createdAt,
      reason,
    };
    await fsp.writeFile(
      path.join(staging, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
    await exec("tar", ["-czf", dest, "-C", staging, "."]);
    await fsp.chmod(dest, 0o600).catch(() => {});
    await pruneSnapshots();
    const st = await fsp.stat(dest);
    return snapshotFromFile(fileName, st.size, st.mtimeMs);
  } catch (err) {
    await fsp.rm(dest, { force: true }).catch(() => {});
    if (err instanceof BackupError) throw err;
    throw new BackupError(500, (err as Error).message || "failed to create backup");
  } finally {
    busy = false;
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

export function snapshotFilePath(id: string): string {
  const full = resolveSnapshotPath(id);
  if (!existsSync(full)) throw new BackupError(404, "snapshot not found");
  return full;
}

function readManifest(raw: string): BackupManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupError(400, "backup is missing a valid manifest");
  }
  const m = parsed as Partial<BackupManifest>;
  if (m.format !== MANIFEST_FORMAT) {
    throw new BackupError(400, "unsupported backup format");
  }
  if (typeof m.createdAt !== "number") {
    throw new BackupError(400, "backup manifest is incomplete");
  }
  const reason: BackupReason =
    m.reason === "pre-update" || m.reason === "pre-restore" || m.reason === "manual"
      ? m.reason
      : "manual";
  return {
    format: MANIFEST_FORMAT,
    app: typeof m.app === "string" ? m.app : APP_NAME,
    version: typeof m.version === "string" ? m.version : "0.0.0",
    createdAt: m.createdAt,
    reason,
  };
}

async function extractAndValidate(archive: string): Promise<string> {
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), "systemdash-restore-"));
  try {
    await exec("tar", ["-xzf", archive, "-C", staging]);
    const manifestPath = path.join(staging, "manifest.json");
    const authPath = path.join(staging, "auth.db");
    if (!existsSync(manifestPath) || !existsSync(authPath)) {
      throw new BackupError(
        400,
        "archive is not a Beacon data backup (need manifest.json and auth.db)"
      );
    }
    readManifest(await fsp.readFile(manifestPath, "utf8"));
    return staging;
  } catch (err) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    if (err instanceof BackupError) throw err;
    throw new BackupError(400, (err as Error).message || "failed to read backup archive");
  }
}

export function assertRestoreConfirm(value: unknown): void {
  if (typeof value !== "string" || value.trim().toUpperCase() !== CONFIRM) {
    throw new BackupError(400, `Type ${CONFIRM} to confirm restore`);
  }
}

async function applyRestoreFromArchive(archive: string): Promise<void> {
  if (busy) throw new BackupError(409, "a backup operation is already running");
  busy = true;
  let staging: string | null = null;
  try {
    staging = await extractAndValidate(archive);
    busy = false;
    await createSnapshot("pre-restore");
    busy = true;
    closeAllDbs();
    await clearIncluded(DATA_DIR);
    await copyIncluded(staging, DATA_DIR);
  } catch (err) {
    if (err instanceof BackupError) throw err;
    throw new BackupError(500, (err as Error).message || "failed to restore backup");
  } finally {
    busy = false;
    if (staging) await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

export async function restoreSnapshot(id: string): Promise<void> {
  const archive = snapshotFilePath(id);
  await applyRestoreFromArchive(archive);
}

export async function restoreFromUpload(body: Readable): Promise<void> {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "systemdash-restore-up-"));
  const archive = path.join(tmp, "upload.tar.gz");
  try {
    await pipeline(body, createWriteStream(archive));
    const st = await fsp.stat(archive);
    if (st.size < 32) throw new BackupError(400, "backup file is empty");
    await applyRestoreFromArchive(archive);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function requestServiceRestart(): Promise<void> {
  const unit = process.env.SYSTEMDASH_SERVICE?.trim() || "systemdash";
  const elevate =
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    process.getuid() !== 0;
  const cmd = elevate ? "sudo" : "systemctl";
  const args = elevate ? ["-n", "systemctl", "restart", unit] : ["restart", unit];
  try {
    await exec(cmd, args);
  } catch {
    // Dev / non-systemd: process.exit below is enough for tsx watch / systemd Restart=.
  }
}

/** Swap is done; bounce the process so SQLite handles reopen on the new files. */
export function scheduleRestoreRestart(): void {
  setTimeout(() => {
    void requestServiceRestart().finally(() => {
      process.exit(0);
    });
  }, 400);
}

export const RESTORE_CONFIRM = CONFIRM;
