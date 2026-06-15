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
