import { promises as fsp, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import si from "systeminformation";
import { resolveOsUser } from "./osUser.js";

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
  kind: "home" | "drive" | "root";
  label: string | null;
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedPercent: number | null;
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
    const mounts = sizes
      .filter((s) => s.mount && (s.mount === "/" || s.mount.startsWith("/")))
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

  return roots;
}

function round(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export async function listDirectory(input: string): Promise<DirListing> {
  const dir = normalizeInput(input);

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
    parent: isFilesystemRoot(dir) ? null : path.dirname(dir),
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
  shouldAbort: () => boolean
): Promise<{ bytes: number; partial: boolean }> {
  const dir = normalizeInput(input);
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

/** Validates a path points to a readable file and returns its absolute path. */
export async function resolveFile(input: string): Promise<string> {
  const file = normalizeInput(input);
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
  input: string
): Promise<{ path: string; content: string }> {
  const file = normalizeInput(input);
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
  if (isFilesystemRoot(target))
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
  if (isFilesystemRoot(source))
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

export async function deleteEntry(targetInput: string): Promise<void> {
  const target = normalizeInput(targetInput);
  if (isFilesystemRoot(target))
    throw new HttpError(400, "refusing to delete a drive root");
  if (!existsSync(target)) throw new HttpError(404, "path not found");
  try {
    await fsp.rm(target, { recursive: true, force: false });
  } catch (err) {
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
