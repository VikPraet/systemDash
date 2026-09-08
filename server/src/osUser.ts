import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { getSettings, sanitizeOsUsername } from "./settings.js";

const execFileAsync = promisify(execFile);

export interface OsUserInfo {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
}

export interface ResolvedOsUser {
  username: string;
  home: string;
  shell: string;
  uid?: number;
  gid?: number;
  /** True when we will `su -` into a different account (process is root). */
  switchUser: boolean;
}

function currentOsUser(): ResolvedOsUser {
  try {
    const info = os.userInfo();
    return {
      username: info.username,
      home: info.homedir,
      shell: "shell" in info && info.shell ? String(info.shell) : process.env.SHELL || "/bin/bash",
      uid: info.uid,
      gid: info.gid,
      switchUser: false,
    };
  } catch {
    return {
      username: process.env.USER || process.env.LOGNAME || process.env.USERNAME || "user",
      home: os.homedir(),
      shell: process.env.SHELL || "/bin/bash",
      switchUser: false,
    };
  }
}

function parsePasswdLine(line: string): OsUserInfo | null {
  const parts = line.split(":");
  if (parts.length < 7) return null;
  const uid = Number(parts[2]);
  const gid = Number(parts[3]);
  if (!Number.isFinite(uid) || !Number.isFinite(gid)) return null;
  return {
    username: parts[0],
    uid,
    gid,
    home: parts[5] || `/home/${parts[0]}`,
    shell: parts[6] || "/bin/bash",
  };
}

export async function lookupOsUser(username: string): Promise<OsUserInfo | null> {
  const name = sanitizeOsUsername(username, "");
  if (!name || process.platform === "win32") return null;

  try {
    const { stdout } = await execFileAsync("getent", ["passwd", name], {
      encoding: "utf8",
      timeout: 3000,
    });
    const parsed = parsePasswdLine(stdout.trim().split("\n")[0] ?? "");
    if (parsed) return parsed;
  } catch {
    // getent missing or user unknown — try /etc/passwd.
  }

  try {
    const raw = await fsp.readFile("/etc/passwd", "utf8");
    for (const line of raw.split("\n")) {
      if (line.startsWith(`${name}:`)) return parsePasswdLine(line);
    }
  } catch {
    // ignore
  }
  return null;
}

async function requestedOsUsername(): Promise<string> {
  if (process.env.SYSTEMDASH_OS_USER !== undefined) {
    return sanitizeOsUsername(process.env.SYSTEMDASH_OS_USER, "");
  }
  const settings = await getSettings();
  return settings.terminal.osUser;
}

/**
 * Resolves the OS account the terminal (and Files Home) should use.
 * Switching only happens when an OS username is configured (settings or
 * SYSTEMDASH_OS_USER) and Beacon is running as root.
 */
export async function resolveOsUser(): Promise<ResolvedOsUser> {
  const current = currentOsUser();
  if (process.platform === "win32") return current;

  const requested = await requestedOsUsername();
  if (!requested || requested === current.username) return current;

  const target = await lookupOsUser(requested);
  if (!target) return current;

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  if (!isRoot) return current;

  return { ...target, switchUser: true };
}
