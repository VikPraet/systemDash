import crypto from "node:crypto";
import { existsSync, promises as fsp } from "node:fs";
import path from "node:path";
import {
  BACKUPS_DIR,
  DATA_DIR,
  MOUNTS_DIR,
  TRASH_DIR,
  isPathInside,
} from "./paths.js";
import { HttpError } from "./files.js";

export interface TrashItem {
  id: string;
  name: string;
  originalPath: string;
  type: "dir" | "file";
  deletedAt: number;
  deletedBy: string | null;
  sizeBytes: number | null;
}

interface TrashMeta {
  originalPath: string;
  name: string;
  deletedAt: number;
  deletedBy: string | null;
  type: "dir" | "file";
}

const ID_RE = /^[a-f0-9]{32}$/;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function itemDir(id: string): string {
  return path.join(TRASH_DIR, id);
}

function itemPath(id: string): string {
  return path.join(itemDir(id), "item");
}

function metaPath(id: string): string {
  return path.join(itemDir(id), "meta.json");
}

export function isInTrash(target: string): boolean {
  return isPathInside(TRASH_DIR, target);
}

function isProtectedDataPath(target: string): boolean {
  const resolved = path.resolve(target);
  if (path.resolve(DATA_DIR) === resolved) return true;
  if (path.resolve(TRASH_DIR) === resolved) return true;
  if (path.resolve(MOUNTS_DIR) === resolved) return true;
  return isPathInside(BACKUPS_DIR, resolved);
}

async function ensureTrashDir(): Promise<void> {
  await fsp.mkdir(TRASH_DIR, { recursive: true, mode: 0o700 });
}

async function readMeta(id: string): Promise<TrashMeta | null> {
  try {
    const raw = JSON.parse(await fsp.readFile(metaPath(id), "utf8")) as Partial<TrashMeta>;
    if (typeof raw.originalPath !== "string" || typeof raw.name !== "string") return null;
    if (typeof raw.deletedAt !== "number") return null;
    return {
      originalPath: raw.originalPath,
      name: raw.name,
      deletedAt: raw.deletedAt,
      deletedBy: typeof raw.deletedBy === "string" ? raw.deletedBy : null,
      type: raw.type === "dir" ? "dir" : "file",
    };
  } catch {
    return null;
  }
}

async function describeSize(target: string, isDir: boolean): Promise<number | null> {
  try {
    if (!isDir) {
      const st = await fsp.stat(target);
      return st.size;
    }
  } catch {
    return null;
  }
  return null;
}

export async function listTrash(): Promise<TrashItem[]> {
  await ensureTrashDir();
  let names: string[] = [];
  try {
    names = await fsp.readdir(TRASH_DIR);
  } catch {
    return [];
  }
  const items: TrashItem[] = [];
  for (const id of names) {
    if (!ID_RE.test(id)) continue;
    const meta = await readMeta(id);
    if (!meta) continue;
    const stored = itemPath(id);
    let sizeBytes: number | null = null;
    try {
      const st = await fsp.stat(stored);
      sizeBytes = st.isDirectory() ? null : st.size;
    } catch {
      continue;
    }
    items.push({
      id,
      name: meta.name,
      originalPath: meta.originalPath,
      type: meta.type,
      deletedAt: meta.deletedAt,
      deletedBy: meta.deletedBy,
      sizeBytes,
    });
  }
  items.sort((a, b) => b.deletedAt - a.deletedAt);
  return items;
}

async function moveAcross(source: string, dest: string): Promise<void> {
  try {
    await fsp.rename(source, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "EXDEV") throw err;
    await fsp.cp(source, dest, { recursive: true, errorOnExist: true });
    await fsp.rm(source, { recursive: true, force: true });
  }
}

/** Move a filesystem entry into trash. `target` must already be an absolute path. */
export async function trashPath(
  target: string,
  deletedBy: string | null
): Promise<TrashItem> {
  if (isProtectedDataPath(target) && !isInTrash(target)) {
    throw new HttpError(400, "refusing to trash Beacon data files");
  }
  if (!existsSync(target)) throw new HttpError(404, "path not found");

  let st;
  try {
    st = await fsp.lstat(target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") throw new HttpError(403, "permission denied");
    throw new HttpError(500, "failed to trash");
  }

  await ensureTrashDir();
  const id = crypto.randomBytes(16).toString("hex");
  const dir = itemDir(id);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const dest = itemPath(id);
  const meta: TrashMeta = {
    originalPath: target,
    name: path.basename(target),
    deletedAt: Date.now(),
    deletedBy,
    type: st.isDirectory() ? "dir" : "file",
  };
  try {
    await moveAcross(target, dest);
    await fsp.writeFile(metaPath(id), JSON.stringify(meta, null, 2), "utf8");
  } catch (err) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") throw new HttpError(403, "permission denied");
    if (code === "EBUSY") throw new HttpError(409, "file is in use");
    throw new HttpError(500, "failed to trash");
  }
  return {
    id,
    name: meta.name,
    originalPath: meta.originalPath,
    type: meta.type,
    deletedAt: meta.deletedAt,
    deletedBy: meta.deletedBy,
    sizeBytes: await describeSize(dest, meta.type === "dir"),
  };
}

export async function restoreTrashItem(id: string): Promise<TrashItem> {
  if (!ID_RE.test(id)) throw new HttpError(400, "invalid trash id");
  const meta = await readMeta(id);
  if (!meta) throw new HttpError(404, "trash item not found");
  const stored = itemPath(id);
  if (!existsSync(stored)) throw new HttpError(404, "trash item not found");
  if (existsSync(meta.originalPath)) {
    throw new HttpError(
      409,
      `cannot restore — ${meta.originalPath} already exists`
    );
  }
  await fsp.mkdir(path.dirname(meta.originalPath), { recursive: true });
  try {
    await moveAcross(stored, meta.originalPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") throw new HttpError(403, "permission denied");
    throw new HttpError(500, "failed to restore");
  }
  await fsp.rm(itemDir(id), { recursive: true, force: true }).catch(() => {});
  return {
    id,
    name: meta.name,
    originalPath: meta.originalPath,
    type: meta.type,
    deletedAt: meta.deletedAt,
    deletedBy: meta.deletedBy,
    sizeBytes: null,
  };
}

export async function purgeTrashItem(id: string): Promise<void> {
  if (!ID_RE.test(id)) throw new HttpError(400, "invalid trash id");
  const dir = itemDir(id);
  if (!existsSync(dir)) throw new HttpError(404, "trash item not found");
  try {
    await fsp.rm(dir, { recursive: true, force: false });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") throw new HttpError(403, "permission denied");
    throw new HttpError(500, "failed to delete forever");
  }
}

export async function emptyTrash(): Promise<number> {
  const items = await listTrash();
  for (const item of items) {
    await fsp.rm(itemDir(item.id), { recursive: true, force: true }).catch(() => {});
  }
  return items.length;
}

export async function pruneTrash(now = Date.now()): Promise<number> {
  const items = await listTrash();
  let removed = 0;
  for (const item of items) {
    if (now - item.deletedAt < RETENTION_MS) continue;
    await fsp.rm(itemDir(item.id), { recursive: true, force: true }).catch(() => {});
    removed += 1;
  }
  return removed;
}

export async function trashCount(): Promise<number> {
  try {
    return (await listTrash()).length;
  } catch {
    return 0;
  }
}
