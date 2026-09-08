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

export interface DockerStatus {
  available: boolean;
  version: string | null;
  error: string | null;
  hint: string | null;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  running: boolean;
}

export interface DockerContainerList {
  timestamp: number;
  containers: DockerContainer[];
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
  kind: "home" | "drive" | "root" | "network" | "trash";
  label: string | null;
  sizeBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedPercent: number | null;
  shareId?: string;
  protocol?: "smb" | "nfs";
  connected?: boolean;
  error?: string | null;
}

export type ShareProtocol = "smb" | "nfs";

export interface NetworkShare {
  id: string;
  name: string;
  protocol: ShareProtocol;
  host: string;
  share: string;
  username: string;
  domain: string;
  hasPassword: boolean;
  path: string;
  remote: string;
  connected: boolean;
  error: string | null;
}

export interface SharesStatus {
  shares: NetworkShare[];
  platform: string;
  protocols: ShareProtocol[];
  hint: string | null;
}

export interface FileManagerSettings {
  showHiddenFiles: boolean;
  showFileExtensions: boolean;
  showFolderSizes: boolean;
  confirmDelete: boolean;
}

export type UsageNodeType = "dir" | "file" | "other" | "free";

export interface UsageNode {
  name: string;
  type: UsageNodeType;
  size: number;
  files: number;
  ext: string | null;
  children?: UsageNode[];
}

export interface UsageLargestFile {
  name: string;
  path: string;
  size: number;
  ext: string | null;
}

export interface UsageProgress {
  bytes: number;
  files: number;
  dirs: number;
  scanning: string;
}

export interface UsageTree {
  path: string;
  name: string;
  size: number;
  files: number;
  dirs: number;
  partial: boolean;
  elapsedMs: number;
  tree: UsageNode;
  largest: UsageLargestFile[];
}

export interface HistorySettings {
  enabled: boolean;
  intervalSeconds: number;
  retentionDays: number;
  maxSizeMb: number;
}

export interface ActivitySettings {
  enabled: boolean;
  retentionDays: number;
  maxSizeMb: number;
}

export interface TerminalSettings {
  osUser: string;
}

export interface Settings {
  files: FileManagerSettings;
  history: HistorySettings;
  activity: ActivitySettings;
  terminal: TerminalSettings;
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
  cpuCores: HistoryCpuCoreSeries[];
  gpus: HistoryGpuSeries[];
}

export interface HistoryCpuCoreSeries {
  index: number;
  load: (number | null)[];
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

export interface ActivityStats {
  enabled: boolean;
  retentionDays: number;
  maxSizeMb: number;
  rowCount: number;
  oldest: number | null;
  newest: number | null;
  dbBytes: number;
  bytesPerEntry: number;
  estimatedDaysToFull: number | null;
}

export type Role = "viewer" | "user" | "admin";

export interface User {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  createdAt: number;
  hasRecovery?: boolean;
  recoveryQuestion?: string | null;
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

export interface PendingPackage {
  name: string;
  description: string | null;
  currentVersion: string | null;
  newVersion: string;
  source: string;
}

export interface UpdatesStatus {
  available: boolean;
  platform: string;
  manager: "apt" | "winget" | "softwareupdate" | null;
  pendingCount: number | null;
  items: PendingPackage[];
  canInstall: boolean;
  hint: string | null;
}

export type UpdatePhase = "refresh" | "apply";

export interface UpdateJob {
  running: boolean;
  phase: "idle" | "refresh" | "apply" | "done" | "error";
  progress: number;
  log: string;
  error: string | null;
}

export interface UpdatesPhaseResult {
  ok: boolean;
  phase: UpdatePhase;
  label: string;
  output: string;
}

export interface UpdatesRunResult {
  ok: boolean;
  scope: "packages" | "all";
  message: string;
  output: string;
  steps: Array<{ label: string; output: string }>;
}

export interface AppUpdateStatus {
  enabled: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  canInstall: boolean;
  repo: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  installRoot: string | null;
  platform: string;
  hint: string | null;
  checkedAt: string | null;
  prerelease: boolean;
  releases?: AppReleaseOption[];
}

export interface AppReleaseOption {
  version: string;
  prerelease: boolean;
  publishedAt: string | null;
}

export interface AppUpdateJob {
  running: boolean;
  phase: "idle" | "download" | "extract" | "finalize" | "restart" | "done" | "error";
  progress: number;
  log: string;
  error: string | null;
}

export type PowerAction = "reboot" | "shutdown" | "poweroff";

export interface PowerCapabilities {
  available: boolean;
  platform: string;
  actions: PowerAction[];
  needsElevation: boolean;
  defaultDelaySeconds: number;
  hint: string | null;
}

export interface PowerRunResult {
  ok: true;
  action: PowerAction;
  delaySeconds: number;
  message: string;
}

export type PublicAccessMode =
  | "local-config"
  | "dashboard"
  | "running-unread"
  | "missing";

export interface PublicAccessStatus {
  port: number;
  origin: string;
  self: IngressRoute | null;
  rememberedHostname: string | null;
  conflict: IngressRoute | null;
  canWrite: boolean;
  mode: PublicAccessMode;
  ingress: IngressDiscovery;
  result?: AddIngressResult | null;
  notice?: string | null;
}

export type GitProvider = "github" | "gitlab";

export type ActionStepType =
  | "git_pull"
  | "command"
  | "docker_restart"
  | "docker_ensure"
  | "compose_up"
  | "systemd_restart"
  | "systemd_enable"
  | "systemd_apply"
  | "publish";

export type RunKind = "none" | "docker" | "compose" | "systemd" | "static";
export type ServiceKind = "website" | "api" | "worker";

export interface GitAccountPublic {
  id: number;
  provider: GitProvider;
  login: string;
  host: string;
  tokenLast4: string;
  createdAt: number;
}

export interface GitAccountDetails {
  account: GitAccountPublic;
  tokenKind: string;
  scopes: string[];
  expiresAt: string | null;
  profile: {
    login: string;
    name: string | null;
    htmlUrl: string | null;
    avatarUrl: string | null;
    email: string | null;
    company: string | null;
    location: string | null;
    bio: string | null;
    publicRepos: number | null;
    privateRepos: number | null;
    accountCreatedAt: string | null;
  } | null;
  rateLimit: { limit: number; remaining: number; resetAt: number | null } | null;
  error: string | null;
  cachedAt: number | null;
  projects: Array<{ id: number; name: string; localPath: string }>;
}

export interface GitRepoInfo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
}

export interface ActionStep {
  id: number;
  sortOrder: number;
  type: ActionStepType;
  command: string | null;
  container: string | null;
  unit: string | null;
  source: string | null;
  dest: string | null;
}

export interface StepInput {
  type: ActionStepType;
  command?: string | null;
  container?: string | null;
  unit?: string | null;
  source?: string | null;
  dest?: string | null;
}

export interface ProjectAction {
  id: number;
  projectId: number;
  name: string;
  sortOrder: number;
  createdAt: number;
  steps: ActionStep[];
}

export interface ActionRun {
  id: number;
  projectId: number;
  actionId: number | null;
  actionName: string;
  status: "running" | "ok" | "error";
  log: string;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface ProjectSummary {
  id: number;
  name: string;
  localPath: string;
  remoteUrl: string;
  branch: string;
  accountId: number | null;
  createdAt: number;
  siteUrl: string | null;
  runKind: RunKind;
  serviceKind: ServiceKind;
  port: number | null;
  boot: boolean;
  container: string | null;
  composeFile: string | null;
  unit: string | null;
  publishFrom: string | null;
  publishTo: string | null;
  startCommand: string | null;
  healthPath: string | null;
  embedPreview: boolean;
  embedUrl: string | null;
  notes: string | null;
  lastRun: ActionRun | null;
}

export interface ProjectDetail extends ProjectSummary {
  actions: ProjectAction[];
}

export interface ProjectsCapabilities {
  platform: string;
  git: boolean;
  systemd: boolean;
  compose: boolean;
}

export interface IngressRoute {
  hostname: string;
  url: string;
  service: string;
  port: number | null;
  source: string;
}

export interface IngressDiscovery {
  routes: IngressRoute[];
  sources: string[];
  running: boolean;
  remotelyManaged: boolean;
  note: string | null;
  tunnelId?: string | null;
  dnsTarget?: string | null;
}

export interface AddIngressResult {
  added: boolean;
  already: boolean;
  updated?: boolean;
  file: string | null;
  reloaded: string | null;
  dns: string | null;
  ingress: IngressDiscovery;
}

export interface ProjectsOverview {
  projects: ProjectSummary[];
  accounts: GitAccountPublic[];
  capabilities: ProjectsCapabilities;
  ingress?: IngressDiscovery;
  cloudflare?: CloudflareAccountPublic;
}

export type SiteProbeState = "up" | "degraded" | "down" | "skipped";
export type SiteOverallState = "up" | "degraded" | "down" | "unknown";
export type SiteRuntimeState = "running" | "stopped" | "missing" | "unknown" | "skipped";

export interface CloudflareAccountPublic {
  connected: boolean;
  email: string | null;
  tokenLast4: string | null;
  source: "stored" | "env" | null;
}

export interface SiteProbe {
  target: string;
  state: SiteProbeState;
  statusCode: number | null;
  ms: number | null;
  error: string | null;
}

export interface SiteRuntimeStatus {
  kind: RunKind;
  state: SiteRuntimeState;
  detail: string | null;
}

export interface SiteTraffic {
  requests24h: number | null;
  visits24h: number | null;
  bytes24h: number | null;
  error: string | null;
}

export interface ProjectSiteStatus {
  projectId: number;
  overall: SiteOverallState;
  public: SiteProbe | null;
  origin: SiteProbe | null;
  runtime: SiteRuntimeStatus;
  traffic: SiteTraffic | null;
  checkedAt: number;
}

export interface SitesStatusResponse {
  sites: ProjectSiteStatus[];
  cloudflare: CloudflareAccountPublic;
  hint: string | null;
}

export interface GitCheckResult {
  ok: boolean;
  cloned: boolean;
  branch: string;
  headSha: string | null;
  remoteSha: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  message: string | null;
}

export interface ActionJob {
  running: boolean;
  projectId: number;
  actionId: number | null;
  actionName: string;
  phase: "idle" | "running" | "done" | "error";
  stepIndex: number;
  stepCount: number;
  stepLabel: string;
  progress: number;
  log: string;
  error: string | null;
  runId: number | null;
}

export type BackupReason = "manual" | "pre-update" | "pre-restore";

export interface BackupSnapshot {
  id: string;
  fileName: string;
  reason: BackupReason;
  createdAt: number;
  sizeBytes: number;
}

export interface TrashItem {
  id: string;
  name: string;
  originalPath: string;
  type: "dir" | "file";
  deletedAt: number;
  deletedBy: string | null;
  sizeBytes: number | null;
}
