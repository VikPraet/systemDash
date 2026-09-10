import type { HistoryGpuSeries, HistorySeries, SystemSnapshot } from "../../types";

const LIVE_BUCKET_MS = 1000;

/** Newest-first cap: 5 minutes at ~1 Hz, plus a little slack. */
const LIVE_BUFFER_MAX = 360;

const liveBuffer: SystemSnapshot[] = [];

export function pushLiveSnapshot(snap: SystemSnapshot): void {
  const last = liveBuffer[liveBuffer.length - 1];
  if (last && snap.timestamp - last.timestamp < 400) {
    liveBuffer[liveBuffer.length - 1] = snap;
    return;
  }
  liveBuffer.push(snap);
  const cutoff = snap.timestamp - 6 * 60_000;
  while (liveBuffer.length > LIVE_BUFFER_MAX || (liveBuffer[0] && liveBuffer[0].timestamp < cutoff)) {
    liveBuffer.shift();
  }
}

export function liveSnapshots(): readonly SystemSnapshot[] {
  return liveBuffer;
}

export function overlayLiveHistory(
  recorded: HistorySeries | null,
  live: readonly SystemSnapshot[],
  windowMs: number,
  now: number
): HistorySeries | null {
  const from = now - windowMs;
  const recordedCut = cloneWindow(recorded, from);
  const lastRecorded = recordedCut.t.length ? recordedCut.t[recordedCut.t.length - 1]! : from - 1;
  const extras = live.filter((s) => s.timestamp > lastRecorded + 400 && s.timestamp >= from && s.timestamp <= now);
  if (extras.length === 0) {
    if (recordedCut.t.length) return recordedCut;
    return recorded == null ? null : recordedCut;
  }
  for (const snap of extras) appendSnapshot(recordedCut, snap);
  recordedCut.from = from;
  recordedCut.to = now;
  recordedCut.bucketMs = Math.min(recordedCut.bucketMs || LIVE_BUCKET_MS, LIVE_BUCKET_MS);
  return recordedCut;
}

function cloneWindow(recorded: HistorySeries | null, from: number): HistorySeries {
  if (!recorded) return emptySeries(from);
  const keep: number[] = [];
  for (let i = 0; i < recorded.t.length; i++) {
    if (recorded.t[i] >= from) keep.push(i);
  }
  const pick = <T,>(arr: T[]): T[] => keep.map((i) => arr[i]);
  return {
    from,
    to: recorded.to,
    bucketMs: recorded.bucketMs,
    t: pick(recorded.t),
    cpuLoad: pick(recorded.cpuLoad),
    cpuTemp: pick(recorded.cpuTemp),
    cpuClock: pick(recorded.cpuClock),
    memUsedPct: pick(recorded.memUsedPct),
    swapUsedPct: pick(recorded.swapUsedPct),
    procCount: pick(recorded.procCount),
    procRunning: pick(recorded.procRunning),
    memTotalBytes: recorded.memTotalBytes,
    cpuCores: recorded.cpuCores.map((c) => ({ index: c.index, load: pick(c.load) })),
    gpus: recorded.gpus.map((g) => ({
      index: g.index,
      util: pick(g.util),
      memUsedPct: pick(g.memUsedPct),
      temp: pick(g.temp),
      clockCore: pick(g.clockCore),
      clockMem: pick(g.clockMem),
      power: pick(g.power),
    })),
  };
}

function emptySeries(from: number): HistorySeries {
  return {
    from,
    to: from,
    bucketMs: LIVE_BUCKET_MS,
    t: [],
    cpuLoad: [],
    cpuTemp: [],
    cpuClock: [],
    memUsedPct: [],
    swapUsedPct: [],
    procCount: [],
    procRunning: [],
    memTotalBytes: null,
    cpuCores: [],
    gpus: [],
  };
}

function appendSnapshot(series: HistorySeries, snap: SystemSnapshot): void {
  series.t.push(snap.timestamp);
  series.cpuLoad.push(snap.cpu.loadPercent);
  series.cpuTemp.push(snap.cpu.temperatureC);
  series.cpuClock.push(snap.cpu.currentSpeedGHz);
  series.memUsedPct.push(snap.memory.usedPercent);
  series.swapUsedPct.push(
    snap.memory.swapTotalBytes > 0
      ? Math.round((snap.memory.swapUsedBytes / snap.memory.swapTotalBytes) * 1000) / 10
      : 0
  );
  series.procCount.push(lastFinite(series.procCount));
  series.procRunning.push(lastFinite(series.procRunning));
  series.memTotalBytes = snap.memory.totalBytes;

  alignCores(series, snap.cpu.perCoreLoad.length);
  snap.cpu.perCoreLoad.forEach((load, i) => {
    const core = series.cpuCores.find((c) => c.index === i);
    core?.load.push(load);
  });
  for (const core of series.cpuCores) {
    if (core.load.length < series.t.length) core.load.push(null);
  }

  alignGpus(series, snap.gpus.length);
  snap.gpus.forEach((g, i) => {
    const row = series.gpus.find((x) => x.index === i);
    if (!row) return;
    const memPct =
      g.memoryTotalMb && g.memoryTotalMb > 0 && g.memoryUsedMb != null
        ? Math.round((g.memoryUsedMb / g.memoryTotalMb) * 1000) / 10
        : null;
    row.util.push(g.utilizationPercent);
    row.memUsedPct.push(memPct);
    row.temp.push(g.temperatureC);
    row.clockCore.push(g.clockCoreMhz);
    row.clockMem.push(g.clockMemoryMhz);
    row.power.push(g.powerDrawW);
  });
  for (const row of series.gpus) {
    if (row.util.length < series.t.length) padGpu(row);
  }
}

function lastFinite(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

function alignCores(series: HistorySeries, count: number): void {
  for (let i = 0; i < count; i++) {
    if (series.cpuCores.some((c) => c.index === i)) continue;
    series.cpuCores.push({
      index: i,
      load: new Array<number | null>(Math.max(0, series.t.length - 1)).fill(null),
    });
  }
  series.cpuCores.sort((a, b) => a.index - b.index);
}

function alignGpus(series: HistorySeries, count: number): void {
  for (let i = 0; i < count; i++) {
    if (series.gpus.some((g) => g.index === i)) continue;
    const n = Math.max(0, series.t.length - 1);
    series.gpus.push(blankGpu(i, n));
  }
  series.gpus.sort((a, b) => a.index - b.index);
}

function blankGpu(index: number, n: number): HistoryGpuSeries {
  const fill = new Array<number | null>(n).fill(null);
  return {
    index,
    util: fill.slice(),
    memUsedPct: fill.slice(),
    temp: fill.slice(),
    clockCore: fill.slice(),
    clockMem: fill.slice(),
    power: fill.slice(),
  };
}

function padGpu(row: HistoryGpuSeries): void {
  row.util.push(null);
  row.memUsedPct.push(null);
  row.temp.push(null);
  row.clockCore.push(null);
  row.clockMem.push(null);
  row.power.push(null);
}

export function _resetLiveBufferForTests(): void {
  liveBuffer.length = 0;
}
