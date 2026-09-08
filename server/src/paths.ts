import path from "node:path";
import os from "node:os";

/** Writable app data. Override with SYSTEMDASH_DATA_DIR. */
export const DATA_DIR =
  process.env.SYSTEMDASH_DATA_DIR ?? path.join(os.homedir(), ".systemdash");

export const BACKUPS_DIR = path.join(DATA_DIR, "backups");
export const THEMES_DIR = path.join(DATA_DIR, "themes");
export const TRASH_DIR = path.join(DATA_DIR, "trash");
export const MOUNTS_DIR = path.join(DATA_DIR, "mounts");
export const CREDS_DIR = path.join(DATA_DIR, "share-creds");

/** True when `child` is `parent` or nested under it. */
export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
