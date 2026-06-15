import si from "systeminformation";
import { spawn } from "node:child_process";

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memPercent: number;
  memBytes: number;
  user: string;
  state: string;
  started: string;
  hasWindow: boolean;
}

export interface ProcessList {
  timestamp: number;
  summary: {
    all: number;
    running: number;
    sleeping: number;
    blocked: number;
  };
  count: number;
  list: ProcessInfo[];
}

// si.processes() is moderately expensive and on Windows needs two samples before
// per-process CPU is meaningful. We cache the result with a short TTL and refresh
// in the background so the Processes tab can poll quickly without hammering the OS.
const TTL_MS = 1500;
const MAX_PROCESSES = 150;

let cache: ProcessList | null = null;
let cacheAt = 0;
let refreshing = false;

// Windows distinguishes foreground "apps" from background processes by whether a
// process owns a visible top-level window. systeminformation doesn't expose that,
// so we ask PowerShell for the set of PIDs with a non-zero MainWindowHandle. On
// other platforms this stays empty (everything is treated as background).
async function getWindowedPids(): Promise<Set<number>> {
  if (process.platform !== "win32") return new Set();
  return new Promise<Set<number>>((resolve) => {
    const set = new Set<number>();
    let child;
    try {
      child = spawn(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.Id }",
        ],
        { windowsHide: true }
      );
    } catch {
      return resolve(set);
    }
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", () => resolve(set));
    child.on("close", () => {
      for (const line of out.split(/\r?\n/)) {
        const n = parseInt(line.trim(), 10);
        if (Number.isFinite(n)) set.add(n);
      }
      resolve(set);
    });
  });
}

async function refresh(): Promise<void> {
  const [p, windowed] = await Promise.all([si.processes(), getWindowedPids()]);
  const mapped: ProcessInfo[] = p.list
    // "System Idle Process" (pid 0) represents free CPU, not real usage; drop it.
    .filter((x) => x.pid !== 0 && x.name !== "System Idle Process")
    .map((x) => ({
      pid: x.pid,
      name: x.name,
      cpuPercent: round(x.cpu),
      memPercent: round(x.mem),
      memBytes: Math.round((x.memRss ?? 0) * 1024),
      user: x.user ?? "",
      state: x.state ?? "",
      started: x.started ?? "",
      hasWindow: windowed.has(x.pid),
    }))
    .sort((a, b) => b.cpuPercent - a.cpuPercent);

  // Always keep foreground apps (they're few and often idle); cap the rest.
  const apps = mapped.filter((x) => x.hasWindow);
  const background = mapped.filter((x) => !x.hasWindow).slice(0, MAX_PROCESSES);
  const list = [...apps, ...background];

  cache = {
    timestamp: Date.now(),
    summary: {
      all: p.all,
      running: p.running,
      sleeping: p.sleeping,
      blocked: p.blocked,
    },
    count: list.length,
    list,
  };
  cacheAt = Date.now();
}

export async function getProcesses(): Promise<ProcessList> {
  if (!cache) {
    await refresh();
  } else if (Date.now() - cacheAt > TTL_MS && !refreshing) {
    refreshing = true;
    refresh().finally(() => {
      refreshing = false;
    });
  }
  return cache as ProcessList;
}

function round(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}
