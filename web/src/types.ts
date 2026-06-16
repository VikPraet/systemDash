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

export interface FileManagerSettings {
  showHiddenFiles: boolean;
  showFileExtensions: boolean;
  showFolderSizes: boolean;
  confirmDelete: boolean;
}

export interface HistorySettings {
  enabled: boolean;
  intervalSeconds: number;
  retentionDays: number;
  maxSizeMb: number;
}

export interface Settings {
  files: FileManagerSettings;
  history: HistorySettings;
}

export interface HistoryGpuSeries {
  index: number;
  util: (number | null)[];
  memUsedPct: (number | null)[];
  temp: (number | null)[];
  clockCore: (number | null)[];
  clockMem: (number | null)[];
  power: (number | null)[];
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
  gpus: HistoryGpuSeries[];
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
  estimatedDaysToFull: number | null;
}

export type Role = "viewer" | "user" | "admin";

export interface User {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  createdAt: number;
}

export interface AuthStatus {
  needsSetup: boolean;
  user: User | null;
}

export type GeoStatus = "local" | "resolved" | "unknown";

export interface GeoLocation {
  status: GeoStatus;
  label: string;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
}

export interface SessionInfo {
  id: string;
  userId: number;
  username: string;
  role: Role;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  location: GeoLocation | null;
  current: boolean;
}

export interface AuditEntry {
  id: number;
  ts: number;
  userId: number | null;
  username: string | null;
  action: string;
  detail: string | null;
  status: number | null;
  ip: string | null;
  location: GeoLocation | null;
}
