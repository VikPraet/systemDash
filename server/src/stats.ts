import si from "systeminformation";
import { spawn } from "node:child_process";

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
    temperatureMaxC: number;
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
  gpus: Array<{
    vendor: string;
    model: string;
    vramMb: number | null;
    utilizationPercent: number | null;
    memoryUsedMb: number | null;
    memoryTotalMb: number | null;
    temperatureC: number | null;
    temperatureMaxC: number;
    clockCoreMhz: number | null;
    clockMemoryMhz: number | null;
    fanPercent: number | null;
    powerDrawW: number | null;
    powerLimitW: number | null;
  }>;
}

// Throttle/shutdown thresholds are not exposed by most drivers, so we use
// conservative defaults that match typical modern silicon limits.
const CPU_TEMP_MAX_C = 100;
const GPU_TEMP_MAX_C = 95;

const APP_NAME = "SystemDash";
const APP_VERSION = process.env.npm_package_version ?? "0.1.0";

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

export async function getSnapshot(): Promise<SystemSnapshot> {
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
      temperatureC: isFiniteNumber(temp.main) ? round(temp.main) : null,
      temperatureMaxC: isFiniteNumber(temp.max) && temp.max > 0 ? temp.max : CPU_TEMP_MAX_C,
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
      temperatureMaxC: GPU_TEMP_MAX_C,
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
