import { promises as fsp, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import si from "systeminformation";

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

  const roots: FsRoot[] = [
    {
      name: "Home",
      path: os.homedir(),
      kind: "home",
      label: null,
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
