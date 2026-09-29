import si from "systeminformation";
import { APP_NAME } from "./brand.js";
import { readAppVersion } from "./version.js";
import { spawn } from "node:child_process";
import fs from "node:fs";

export interface SystemSnapshot {
  timestamp: number;
  app: { name: string; version: string };
  host: {
    hostname: string;
    platform: string;
    distro: string;
    release: string;
    arch: string;
    kernel: string;
    uptimeSeconds: number;
    systemManufacturer: string;
    systemModel: string;
  };
  cpu: {
    manufacturer: string;
    brand: string;
    physicalCores: number;
    cores: number;
    baseSpeedGHz: number;
    maxSpeedGHz: number;
    currentSpeedGHz: number;
    minSpeedGHz: number;
    loadPercent: number;
    perCoreLoad: number[];
    perCoreSpeed: number[];
    temperatureC: number | null;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    activeBytes: number;
    availableBytes: number;
    usedPercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
  };
  disks: Array<{
    fs: string;
    mount: string;
    type: string;
    sizeBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
  }>;
  /** Live byte rates. Null until two samples exist, or when the OS doesn't report them. */
  throughput: {
    diskReadBps: number | null;
    diskWriteBps: number | null;
    /** Per physical disk; empty when the OS only exposes a host total. */
    disks: Array<{
      id: string;
      label: string;
      readBps: number | null;
      writeBps: number | null;
    }>;
    netRxBps: number | null;
    netTxBps: number | null;
    /** Bytes received since the previous IO tick (physical adapters). */
    netRxBytesDelta: number | null;
    /** Bytes sent since the previous IO tick (physical adapters). */
    netTxBytesDelta: number | null;
  };
  gpus: Array<{
    vendor: string;
    model: string;
    vramMb: number | null;
    utilizationPercent: number | null;
    memoryUsedMb: number | null;
    memoryTotalMb: number | null;
    temperatureC: number | null;
    clockCoreMhz: number | null;
    clockMemoryMhz: number | null;
    fanPercent: number | null;
    powerDrawW: number | null;
    powerLimitW: number | null;
  }>;
}

function readCpuTemperatureC(
  temp: Awaited<ReturnType<typeof si.cpuTemperature>>
): number | null {
  const candidates = [
    temp.main,
    temp.chipset,
    ...(temp.cores ?? []),
    ...(temp.socket ?? []),
  ].filter((t): t is number => isFiniteNumber(t) && t > 0 && t < 150);
  if (!candidates.length) return null;
  return round(Math.max(...candidates));
}

const APP_VERSION = readAppVersion();

// On Windows, systeminformation reports the rated/base clock and never the live
// boost frequency. Task Manager derives the real clock from the perf counter
// "% Processor Performance" (relative to the base clock, can exceed 100% under
// boost). We sample it with a single long-lived PowerShell loop and cache the
// latest value so requests stay fast.
//
// Why not `typeperf`? When its stdout is a pipe (not a console) Windows
// block-buffers the output, so samples reach us in delayed bursts and the value
// appears frozen. The PowerShell loop below flushes each sample explicitly, so
// the reading streams in real time. On Linux/macOS systeminformation already
// returns the true current frequency, so no sampler is needed.
let liveCpuSpeedGHz: number | null = null;
let observedMaxGHz = 0;
let samplerStarted = false;

const CPU_SPEED_SAMPLE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
while ($true) {
  $s = (Get-Counter '\\Processor Information(_Total)\\% Processor Performance').CounterSamples[0].CookedValue
  [Console]::Out.WriteLine($s.ToString('F4', $inv))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 750
}
`;

function startWindowsCpuSpeedSampler(baseGHz: number): void {
  if (samplerStarted || process.platform !== "win32" || baseGHz <= 0) return;
  samplerStarted = true;

  let child;
  try {
    child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", CPU_SPEED_SAMPLE_SCRIPT],
      { windowsHide: true }
    );
  } catch {
    return;
  }

  child.stdout.on("data", (buf: Buffer) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      const pct = parseFloat(line.trim());
      if (Number.isFinite(pct) && pct > 0) {
        liveCpuSpeedGHz = (baseGHz * pct) / 100;
      }
    }
  });

  // If PowerShell is unavailable or errors, fall back to systeminformation.
  child.on("error", () => {
    liveCpuSpeedGHz = null;
  });
  child.unref?.();
}

// Hardware identity (CPU model, core counts, OS, machine) never changes while the
// process runs, yet si.cpu()/si.system()/si.osInfo() are by far the slowest calls
// (~1.3s / ~0.9s / ~0.5s). Fetch them once and reuse.
type StaticInfo = {
  osInfo: Awaited<ReturnType<typeof si.osInfo>>;
  cpu: Awaited<ReturnType<typeof si.cpu>>;
  system: Awaited<ReturnType<typeof si.system>>;
};

let staticInfo: StaticInfo | null = null;

async function getStaticInfo(): Promise<StaticInfo> {
  if (!staticInfo) {
    const [osInfo, cpu, system] = await Promise.all([
      si.osInfo(),
      si.cpu(),
      si.system(),
    ]);
    staticInfo = { osInfo, cpu, system };
  }
  return staticInfo;
}

// GPU, disks and temperature change slowly but are moderately expensive to query.
// We serve them from a cache that refreshes in the background, so requests never
// block on them and the fast CPU/memory metrics can be polled ~once per second.
type SlowInfo = {
  graphics: Awaited<ReturnType<typeof si.graphics>>;
  fsSize: Awaited<ReturnType<typeof si.fsSize>>;
  temp: Awaited<ReturnType<typeof si.cpuTemperature>>;
};

const SLOW_TTL_MS = 3000;
let slowInfo: SlowInfo | null = null;
let slowAt = 0;
let slowRefreshing = false;

async function refreshSlow(): Promise<void> {
  const [graphics, fsSize, temp] = await Promise.all([
    si.graphics(),
    si.fsSize(),
    si.cpuTemperature(),
  ]);
  slowInfo = { graphics, fsSize, temp };
  slowAt = Date.now();
}

async function getSlowInfo(): Promise<SlowInfo> {
  if (!slowInfo) {
    await refreshSlow();
  } else if (Date.now() - slowAt > SLOW_TTL_MS && !slowRefreshing) {
    slowRefreshing = true;
    refreshSlow().finally(() => {
      slowRefreshing = false;
    });
  }
  return slowInfo as SlowInfo;
}

// Disk and NIC counters are sampled off the request path. fsStats/networkStats
// can take hundreds of milliseconds (WMI on Windows), and the first call has
// no per-second rate, so a background loop keeps the latest bytes/sec ready.
const IO_SAMPLE_MS = 1000;

type IoRates = SystemSnapshot["throughput"];

const IO_EMPTY: IoRates = {
  diskReadBps: null,
  diskWriteBps: null,
  disks: [],
  netRxBps: null,
  netTxBps: null,
  netRxBytesDelta: null,
  netTxBytesDelta: null,
};

let ioRates: IoRates = { ...IO_EMPTY, disks: [] };
let ioTimer: ReturnType<typeof setInterval> | null = null;
let ioSampling = false;
let prevFs: { rx: number; wx: number; at: number } | null = null;
let prevLinuxDisk = new Map<string, { rx: number; wx: number }>();
let prevLinuxDiskAt = 0;
let prevNet = new Map<string, { rx: number; tx: number }>();
let prevNetAt = 0;
/** Byte deltas since the last history consume — summed across IO ticks. */
let pendingNetRxBytes = 0;
let pendingNetTxBytes = 0;
let pendingNetBytesReady = false;
let physicalIfaces: Set<string> | null = null;
type WinDiskSample = { id: string; label: string; read: number; write: number };
let winDisks: WinDiskSample[] | null = null;
let winDiskStarted = false;

// systeminformation's fsStats() and disksIO() both return null on Windows.
// Task Manager's per-disk graphs are PhysicalDisk(*) excluding _Total.
const DISK_IO_SAMPLE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
while ($true) {
  $c = Get-Counter '\\PhysicalDisk(*)\\Disk Read Bytes/sec','\\PhysicalDisk(*)\\Disk Write Bytes/sec'
  $by = @{}
  foreach ($s in $c.CounterSamples) {
    $name = $s.InstanceName
    if (-not $name -or $name -eq '_total') { continue }
    if (-not $by.ContainsKey($name)) { $by[$name] = @{ r = 0.0; w = 0.0 } }
    $path = $s.Path.ToLowerInvariant()
    if ($path.Contains('read bytes/sec')) { $by[$name].r = [double]$s.CookedValue }
    elseif ($path.Contains('write bytes/sec')) { $by[$name].w = [double]$s.CookedValue }
  }
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($name in ($by.Keys | Sort-Object)) {
    $id = ($name -split '\\s+')[0]
    $label = ($name -replace '^\\d+\\s+', '').Trim().ToUpperInvariant()
    if ($label -match '^[A-Z]$') { $label = $label + ':' }
    if (-not $label) { $label = $id }
    $parts.Add($id + '|' + $label + '|' + $by[$name].r.ToString('F0', $inv) + '|' + $by[$name].w.ToString('F0', $inv))
  }
  [Console]::Out.WriteLine(($parts -join ';'))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1000
}
`;

function startWindowsDiskSampler(): void {
  if (winDiskStarted || process.platform !== "win32") return;
  winDiskStarted = true;
  let child;
  try {
    child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", DISK_IO_SAMPLE_SCRIPT],
      { windowsHide: true }
    );
  } catch {
    return;
  }
  child.stdout.on("data", (buf: Buffer) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const next: WinDiskSample[] = [];
      for (const part of trimmed.split(";")) {
        const [id, label, rawRead, rawWrite] = part.split("|");
        if (!id) continue;
        const read = Number(rawRead);
        const write = Number(rawWrite);
        if (!Number.isFinite(read) || !Number.isFinite(write) || read < 0 || write < 0) continue;
        next.push({
          id,
          label: label || id,
          read,
          write,
        });
      }
      if (next.length) winDisks = next;
    }
  });
  child.on("error", () => {
    winDisks = null;
  });
  child.unref?.();
}

/** Whole-disk names in /proc/diskstats (skip partitions like sda1, nvme0n1p1). */
function isLinuxWholeDisk(name: string): boolean {
  return /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(name);
}

function readLinuxDiskBytes(): Array<{ id: string; label: string; rx: number; wx: number }> {
  try {
    const text = fs.readFileSync("/proc/diskstats", "utf8");
    const out: Array<{ id: string; label: string; rx: number; wx: number }> = [];
    for (const line of text.split("\n")) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 14) continue;
      const name = cols[2];
      if (!isLinuxWholeDisk(name)) continue;
      // Fields 6 and 10 are sectors read / written; Linux sectors are 512 bytes.
      const rx = Number(cols[5]) * 512;
      const wx = Number(cols[9]) * 512;
      if (!Number.isFinite(rx) || !Number.isFinite(wx)) continue;
      out.push({ id: name, label: name, rx, wx });
    }
    return out;
  } catch {
    return [];
  }
}

function startIoSampler(): void {
  if (ioTimer) return;
  startWindowsDiskSampler();
  ioTimer = setInterval(() => {
    void sampleIo();
  }, IO_SAMPLE_MS);
  ioTimer.unref?.();
  void sampleIo();
}

function isLoopbackIface(name: string): boolean {
  const n = name.toLowerCase();
  return n === "lo" || /^lo\d+$/.test(n) || n.includes("loopback");
}

function bytesPerSec(
  current: number,
  prev: number | undefined,
  dtSec: number
): number | null {
  // Rates come from our own counter deltas. The library's per-second fields
  // share state with other callers and treat the first reading (often 0) as a
  // baseline, which shows up as a multi-gigabyte spike.
  if (prev == null || dtSec < 0.2 || !Number.isFinite(current)) return null;
  if (prev === 0 && current > 0) return null;
  const delta = (current - prev) / dtSec;
  if (!Number.isFinite(delta) || delta < 0) return null;
  return delta;
}

/** Absolute counter delta for usage accounting. Resets → 0; first sample → null. */
function counterDelta(current: number, prev: number | undefined): number | null {
  if (prev == null || !Number.isFinite(current)) return null;
  if (prev === 0 && current > 0) return null;
  const delta = current - prev;
  if (!Number.isFinite(delta)) return null;
  if (delta < 0) return 0;
  return delta;
}

function roundBps(n: number | null): number | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Bytes transferred on physical NICs since the previous call (for history).
 * Returns null until two IO ticks have established a baseline.
 */
export function consumeNetByteDeltas(): { rx: number; tx: number } | null {
  if (!pendingNetBytesReady) return null;
  const out = { rx: pendingNetRxBytes, tx: pendingNetTxBytes };
  pendingNetRxBytes = 0;
  pendingNetTxBytes = 0;
  return out;
}

async function physicalIfaceNames(): Promise<Set<string>> {
  if (physicalIfaces) return physicalIfaces;
  try {
    const raw = await si.networkInterfaces();
    const list = Array.isArray(raw) ? raw : [raw];
    const names = new Set<string>();
    for (const iface of list) {
      if (!iface?.iface || iface.internal || iface.virtual) continue;
      names.add(iface.iface);
    }
    if (names.size > 0) physicalIfaces = names;
    return names;
  } catch {
    return new Set();
  }
}

async function sampleIo(): Promise<void> {
  if (ioSampling) return;
  ioSampling = true;
  try {
    const [fsStats, nets, physical] = await Promise.all([
      process.platform === "win32" || process.platform === "linux"
        ? Promise.resolve(null)
        : si.fsStats(),
      si.networkStats(),
      physicalIfaceNames(),
    ]);
    const now = Date.now();

    let disks: IoRates["disks"] = [];
    let diskReadBps: number | null = null;
    let diskWriteBps: number | null = null;

    if (winDisks && winDisks.length > 0) {
      disks = winDisks.map((d) => ({
        id: d.id,
        label: d.label,
        readBps: roundBps(d.read),
        writeBps: roundBps(d.write),
      }));
      diskReadBps = roundBps(disks.reduce((s, d) => s + (d.readBps ?? 0), 0));
      diskWriteBps = roundBps(disks.reduce((s, d) => s + (d.writeBps ?? 0), 0));
    } else if (process.platform === "linux") {
      const current = readLinuxDiskBytes();
      const dtSec = prevLinuxDiskAt > 0 ? (now - prevLinuxDiskAt) / 1000 : 0;
      disks = current.map((d) => {
        const prev = prevLinuxDisk.get(d.id);
        return {
          id: d.id,
          label: d.label,
          readBps: roundBps(bytesPerSec(d.rx, prev?.rx, dtSec)),
          writeBps: roundBps(bytesPerSec(d.wx, prev?.wx, dtSec)),
        };
      });
      prevLinuxDisk = new Map(current.map((d) => [d.id, { rx: d.rx, wx: d.wx }]));
      prevLinuxDiskAt = now;
      const any = disks.some((d) => d.readBps != null || d.writeBps != null);
      if (any) {
        diskReadBps = roundBps(
          disks.reduce((s, d) => s + (d.readBps ?? 0), 0)
        );
        diskWriteBps = roundBps(
          disks.reduce((s, d) => s + (d.writeBps ?? 0), 0)
        );
      }
    } else if (fsStats && typeof fsStats.rx === "number" && typeof fsStats.wx === "number") {
      const fsDt = prevFs ? (now - prevFs.at) / 1000 : 0;
      diskReadBps = roundBps(bytesPerSec(fsStats.rx, prevFs?.rx, fsDt));
      diskWriteBps = roundBps(bytesPerSec(fsStats.wx, prevFs?.wx, fsDt));
      prevFs = { rx: fsStats.rx, wx: fsStats.wx, at: now };
      if (diskReadBps != null || diskWriteBps != null) {
        disks = [
          {
            id: "total",
            label: "Total",
            readBps: diskReadBps,
            writeBps: diskWriteBps,
          },
        ];
      }
    }

    const netDt = prevNetAt > 0 ? (now - prevNetAt) / 1000 : 0;
    const up = nets.filter((s) => s.iface && s.operstate !== "down" && !isLoopbackIface(s.iface));
    const chosen = physical.size > 0 ? up.filter((s) => physical.has(s.iface)) : up;
    const rows = chosen.length > 0 ? chosen : up;

    let rx = 0;
    let tx = 0;
    let anyRx = false;
    let anyTx = false;
    let tickRx = 0;
    let tickTx = 0;
    let anyTick = false;
    const nextNet = new Map<string, { rx: number; tx: number }>();
    for (const s of rows) {
      const prev = prevNet.get(s.iface);
      const rxBps = bytesPerSec(s.rx_bytes, prev?.rx, netDt);
      const txBps = bytesPerSec(s.tx_bytes, prev?.tx, netDt);
      if (rxBps != null) {
        rx += rxBps;
        anyRx = true;
      }
      if (txBps != null) {
        tx += txBps;
        anyTx = true;
      }
      const rxDelta = counterDelta(s.rx_bytes ?? 0, prev?.rx);
      const txDelta = counterDelta(s.tx_bytes ?? 0, prev?.tx);
      if (rxDelta != null) {
        tickRx += rxDelta;
        anyTick = true;
      }
      if (txDelta != null) {
        tickTx += txDelta;
        anyTick = true;
      }
      nextNet.set(s.iface, { rx: s.rx_bytes ?? 0, tx: s.tx_bytes ?? 0 });
    }
    prevNet = nextNet;
    prevNetAt = now;

    if (anyTick) {
      pendingNetRxBytes += tickRx;
      pendingNetTxBytes += tickTx;
      pendingNetBytesReady = true;
    }

    ioRates = {
      diskReadBps,
      diskWriteBps,
      disks,
      netRxBps: anyRx ? roundBps(rx) : null,
      netTxBps: anyTx ? roundBps(tx) : null,
      netRxBytesDelta: anyTick ? Math.round(tickRx) : null,
      netTxBytesDelta: anyTick ? Math.round(tickTx) : null,
    };
  } catch {
    // Keep the last good rates; a single failed sample shouldn't blank the charts.
  } finally {
    ioSampling = false;
  }
}

export async function getSnapshot(): Promise<SystemSnapshot> {
  startIoSampler();
  const [staticI, slow, speed, load, mem, time] = await Promise.all([
    getStaticInfo(),
    getSlowInfo(),
    si.cpuCurrentSpeed(),
    si.currentLoad(),
    si.mem(),
    si.time(),
  ]);

  const { osInfo, cpu, system } = staticI;
  const { graphics, fsSize: fs, temp } = slow;

  startWindowsCpuSpeedSampler(cpu.speed);

  // Prefer the live perf-counter value on Windows; otherwise trust systeminformation.
  const currentSpeedGHz = liveCpuSpeedGHz ?? speed.avg ?? cpu.speed;
  observedMaxGHz = Math.max(observedMaxGHz, currentSpeedGHz, cpu.speedMax ?? 0);
  const maxSpeedGHz = round2(Math.max(observedMaxGHz, cpu.speed));

  const cpuTempC = readCpuTemperatureC(temp);

  return {
    timestamp: Date.now(),
    app: { name: APP_NAME, version: APP_VERSION },
    host: {
      hostname: osInfo.hostname,
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      arch: osInfo.arch,
      kernel: osInfo.kernel,
      uptimeSeconds: time.uptime ?? 0,
      systemManufacturer: system.manufacturer,
      systemModel: system.model,
    },
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      physicalCores: cpu.physicalCores,
      cores: cpu.cores,
      baseSpeedGHz: round2(cpu.speed),
      maxSpeedGHz,
      currentSpeedGHz: round2(currentSpeedGHz),
      minSpeedGHz: cpu.speedMin ?? Math.min(cpu.speed, speed.min ?? cpu.speed),
      loadPercent: round(load.currentLoad),
      perCoreLoad: load.cpus.map((c) => round(c.load)),
      perCoreSpeed: (speed.cores ?? []).map((c) => round2(c)),
      temperatureC: cpuTempC,
    },
    memory: {
      totalBytes: mem.total,
      usedBytes: mem.active,
      freeBytes: mem.free,
      activeBytes: mem.active,
      availableBytes: mem.available,
      usedPercent: round((mem.active / mem.total) * 100),
      swapTotalBytes: mem.swaptotal,
      swapUsedBytes: mem.swapused,
    },
    disks: fs.map((d) => ({
      fs: d.fs,
      mount: d.mount,
      type: d.type,
      sizeBytes: d.size,
      usedBytes: d.used,
      availableBytes: d.available,
      usedPercent: round(d.use),
    })),
    throughput: { ...ioRates, disks: ioRates.disks.map((d) => ({ ...d })) },
    gpus: graphics.controllers.map((g) => ({
      vendor: g.vendor ?? "Unknown",
      model: g.model ?? "Unknown",
      vramMb: isFiniteNumber(g.vram) ? g.vram : null,
      utilizationPercent: isFiniteNumber(g.utilizationGpu)
        ? round(g.utilizationGpu)
        : null,
      memoryUsedMb: isFiniteNumber(g.memoryUsed) ? g.memoryUsed : null,
      memoryTotalMb: isFiniteNumber(g.memoryTotal) ? g.memoryTotal : null,
      temperatureC: isFiniteNumber(g.temperatureGpu) ? g.temperatureGpu : null,
      clockCoreMhz: isFiniteNumber(g.clockCore) ? g.clockCore : null,
      clockMemoryMhz: isFiniteNumber(g.clockMemory) ? g.clockMemory : null,
      fanPercent: isFiniteNumber(g.fanSpeed) ? round(g.fanSpeed) : null,
      powerDrawW: isFiniteNumber(g.powerDraw) ? round(g.powerDraw) : null,
      powerLimitW: isFiniteNumber(g.powerLimit) ? round(g.powerLimit) : null,
    })),
  };
}

function round(n: number | null | undefined): number {
  if (!isFiniteNumber(n)) return 0;
  return Math.round(n * 10) / 10;
}

function round2(n: number | null | undefined): number {
  if (!isFiniteNumber(n)) return 0;
  return Math.round(n * 100) / 100;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
