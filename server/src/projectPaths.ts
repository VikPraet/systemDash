import fs from "node:fs";
import path from "node:path";
import { getSettings, saveSettings } from "./settings.js";

/** Login account on Pulse — clones and site checkouts live here, not /opt. */
export const VADMIN_HOME = "/home/vadmin";

export type PathExists = (p: string) => boolean;

function fsExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function fallbackProjectsDir(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
  exists: PathExists = fsExists
): string {
  if (platform === "win32") return "C:\\Projects";
  if (exists(VADMIN_HOME)) return VADMIN_HOME;
  if (homeDir && homeDir !== "/root" && !homeDir.startsWith("/opt/")) return homeDir;
  return VADMIN_HOME;
}

/** Parent folder of a project path. Null for drive/fs roots. */
export function parentDir(localPath: string): string | null {
  const normalized = path.normalize(localPath.trim());
  if (!normalized) return null;
  const parent = path.dirname(normalized);
  if (!parent || parent === normalized) return null;
  if (path.parse(parent).root === parent) return null;
  return parent;
}

export async function rememberProjectsDirFromPath(localPath: string): Promise<void> {
  const parent = parentDir(localPath);
  if (!parent) return;
  const settings = await getSettings();
  if (settings.projects.defaultDir === parent) return;
  await saveSettings({
    ...settings,
    projects: { ...settings.projects, defaultDir: parent },
  });
}

export async function setProjectsDir(dir: string): Promise<void> {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    projects: { ...settings.projects, defaultDir: dir },
  });
}
