import { promises as fsp, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import si from "systeminformation";
import type { Role } from "./auth.js";
import { resolveOsUser } from "./osUser.js";
import {
  isNetworkShareRoot,
  isShareMountsPath,
  listShares,
  pathsEqual,
} from "./shares.js";
import { isInTrash, trashCount, trashPath } from "./trash.js";
import { DATA_DIR, isPathInside, TRASH_DIR } from "./paths.js";

export interface FsEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number | null;
  modifiedMs: number | null;
  ext: string | null;
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}

export interface FsRoot {
  name: string;
  path: string;
  kind: "home" | "drive" | "root" | "network" | "trash";
  label: string | null;
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedPercent: number | null;
  shareId?: string;
  protocol?: "smb" | "nfs";
  connected?: boolean;
  error?: string | null;
}

/** Normalize user-supplied paths, fixing bare Windows drives like "C:" -> "C:\". */
function normalizeInput(input: string): string {
  let p = (input ?? "").trim();
  if (!p) throw new HttpError(400, "path is required");
  if (/^[A-Za-z]:$/.test(p)) p += path.sep;
  p = path.normalize(p);
  if (!path.isAbsolute(p)) throw new HttpError(400, "path must be absolute");
  return p;
}

function isFilesystemRoot(p: string): boolean {
  return path.parse(p).root === p;
}

async function isProtectedRoot(p: string): Promise<boolean> {
  if (isFilesystemRoot(p)) return true;
  return isNetworkShareRoot(p);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getRoots(): Promise<FsRoot[]> {
  const sizes = await si.fsSize().catch(() => []);
  const findSize = (predicate: (mount: string) => boolean) =>
    sizes.find((s) => s.mount && predicate(s.mount));
  const osUser = await resolveOsUser();

  const roots: FsRoot[] = [
    {
      name: "Home",
      path: osUser.home || os.homedir(),
      kind: "home",
      label: osUser.username ? osUser.username : null,
      sizeBytes: null,
      usedBytes: null,
      freeBytes: null,
      usedPercent: null,
    },
  ];

  if (process.platform === "win32") {
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      const drive = `${letter}:\\`;
      if (!existsSync(drive)) continue;
      const info = findSize((m) => m.toUpperCase().startsWith(`${letter}:`));
      roots.push({
        name: `${letter}:`,
        path: drive,
        kind: "drive",
        label: null,
        sizeBytes: info?.size ?? null,
        usedBytes: info?.used ?? null,
        freeBytes: info?.available ?? null,
        usedPercent: info ? round(info.use) : null,
      });
    }
  } else {
    // List real mounted filesystems as "drives"; ensure "/" is present.
    // Skip SystemDash NAS mountpoints — those show up as network roots below.
    const mounts = sizes
      .filter(
        (s) =>
          s.mount &&
          (s.mount === "/" || s.mount.startsWith("/")) &&
          !isShareMountsPath(s.mount)
      )
      .sort((a, b) => (a.mount === "/" ? -1 : a.mount.localeCompare(b.mount)));
    for (const m of mounts) {
      roots.push({
        name: m.mount,
        path: m.mount,
        kind: m.mount === "/" ? "root" : "drive",
        label: m.fs ?? null,
        sizeBytes: m.size ?? null,
        usedBytes: m.used ?? null,
        freeBytes: m.available ?? null,
        usedPercent: round(m.use),
      });
    }
    if (!roots.some((r) => r.path === "/")) {
      roots.push({
        name: "/",
        path: "/",
        kind: "root",
        label: null,
        sizeBytes: null,
        usedBytes: null,
        freeBytes: null,
        usedPercent: null,
      });
    }
  }

  const { shares } = await listShares().catch(() => ({ shares: [] }));
  for (const share of shares) {
    const info = findSize((m) => pathsEqual(m, share.path));
    roots.push({
      name: share.name,
      path: share.path,
      kind: "network",
      label: share.remote,
      sizeBytes: info?.size ?? null,
      usedBytes: info?.used ?? null,
      freeBytes: info?.available ?? null,
      usedPercent: info ? round(info.use) : null,
      shareId: share.id,
      protocol: share.protocol,
      connected: share.connected,
      error: share.error,
    });
  }

  const count = await trashCount();
  roots.push({
    name: "Trash",
    path: TRASH_DIR,
    kind: "trash",
    label: count === 1 ? "1 item" : `${count} items`,
    sizeBytes: null,
    usedBytes: null,
    freeBytes: null,
    usedPercent: null,
  });

  return roots;
}

function round(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function pathsInside(parent: string, child: string): boolean {
  if (process.platform === "win32") {
    return isPathInside(parent.toLowerCase(), child.toLowerCase());
  }
  return isPathInside(parent, child);
}

async function realOrResolved(p: string): Promise<string> {
  try {
    return await fsp.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/** True when a path is Beacon data, share creds, or an SSH directory. */
export async function isSensitiveFsPath(target: string): Promise<boolean> {
  const resolved = path.resolve(target);
  const real = await realOrResolved(resolved);
  const osUser = await resolveOsUser();
  const blocked = [
    DATA_DIR,
    path.join(os.homedir(), ".ssh"),
    path.join(osUser.home || os.homedir(), ".ssh"),
  ];
  for (const root of blocked) {
    const rootAbs = path.resolve(root);
    const rootReal = await realOrResolved(rootAbs);
    if (
      pathsInside(rootAbs, resolved) ||
      pathsInside(rootReal, real) ||
      pathsInside(rootAbs, real) ||
      pathsInside(rootReal, resolved)
    ) {
      return true;
    }
  }
  return false;
}

export async function assertFsReadable(input: string, role: Role): Promise<string> {
  const p = normalizeInput(input);
  if (role === "viewer" && (await isSensitiveFsPath(p))) {
    throw new HttpError(403, "permission denied");
  }
  return p;
}

export async function listDirectory(input: string, role: Role = "admin"): Promise<DirListing> {
  const dir = await assertFsReadable(input, role);

  let dirents;
  try {
    dirents = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new HttpError(404, "path not found");
    if (code === "EACCES" || code === "EPERM")
      throw new HttpError(403, "permission denied");
    if (code === "ENOTDIR") throw new HttpError(400, "not a directory");
    throw new HttpError(500, "failed to read directory");
  }

  const entries: FsEntry[] = await Promise.all(
    dirents.map(async (d) => {
      const full = path.join(dir, d.name);
      let isDir = d.isDirectory();
      let size: number | null = null;
      let modifiedMs: number | null = null;
      try {
        const st = await fsp.stat(full);
        isDir = st.isDirectory();
        size = isDir ? null : st.size;
        modifiedMs = st.mtimeMs;
      } catch {
        // Unreadable entry (permissions, broken symlink); keep dirent type.
      }
      return {
        name: d.name,
        path: full,
        type: isDir ? "dir" : "file",
        size,
        modifiedMs,
        ext: isDir ? null : path.extname(d.name).slice(1).toLowerCase() || null,
      } satisfies FsEntry;
    })
  );

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return {
    path: dir,
    parent: (await isProtectedRoot(dir)) ? null : path.dirname(dir),
    entries,
  };
}

/**
 * Recursively sums the size of all files under a directory. The walk is
 * abortable (via `shouldAbort`) so a request the client gave up on stops
 * crawling the disk. Symlinks are skipped to avoid cycles; unreadable entries
 * are ignored. Returns `partial: true` if the walk was aborted early.
 */
export async function directorySize(
  input: string,
  shouldAbort: () => boolean,
  role: Role = "admin"
): Promise<{ bytes: number; partial: boolean }> {
  const dir = await assertFsReadable(input, role);
  let total = 0;
  let partial = false;

  async function walk(d: string): Promise<void> {
    if (shouldAbort()) {
      partial = true;
      return;
    }
    let dirents;
    try {
      dirents = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const de of dirents) {
      if (shouldAbort()) {
        partial = true;
        return;
      }
      if (de.isSymbolicLink()) continue;
      const full = path.join(d, de.name);
      try {
        if (de.isDirectory()) {
          await walk(full);
        } else if (de.isFile()) {
          total += (await fsp.stat(full)).size;
        }
      } catch {
        // Unreadable entry; skip it.
      }
    }
  }

  await walk(dir);
  return { bytes: total, partial };
}

// ---------------------------------------------------------------------------
// Disk usage tree (WizTree-style map)
// ---------------------------------------------------------------------------

export type UsageNodeType = "dir" | "file" | "other" | "free";

export interface UsageNode {
  name: string;
  type: UsageNodeType;
  size: number;
  files: number;
  ext: string | null;
  children?: UsageNode[];
}

export interface UsageLargestFile {
  name: string;
  path: string;
  size: number;
  ext: string | null;
}

export interface UsageProgress {
  bytes: number;
  files: number;
  dirs: number;
  scanning: string;
}

export interface UsageTree {
  path: string;
  name: string;
  size: number;
  files: number;
  dirs: number;
  partial: boolean;
  elapsedMs: number;
  tree: UsageNode;
  largest: UsageLargestFile[];
}

const USAGE_FS_CONCURRENCY = 24;
const USAGE_KEEP_FILES_PER_DIR = 40;
const USAGE_MAX_CHILDREN = 40;
const USAGE_MAX_NODES = 7000;
const USAGE_TOP_FILES = 200;
const LINUX_VIRTUAL_FS = new Set(["/proc", "/sys", "/dev", "/run"]);

function createLimiter(max: number) {
  let active = 0;
  const wait: Array<() => void> = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => wait.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      wait.shift()?.();
    }
  };
}

function isVirtualFs(full: string): boolean {
  if (process.platform === "win32") return false;
  const n = full.replaceAll("\\", "/");
  if (LINUX_VIRTUAL_FS.has(n)) return true;
  for (const root of LINUX_VIRTUAL_FS) {
    if (n.startsWith(`${root}/`)) return true;
  }
  return false;
}

class TopFiles {
  private items: UsageLargestFile[] = [];
  constructor(private n: number) {}

  add(item: UsageLargestFile) {
    if (this.items.length < this.n) {
      this.items.push(item);
      if (this.items.length === this.n) this.heapify();
      return;
    }
    if (item.size <= this.items[0].size) return;
    this.items[0] = item;
    this.siftDown(0);
  }

  toArray(): UsageLargestFile[] {
    return [...this.items].sort((a, b) => b.size - a.size);
  }

  private heapify() {
    for (let i = Math.floor(this.items.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  private siftDown(i: number) {
    const n = this.items.length;
    while (true) {
      let smallest = i;
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      if (l < n && this.items[l].size < this.items[smallest].size) smallest = l;
      if (r < n && this.items[r].size < this.items[smallest].size) smallest = r;
      if (smallest === i) return;
      const tmp = this.items[i];
      this.items[i] = this.items[smallest];
      this.items[smallest] = tmp;
      i = smallest;
    }
  }
}

class DirFileKeeper {
  private items: UsageNode[] = [];
  otherBytes = 0;
  otherFiles = 0;

  constructor(private maxKeep: number) {}

  add(name: string, size: number, ext: string | null) {
    const node: UsageNode = { name, type: "file", size, files: 1, ext };
    if (this.items.length < this.maxKeep) {
      this.items.push(node);
      return;
    }
    let minI = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.items[i].size < this.items[minI].size) minI = i;
    }
    if (size > this.items[minI].size) {
      this.otherBytes += this.items[minI].size;
      this.otherFiles += this.items[minI].files;
      this.items[minI] = node;
    } else {
      this.otherBytes += size;
      this.otherFiles++;
    }
  }

  finish(): UsageNode[] {
    const out = [...this.items].sort((a, b) => b.size - a.size);
    if (this.otherFiles > 0) {
      out.push({
        name: "(other files)",
        type: "other",
        size: this.otherBytes,
        files: this.otherFiles,
        ext: null,
      });
    }
    return out;
  }
}

function countUsageNodes(node: UsageNode): number {
  let n = 1;
  if (node.children) {
    for (const c of node.children) n += countUsageNodes(c);
  }
  return n;
}

function pruneUsageNode(node: UsageNode, budget: number, parentSize: number): number {
  if (!node.children?.length) return 1;
  const threshold = Math.max(parentSize * 0.002, 1);
  const sorted = [...node.children].sort((a, b) => b.size - a.size);
  const kept: UsageNode[] = [];
  let otherSize = 0;
  let otherFiles = 0;

  for (const child of sorted) {
    if (cTypeKeep(child, kept.length, threshold)) {
      kept.push(child);
    } else {
      otherSize += child.size;
      otherFiles += child.files;
    }
  }

  const existingOther = kept.findIndex((c) => c.type === "other");
  if (otherFiles > 0) {
    if (existingOther >= 0) {
      kept[existingOther] = {
        ...kept[existingOther],
        size: kept[existingOther].size + otherSize,
        files: kept[existingOther].files + otherFiles,
      };
    } else {
      kept.push({
        name: "(other files)",
        type: "other",
        size: otherSize,
        files: otherFiles,
        ext: null,
      });
    }
  }

  kept.sort((a, b) => b.size - a.size);
  const capped = kept.slice(0, USAGE_MAX_CHILDREN);
  if (capped.length < kept.length) {
    let extraSize = 0;
    let extraFiles = 0;
    for (const c of kept.slice(USAGE_MAX_CHILDREN)) {
      extraSize += c.size;
      extraFiles += c.files;
    }
    const other = capped.find((c) => c.type === "other");
    if (other) {
      other.size += extraSize;
      other.files += extraFiles;
    } else {
      capped.push({
        name: "(other files)",
        type: "other",
        size: extraSize,
        files: extraFiles,
        ext: null,
      });
    }
  }

  const childBudget = Math.max(
    2,
    Math.floor((budget - 1) / Math.max(1, capped.length))
  );
  let used = 1;
  for (const child of capped) {
    used += pruneUsageNode(child, childBudget, node.size);
  }
  node.children = capped;
  return used;
}

function cTypeKeep(child: UsageNode, kept: number, threshold: number): boolean {
  if (child.type === "free") return true;
  if (kept < 12) return true;
  if (child.size >= threshold) return true;
  if (child.type === "dir" && kept < USAGE_MAX_CHILDREN) return true;
  return false;
}

/**
 * Walks a directory tree and returns a pruned size map plus the largest files.
 * Progress is reported periodically so the UI can show a live scan. Symlinks
 * and Linux virtual filesystems are skipped. Aborting marks the result partial.
 */
export async function scanUsageTree(
  input: string,
  opts: {
    shouldAbort: () => boolean;
    onProgress?: (progress: UsageProgress) => void;
    role?: Role;
  }
): Promise<UsageTree> {
  const dir = await assertFsReadable(input, opts.role ?? "admin");
  await assertDirectory(dir);

  const started = Date.now();
  const limit = createLimiter(USAGE_FS_CONCURRENCY);
  const largest = new TopFiles(USAGE_TOP_FILES);
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  let partial = false;
  let scanning = dir;
  let lastProgress = 0;

  function emit() {
    const now = Date.now();
    if (now - lastProgress < 180 && !opts.shouldAbort()) {
      // Keep the first and last ticks; throttle the rest.
      if (lastProgress !== 0) return;
    }
    lastProgress = now;
    opts.onProgress?.({ bytes, files, dirs, scanning });
  }

  async function walk(current: string): Promise<UsageNode> {
    const node: UsageNode = {
      name: path.basename(current) || current,
      type: "dir",
      size: 0,
      files: 0,
      ext: null,
      children: [],
    };
    if (opts.shouldAbort()) {
      partial = true;
      return node;
    }
    dirs++;
    scanning = current;
    emit();

    let dirents;
    try {
      dirents = await limit(() => fsp.readdir(current, { withFileTypes: true }));
    } catch {
      return node;
    }

    const keeper = new DirFileKeeper(USAGE_KEEP_FILES_PER_DIR);
    const subdirs: string[] = [];

    for (const de of dirents) {
      if (opts.shouldAbort()) {
        partial = true;
        break;
      }
      if (de.isSymbolicLink()) continue;
      const full = path.join(current, de.name);
      if (isVirtualFs(full)) continue;
      if (de.isDirectory()) {
        subdirs.push(full);
        continue;
      }
      if (!de.isFile()) continue;
      try {
        const st = await limit(() => fsp.lstat(full));
        if (st.isSymbolicLink() || !st.isFile()) continue;
        files++;
        bytes += st.size;
        const ext = path.extname(de.name).slice(1).toLowerCase() || null;
        keeper.add(de.name, st.size, ext);
        largest.add({ name: de.name, path: full, size: st.size, ext });
      } catch {
        // Unreadable file; skip it.
      }
    }

    const childDirs: UsageNode[] = [];
    let next = 0;
    const workers = Math.min(8, subdirs.length);
    async function dirWorker() {
      while (next < subdirs.length) {
        if (opts.shouldAbort()) {
          partial = true;
          return;
        }
        const idx = next++;
        childDirs.push(await walk(subdirs[idx]));
      }
    }
    await Promise.all(Array.from({ length: workers }, () => dirWorker()));

    const children = [
      ...childDirs.filter((c) => c.size > 0 || (c.children && c.children.length > 0)),
      ...keeper.finish(),
    ].sort((a, b) => b.size - a.size);

    node.children = children;
    node.files = children.reduce((sum, c) => sum + c.files, 0);
    node.size = children.reduce((sum, c) => sum + c.size, 0);
    return node;
  }

  const tree = await walk(dir);
  tree.name = path.basename(dir) || dir;
  pruneUsageNode(tree, USAGE_MAX_NODES, Math.max(tree.size, 1));
  if (countUsageNodes(tree) > USAGE_MAX_NODES) {
    pruneUsageNode(tree, USAGE_MAX_NODES, Math.max(tree.size, 1));
  }
  opts.onProgress?.({ bytes, files, dirs, scanning: dir });

  return {
    path: dir,
    name: tree.name,
    size: tree.size,
    files,
    dirs,
    partial,
    elapsedMs: Date.now() - started,
    tree,
    largest: largest.toArray(),
  };
}

/** Validates a path points to a readable file and returns its absolute path. */
export async function resolveFile(input: string, role: Role = "admin"): Promise<string> {
  const file = await assertFsReadable(input, role);
  let st;
  try {
    st = await fsp.stat(file);
  } catch {
    throw new HttpError(404, "file not found");
  }
  if (st.isDirectory()) throw new HttpError(400, "path is a directory");
  return file;
}

// ---------------------------------------------------------------------------
// Text editing (read / write)
// ---------------------------------------------------------------------------

const MAX_EDIT_BYTES = 5 * 1024 * 1024; // 5 MB

/** Reads a (text) file for editing, rejecting directories, huge, or binary files. */
export async function readTextFile(
  input: string,
  role: Role = "admin"
): Promise<{ path: string; content: string }> {
  const file = await assertFsReadable(input, role);
  let st;
  try {
    st = await fsp.stat(file);
  } catch (err) {
    throw fsError(err, "failed to read file");
  }
  if (st.isDirectory()) throw new HttpError(400, "path is a directory");
  if (st.size > MAX_EDIT_BYTES)
    throw new HttpError(413, "file is too large to edit (max 5 MB)");

  let buf: Buffer;
  try {
    buf = await fsp.readFile(file);
  } catch (err) {
    throw fsError(err, "failed to read file");
  }
  // A NUL byte is a strong signal the file isn't text we can safely edit.
  if (buf.includes(0)) throw new HttpError(415, "file appears to be binary");
  return { path: file, content: buf.toString("utf8") };
}

/** Writes text content to a file (creating it if needed), refusing directories. */
export async function writeTextFile(
  input: string,
  content: string
): Promise<FsEntry> {
  const file = normalizeInput(input);
  if (typeof content !== "string")
    throw new HttpError(400, "content must be a string");
  if (existsSync(file)) {
    const st = await fsp.stat(file);
    if (st.isDirectory()) throw new HttpError(400, "path is a directory");
  }
  try {
    await fsp.writeFile(file, content, "utf8");
  } catch (err) {
    throw fsError(err, "failed to save file");
  }
  return describe(file);
}

// ---------------------------------------------------------------------------
// Mutations (create / rename / move / copy / delete / upload)
// ---------------------------------------------------------------------------

/** Maps Node fs error codes to friendly HttpErrors with sensible status codes. */
function fsError(err: unknown, fallback: string): HttpError {
  const code = (err as NodeJS.ErrnoException)?.code;
  switch (code) {
    case "EACCES":
    case "EPERM":
      return new HttpError(403, "permission denied");
    case "ENOENT":
      return new HttpError(404, "path not found");
    case "EEXIST":
      return new HttpError(409, "a file or folder with that name already exists");
    case "ENOTDIR":
      return new HttpError(400, "not a directory");
    case "ENOTEMPTY":
      return new HttpError(409, "directory is not empty");
    case "EBUSY":
      return new HttpError(409, "file is in use");
    default:
      return new HttpError(500, fallback);
  }
}

/**
 * Validates a single path segment (a new file/folder name). Rejects empty
 * names, path separators, traversal, and (on Windows) characters the OS forbids.
 */
function validateName(input: string): string {
  const name = (input ?? "").trim();
  if (!name) throw new HttpError(400, "name is required");
  if (name === "." || name === "..")
    throw new HttpError(400, "invalid name");
  if (name.includes("/") || name.includes("\\"))
    throw new HttpError(400, "name cannot contain path separators");
  // Characters Windows disallows in filenames; harmless to reject everywhere.
  if (/[<>:"|?*\u0000-\u001f]/.test(name))
    throw new HttpError(400, "name contains invalid characters");
  return name;
}

/** Ensures a directory exists and is actually a directory. */
async function assertDirectory(dir: string): Promise<void> {
  let st;
  try {
    st = await fsp.stat(dir);
  } catch (err) {
    throw fsError(err, "failed to read directory");
  }
  if (!st.isDirectory()) throw new HttpError(400, "not a directory");
}

export async function createFolder(
  parentInput: string,
  nameInput: string
): Promise<FsEntry> {
  const parent = normalizeInput(parentInput);
  const name = validateName(nameInput);
  await assertDirectory(parent);
  const full = path.join(parent, name);
  try {
    await fsp.mkdir(full);
  } catch (err) {
    throw fsError(err, "failed to create folder");
  }
  return describe(full);
}

export async function createFile(
  parentInput: string,
  nameInput: string
): Promise<FsEntry> {
  const parent = normalizeInput(parentInput);
  const name = validateName(nameInput);
  await assertDirectory(parent);
  const full = path.join(parent, name);
  try {
    // wx flag => fail if the file already exists.
    const handle = await fsp.open(full, "wx");
    await handle.close();
  } catch (err) {
    throw fsError(err, "failed to create file");
  }
  return describe(full);
}

export async function renameEntry(
  targetInput: string,
  newNameInput: string
): Promise<FsEntry> {
  const target = normalizeInput(targetInput);
  const newName = validateName(newNameInput);
  if (await isProtectedRoot(target))
    throw new HttpError(400, "cannot rename a drive root");
  const dest = path.join(path.dirname(target), newName);
  if (dest === target) return describe(target);
  if (existsSync(dest))
    throw new HttpError(409, "a file or folder with that name already exists");
  try {
    await fsp.rename(target, dest);
  } catch (err) {
    throw fsError(err, "failed to rename");
  }
  return describe(dest);
}

export async function moveEntry(
  sourceInput: string,
  destDirInput: string
): Promise<FsEntry> {
  const source = normalizeInput(sourceInput);
  const destDir = normalizeInput(destDirInput);
  if (await isProtectedRoot(source))
    throw new HttpError(400, "cannot move a drive root");
  await assertDirectory(destDir);
  const dest = path.join(destDir, path.basename(source));
  if (dest === source) return describe(source);
  if (isStrictSubPath(source, dest))
    throw new HttpError(400, "cannot move a folder into itself");
  if (existsSync(dest))
    throw new HttpError(409, "an item with that name already exists here");
  try {
    await fsp.rename(source, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // Cross-device move: fall back to copy + delete.
    if (code === "EXDEV") {
      try {
        await fsp.cp(source, dest, { recursive: true, errorOnExist: true });
        await fsp.rm(source, { recursive: true, force: true });
      } catch (err2) {
        throw fsError(err2, "failed to move");
      }
    } else {
      throw fsError(err, "failed to move");
    }
  }
  return describe(dest);
}

export async function copyEntry(
  sourceInput: string,
  destDirInput: string
): Promise<FsEntry> {
  const source = normalizeInput(sourceInput);
  const destDir = normalizeInput(destDirInput);
  await assertDirectory(destDir);
  let dest = path.join(destDir, path.basename(source));
  if (isStrictSubPath(source, dest))
    throw new HttpError(400, "cannot copy a folder into itself");
  // If pasting into the same folder (or onto an existing name), pick a free
  // "name - Copy" style target so copy never overwrites silently.
  if (existsSync(dest)) dest = uniqueCopyPath(dest);
  try {
    await fsp.cp(source, dest, { recursive: true, errorOnExist: true });
  } catch (err) {
    throw fsError(err, "failed to copy");
  }
  return describe(dest);
}

export async function deleteEntry(
  targetInput: string,
  deletedBy: string | null = null
): Promise<void> {
  const target = normalizeInput(targetInput);
  if (await isProtectedRoot(target))
    throw new HttpError(400, "refusing to delete a drive root");
  if (!existsSync(target)) throw new HttpError(404, "path not found");
  try {
    if (isInTrash(target)) {
      const rel = path.relative(TRASH_DIR, path.resolve(target));
      const id = rel.split(path.sep).filter(Boolean)[0];
      const dir = id ? path.join(TRASH_DIR, id) : target;
      await fsp.rm(dir, { recursive: true, force: false });
      return;
    }
    await trashPath(target, deletedBy);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw fsError(err, "failed to delete");
  }
}

/**
 * Resolves the absolute destination path for an upload and ensures the parent
 * directory exists. The caller streams the request body into this path.
 */
export async function resolveUploadTarget(
  parentInput: string,
  nameInput: string
): Promise<string> {
  const parent = normalizeInput(parentInput);
  const name = validateName(nameInput);
  await assertDirectory(parent);
  return path.join(parent, name);
}

/**
 * Returns true if `child` is nested strictly *beneath* `parent` (not equal to
 * it). Used to stop moving/copying a folder into one of its own descendants.
 * Equal paths are intentionally allowed (e.g. copying a file into its own
 * folder, which gets a "- Copy" suffix).
 */
function isStrictSubPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Generates a non-colliding "name - Copy" / "name - Copy (2)" target path. */
function uniqueCopyPath(target: string): string {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; i < 1000; i++) {
    const suffix = i === 1 ? " - Copy" : ` - Copy (${i})`;
    const candidate = path.join(dir, `${base}${suffix}${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new HttpError(409, "too many copies already exist");
}

/** Builds an FsEntry describing an existing path (used in mutation responses). */
async function describe(full: string): Promise<FsEntry> {
  const st = await fsp.stat(full);
  const isDir = st.isDirectory();
  return {
    name: path.basename(full),
    path: full,
    type: isDir ? "dir" : "file",
    size: isDir ? null : st.size,
    modifiedMs: st.mtimeMs,
    ext: isDir ? null : path.extname(full).slice(1).toLowerCase() || null,
  };
}
