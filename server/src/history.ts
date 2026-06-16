import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { getSnapshot } from "./stats.js";
import { getProcesses } from "./processes.js";

export interface HistorySettings {
  /** Whether the backend records metrics to disk. */
  enabled: boolean;
  /** Seconds between samples. */
  intervalSeconds: number;
  /** Drop samples older than this many days (0 = no age limit). */
  retentionDays: number;
  /** Hard cap on the database size in MB (0 = no size limit). */
  maxSizeMb: number;
}

export const HISTORY_DEFAULTS: HistorySettings = {
  enabled: true,
  intervalSeconds: 5,
  retentionDays: 30,
  maxSizeMb: 500,
};

// Same data dir convention as settings.ts so everything lives together and is
// writable regardless of where the server was launched from.
const DATA_DIR =
  process.env.SYSTEMDASH_DATA_DIR ?? path.join(os.homedir(), ".systemdash");
const DB_FILE = path.join(DATA_DIR, "history.db");

let db: DatabaseSync | null = null;

/** Opens (and lazily initialises) the SQLite database. */
function open(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = new DatabaseSync(DB_FILE);
  // INCREMENTAL auto-vacuum lets us reclaim disk space after pruning old rows so
  // the size cap is actually enforced on disk. It must be set before the tables
  // exist to take effect without a full VACUUM, hence we run it up front.
  fresh.exec("PRAGMA auto_vacuum = INCREMENTAL;");
  fresh.exec("PRAGMA journal_mode = WAL;");
  fresh.exec("PRAGMA synchronous = NORMAL;");
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      ts             INTEGER PRIMARY KEY,
      cpu_load       REAL,
      cpu_temp       REAL,
      cpu_clock      REAL,
      mem_used_pct   REAL,
      mem_used_bytes INTEGER,
      mem_total_bytes INTEGER,
      swap_used_pct  REAL,
      proc_count     INTEGER,
      proc_running   INTEGER
    );
  `);
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS gpu_metrics (
      ts           INTEGER NOT NULL,
      idx          INTEGER NOT NULL,
      util         REAL,
      mem_used_pct REAL,
      temp         REAL,
      clock_core   REAL,
      clock_mem    REAL,
      power        REAL,
      PRIMARY KEY (ts, idx)
    );
  `);
  // Per-core CPU load over time (one row per core per sample), mirroring the
  // gpu_metrics shape so the cores can be charted individually.
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS cpu_core_metrics (
      ts   INTEGER NOT NULL,
      idx  INTEGER NOT NULL,
      load REAL,
      PRIMARY KEY (ts, idx)
    );
  `);
  db = fresh;
  return db;
}

// Prepared statements are created lazily and reused for the life of the process.
type Stmt = ReturnType<DatabaseSync["prepare"]>;
let insertMetricStmt: Stmt | null = null;
let insertGpuStmt: Stmt | null = null;
let insertCoreStmt: Stmt | null = null;

function insertMetric(): Stmt {
  if (!insertMetricStmt) {
    insertMetricStmt = open().prepare(`
      INSERT OR REPLACE INTO metrics
        (ts, cpu_load, cpu_temp, cpu_clock, mem_used_pct, mem_used_bytes,
         mem_total_bytes, swap_used_pct, proc_count, proc_running)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return insertMetricStmt;
}

function insertGpu(): Stmt {
  if (!insertGpuStmt) {
    insertGpuStmt = open().prepare(`
      INSERT OR REPLACE INTO gpu_metrics
        (ts, idx, util, mem_used_pct, temp, clock_core, clock_mem, power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return insertGpuStmt;
}

function insertCore(): Stmt {
  if (!insertCoreStmt) {
    insertCoreStmt = open().prepare(`
      INSERT OR REPLACE INTO cpu_core_metrics (ts, idx, load)
      VALUES (?, ?, ?)
    `);
  }
  return insertCoreStmt;
}

let current: HistorySettings = HISTORY_DEFAULTS;
let timer: ReturnType<typeof setInterval> | null = null;
let sampling = false;

/** Records a single sample of the current system state. */
async function sample(): Promise<void> {
  if (sampling) return; // never overlap samples
  sampling = true;
  try {
    const snap = await getSnapshot();

    let procCount: number | null = null;
    let procRunning: number | null = null;
    try {
      const procs = await getProcesses();
      procCount = procs.summary.all;
      procRunning = procs.summary.running;
    } catch {
      // Process listing can fail without permissions; record the rest anyway.
    }

    const ts = snap.timestamp;
    const swapPct =
      snap.memory.swapTotalBytes > 0
        ? round((snap.memory.swapUsedBytes / snap.memory.swapTotalBytes) * 100)
        : 0;

    insertMetric().run(
      ts,
      snap.cpu.loadPercent,
      snap.cpu.temperatureC,
      snap.cpu.currentSpeedGHz,
      snap.memory.usedPercent,
      snap.memory.usedBytes,
      snap.memory.totalBytes,
      swapPct,
      procCount,
      procRunning
    );

    snap.gpus.forEach((g, i) => {
      const memPct =
        g.memoryTotalMb && g.memoryTotalMb > 0 && g.memoryUsedMb != null
          ? round((g.memoryUsedMb / g.memoryTotalMb) * 100)
          : null;
      insertGpu().run(
        ts,
        i,
        g.utilizationPercent,
        memPct,
        g.temperatureC,
        g.clockCoreMhz,
        g.clockMemoryMhz,
        g.powerDrawW
      );
    });

    snap.cpu.perCoreLoad.forEach((load, i) => {
      insertCore().run(ts, i, load);
    });

    enforceRetention();
  } finally {
    sampling = false;
  }
}

/** Current logical size of the database file in bytes. */
function dbSizeBytes(): number {
  const d = open();
  const pc = d.prepare("PRAGMA page_count").get() as { page_count: number };
  const ps = d.prepare("PRAGMA page_size").get() as { page_size: number };
  return (pc?.page_count ?? 0) * (ps?.page_size ?? 0);
}

/** Prunes old data by age and total size, then reclaims freed pages. */
function enforceRetention(): void {
  const d = open();
  let pruned = false;

  if (current.retentionDays > 0) {
    const cutoff = Date.now() - current.retentionDays * 86_400_000;
    const a = d.prepare("DELETE FROM metrics WHERE ts < ?").run(cutoff);
    d.prepare("DELETE FROM gpu_metrics WHERE ts < ?").run(cutoff);
    d.prepare("DELETE FROM cpu_core_metrics WHERE ts < ?").run(cutoff);
    if (a.changes > 0) pruned = true;
  }

  if (current.maxSizeMb > 0) {
    const cap = current.maxSizeMb * 1024 * 1024;
    let guard = 0;
    while (dbSizeBytes() > cap && guard++ < 100) {
      const rows = (d.prepare("SELECT COUNT(*) c FROM metrics").get() as {
        c: number;
      }).c;
      if (rows <= 1) break;
      // Drop the oldest ~5% (at least 50 rows) at a time until under the cap.
      const drop = Math.max(50, Math.floor(rows * 0.05));
      const edge = d
        .prepare("SELECT ts FROM metrics ORDER BY ts ASC LIMIT 1 OFFSET ?")
        .get(drop) as { ts: number } | undefined;
      const cutoff = edge?.ts ?? Date.now();
      d.prepare("DELETE FROM metrics WHERE ts < ?").run(cutoff);
      d.prepare("DELETE FROM gpu_metrics WHERE ts < ?").run(cutoff);
      d.prepare("DELETE FROM cpu_core_metrics WHERE ts < ?").run(cutoff);
      d.exec("PRAGMA incremental_vacuum;");
      pruned = true;
    }
  }

  if (pruned) d.exec("PRAGMA incremental_vacuum;");
}

function restartTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (!current.enabled) return;
  open();
  const ms = Math.max(1, current.intervalSeconds) * 1000;
  timer = setInterval(() => {
    sample().catch((err) => console.error("history sample failed:", err));
  }, ms);
  timer.unref?.();
  // Take an initial sample shortly after (re)configuring so charts populate fast.
  setTimeout(() => {
    sample().catch(() => {});
  }, 500).unref?.();
}

/** Applies new history settings and (re)starts the recorder accordingly. */
export function configureHistory(cfg: HistorySettings): void {
  current = cfg;
  restartTimer();
}

export interface HistorySeries {
  from: number;
  to: number;
  bucketMs: number;
  t: number[];
  cpuLoad: (number | null)[];
  cpuTemp: (number | null)[];
  cpuClock: (number | null)[];
  memUsedPct: (number | null)[];
  swapUsedPct: (number | null)[];
  procCount: (number | null)[];
  procRunning: (number | null)[];
  memTotalBytes: number | null;
  cpuCores: Array<{
    index: number;
    load: (number | null)[];
  }>;
  gpus: Array<{
    index: number;
    util: (number | null)[];
    memUsedPct: (number | null)[];
    temp: (number | null)[];
    clockCore: (number | null)[];
    clockMem: (number | null)[];
    power: (number | null)[];
  }>;
}

/** Returns downsampled time-series for a range, bucketed to ~`points` points. */
export function queryHistory(opts: {
  from: number;
  to: number;
  points: number;
}): HistorySeries {
  const d = open();
  const from = Math.min(opts.from, opts.to);
  const to = Math.max(opts.from, opts.to);
  const span = Math.max(1, to - from);
  const points = clampInt(opts.points, 10, 2000);
  // Never bucket finer than 1s; aim for roughly `points` buckets across the span.
  const bucket = Math.max(1000, Math.ceil(span / points));

  const metricRows = d
    .prepare(
      `SELECT (ts / ${bucket}) * ${bucket} AS b,
         AVG(cpu_load)     AS cpu_load,
         AVG(cpu_temp)     AS cpu_temp,
         AVG(cpu_clock)    AS cpu_clock,
         AVG(mem_used_pct) AS mem_used_pct,
         AVG(swap_used_pct) AS swap_used_pct,
         AVG(proc_count)   AS proc_count,
         AVG(proc_running) AS proc_running,
         MAX(mem_total_bytes) AS mem_total_bytes
       FROM metrics
       WHERE ts BETWEEN ? AND ?
       GROUP BY b
       ORDER BY b`
    )
    .all(from, to) as Array<Record<string, number | null>>;

  const t: number[] = [];
  const bucketIndex = new Map<number, number>();
  const series: Omit<
    HistorySeries,
    "from" | "to" | "bucketMs" | "t" | "gpus" | "cpuCores" | "memTotalBytes"
  > = {
    cpuLoad: [],
    cpuTemp: [],
    cpuClock: [],
    memUsedPct: [],
    swapUsedPct: [],
    procCount: [],
    procRunning: [],
  };
  let memTotalBytes: number | null = null;

  for (const row of metricRows) {
    const b = Number(row.b);
    bucketIndex.set(b, t.length);
    t.push(b);
    series.cpuLoad.push(num(row.cpu_load));
    series.cpuTemp.push(num(row.cpu_temp));
    series.cpuClock.push(num(row.cpu_clock));
    series.memUsedPct.push(num(row.mem_used_pct));
    series.swapUsedPct.push(num(row.swap_used_pct));
    series.procCount.push(num(row.proc_count));
    series.procRunning.push(num(row.proc_running));
    if (row.mem_total_bytes != null) memTotalBytes = Number(row.mem_total_bytes);
  }

  const gpuRows = d
    .prepare(
      `SELECT (ts / ${bucket}) * ${bucket} AS b, idx,
         AVG(util)         AS util,
         AVG(mem_used_pct) AS mem_used_pct,
         AVG(temp)         AS temp,
         AVG(clock_core)   AS clock_core,
         AVG(clock_mem)    AS clock_mem,
         AVG(power)        AS power
       FROM gpu_metrics
       WHERE ts BETWEEN ? AND ?
       GROUP BY b, idx
       ORDER BY idx, b`
    )
    .all(from, to) as Array<Record<string, number | null>>;

  const gpuMap = new Map<number, HistorySeries["gpus"][number]>();
  const blank = () => new Array<number | null>(t.length).fill(null);
  for (const row of gpuRows) {
    const idx = Number(row.idx);
    const pos = bucketIndex.get(Number(row.b));
    if (pos == null) continue; // gpu bucket with no matching metric bucket
    let g = gpuMap.get(idx);
    if (!g) {
      g = {
        index: idx,
        util: blank(),
        memUsedPct: blank(),
        temp: blank(),
        clockCore: blank(),
        clockMem: blank(),
        power: blank(),
      };
      gpuMap.set(idx, g);
    }
    g.util[pos] = num(row.util);
    g.memUsedPct[pos] = num(row.mem_used_pct);
    g.temp[pos] = num(row.temp);
    g.clockCore[pos] = num(row.clock_core);
    g.clockMem[pos] = num(row.clock_mem);
    g.power[pos] = num(row.power);
  }

  const coreRows = d
    .prepare(
      `SELECT (ts / ${bucket}) * ${bucket} AS b, idx,
         AVG(load) AS load
       FROM cpu_core_metrics
       WHERE ts BETWEEN ? AND ?
       GROUP BY b, idx
       ORDER BY idx, b`
    )
    .all(from, to) as Array<Record<string, number | null>>;

  const coreMap = new Map<number, HistorySeries["cpuCores"][number]>();
  for (const row of coreRows) {
    const idx = Number(row.idx);
    const pos = bucketIndex.get(Number(row.b));
    if (pos == null) continue;
    let c = coreMap.get(idx);
    if (!c) {
      c = { index: idx, load: blank() };
      coreMap.set(idx, c);
    }
    c.load[pos] = num(row.load);
  }

  return {
    from,
    to,
    bucketMs: bucket,
    t,
    ...series,
    memTotalBytes,
    cpuCores: [...coreMap.values()].sort((a, b) => a.index - b.index),
    gpus: [...gpuMap.values()].sort((a, b) => a.index - b.index),
  };
}

export interface HistoryStats {
  enabled: boolean;
  intervalSeconds: number;
  retentionDays: number;
  maxSizeMb: number;
  rowCount: number;
  oldest: number | null;
  newest: number | null;
  dbBytes: number;
  bytesPerSample: number;
  /** Estimated days of headroom before the size cap is hit at the current rate. */
  estimatedDaysToFull: number | null;
}

export function historyStats(): HistoryStats {
  const d = open();
  const agg = d
    .prepare("SELECT COUNT(*) c, MIN(ts) mn, MAX(ts) mx FROM metrics")
    .get() as { c: number; mn: number | null; mx: number | null };
  const dbBytes = dbSizeBytes();
  const rowCount = agg?.c ?? 0;
  const bytesPerSample = rowCount > 0 ? dbBytes / rowCount : 0;

  let estimatedDaysToFull: number | null = null;
  if (current.maxSizeMb > 0 && bytesPerSample > 0 && current.enabled) {
    const cap = current.maxSizeMb * 1024 * 1024;
    const remaining = Math.max(0, cap - dbBytes);
    const samplesPerDay = 86_400 / Math.max(1, current.intervalSeconds);
    const daysFromSize = remaining / bytesPerSample / samplesPerDay;
    // The age limit can cap retention before the disk does.
    estimatedDaysToFull =
      current.retentionDays > 0
        ? Math.min(daysFromSize, current.retentionDays)
        : daysFromSize;
  } else if (current.retentionDays > 0) {
    estimatedDaysToFull = current.retentionDays;
  }

  return {
    enabled: current.enabled,
    intervalSeconds: current.intervalSeconds,
    retentionDays: current.retentionDays,
    maxSizeMb: current.maxSizeMb,
    rowCount,
    oldest: agg?.mn ?? null,
    newest: agg?.mx ?? null,
    dbBytes,
    bytesPerSample,
    estimatedDaysToFull,
  };
}

/** Wipes all recorded history and reclaims the freed disk space. */
export function clearHistory(): void {
  const d = open();
  d.exec("DELETE FROM metrics;");
  d.exec("DELETE FROM gpu_metrics;");
  d.exec("DELETE FROM cpu_core_metrics;");
  d.exec("PRAGMA incremental_vacuum;");
}

function num(n: number | null | undefined): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
