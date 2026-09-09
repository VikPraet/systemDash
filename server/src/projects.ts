import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.js";

const DB_FILE = path.join(DATA_DIR, "projects.db");

export function projectsDataDir(): string {
  return DATA_DIR;
}

export class ProjectsError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
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
  | "publish"
  | "worker_apply";
export type RunKind = "none" | "docker" | "compose" | "systemd" | "static" | "process";
export type ServiceKind = "website" | "api" | "worker";
export type RunStatus = "running" | "ok" | "error";
export type RestartPolicy = "always" | "on-failure" | "no";

export interface ProjectEnvVar {
  id: number;
  key: string;
  value: string | null;
  secret: boolean;
  sortOrder: number;
}

export interface EnvVarInput {
  id?: number;
  key: string;
  value?: string | null;
  secret?: boolean;
}

export interface GitAccountPublic {
  id: number;
  provider: GitProvider;
  login: string;
  host: string;
  tokenLast4: string;
  createdAt: number;
}

export interface GitAccountRecord extends GitAccountPublic {
  token: string;
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
  status: RunStatus;
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
  managed: boolean;
  clonedByBeacon: boolean;
  image: string | null;
  dockerfile: string | null;
  buildContext: string | null;
  buildCommand: string | null;
  workDir: string | null;
  cpuLimit: number | null;
  memoryLimitMb: number | null;
  replicas: number;
  restartPolicy: RestartPolicy;
  restartMaxRetries: number | null;
  restartBackoffMs: number;
  schedule: string | null;
  autoscaleEnabled: boolean;
  autoscaleMin: number;
  autoscaleMax: number;
  autoscaleCpuTarget: number | null;
  autoscaleMemTarget: number | null;
  autodeploy: boolean;
  autodeployIntervalS: number;
  lastRun: ActionRun | null;
}

export interface ProjectDetail extends ProjectSummary {
  actions: ProjectAction[];
  env: ProjectEnvVar[];
}

export interface StepInput {
  type: ActionStepType;
  command?: string | null;
  container?: string | null;
  unit?: string | null;
  source?: string | null;
  dest?: string | null;
}

const STEP_TYPES = new Set<ActionStepType>([
  "git_pull",
  "command",
  "docker_restart",
  "docker_ensure",
  "compose_up",
  "systemd_restart",
  "systemd_enable",
  "systemd_apply",
  "publish",
  "worker_apply",
]);
const RUN_KINDS = new Set<RunKind>(["none", "docker", "compose", "systemd", "static", "process"]);
const SERVICE_KINDS = new Set<ServiceKind>(["website", "api", "worker"]);
const RESTART_POLICIES = new Set<RestartPolicy>(["always", "on-failure", "no"]);
const WORKER_COLUMNS = [
  "managed INTEGER NOT NULL DEFAULT 0",
  "cloned_by_beacon INTEGER NOT NULL DEFAULT 0",
  "image TEXT",
  "dockerfile TEXT",
  "build_context TEXT",
  "build_command TEXT",
  "work_dir TEXT",
  "cpu_limit REAL",
  "memory_limit_mb INTEGER",
  "replicas INTEGER NOT NULL DEFAULT 1",
  "restart_policy TEXT NOT NULL DEFAULT 'always'",
  "restart_max_retries INTEGER",
  "restart_backoff_ms INTEGER NOT NULL DEFAULT 3000",
  "schedule TEXT",
  "autoscale_enabled INTEGER NOT NULL DEFAULT 0",
  "autoscale_min INTEGER NOT NULL DEFAULT 1",
  "autoscale_max INTEGER NOT NULL DEFAULT 1",
  "autoscale_cpu_target INTEGER",
  "autoscale_mem_target INTEGER",
  "autodeploy INTEGER NOT NULL DEFAULT 0",
  "autodeploy_interval_s INTEGER NOT NULL DEFAULT 300",
];

function migrateOptionalProjectSource(fresh: DatabaseSync): void {
  const cols = fresh.prepare("PRAGMA table_info(projects)").all() as Array<{
    name: string;
    notnull: number;
  }>;
  const local = cols.find((c) => c.name === "local_path");
  if (!local || local.notnull === 0) return;

  fresh.exec("PRAGMA foreign_keys = OFF;");
  fresh.exec(`
    CREATE TABLE projects_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      local_path TEXT UNIQUE,
      remote_url TEXT NOT NULL DEFAULT '',
      branch TEXT NOT NULL DEFAULT '',
      account_id INTEGER,
      created_at INTEGER NOT NULL,
      site_url TEXT,
      run_kind TEXT NOT NULL DEFAULT 'none',
      port INTEGER,
      boot INTEGER NOT NULL DEFAULT 0,
      container TEXT,
      compose_file TEXT,
      unit TEXT,
      publish_from TEXT,
      publish_to TEXT,
      start_command TEXT,
      service_kind TEXT NOT NULL DEFAULT 'website',
      health_path TEXT,
      embed_preview INTEGER NOT NULL DEFAULT 0,
      embed_url TEXT,
      notes TEXT,
      FOREIGN KEY (account_id) REFERENCES git_accounts(id) ON DELETE SET NULL
    );
  `);
  fresh.exec(`
    INSERT INTO projects_new (
      id, name, local_path, remote_url, branch, account_id, created_at,
      site_url, run_kind, port, boot, container, compose_file, unit,
      publish_from, publish_to, start_command, service_kind, health_path,
      embed_preview, embed_url, notes
    )
    SELECT
      id, name, local_path, remote_url, branch, account_id, created_at,
      site_url, run_kind, port, boot, container, compose_file, unit,
      publish_from, publish_to, start_command, service_kind, health_path,
      embed_preview, embed_url, notes
    FROM projects;
  `);
  fresh.exec("DROP TABLE projects;");
  fresh.exec("ALTER TABLE projects_new RENAME TO projects;");
  fresh.exec("PRAGMA foreign_keys = ON;");
}

let db: DatabaseSync | null = null;

export function projectsDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = new DatabaseSync(DB_FILE);
  fresh.exec("PRAGMA journal_mode = WAL;");
  fresh.exec("PRAGMA synchronous = NORMAL;");
  fresh.exec("PRAGMA foreign_keys = ON;");
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS git_accounts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      provider   TEXT NOT NULL UNIQUE,
      token      TEXT NOT NULL,
      login      TEXT NOT NULL,
      host       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cloudflare_account (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      token        TEXT NOT NULL,
      email        TEXT,
      token_last4  TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      local_path TEXT UNIQUE,
      remote_url TEXT NOT NULL DEFAULT '',
      branch     TEXT NOT NULL DEFAULT '',
      account_id INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES git_accounts(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS actions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS action_steps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id  INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      type       TEXT NOT NULL,
      command    TEXT,
      container  TEXT,
      unit       TEXT,
      FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS action_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL,
      action_id   INTEGER,
      action_name TEXT NOT NULL,
      status      TEXT NOT NULL,
      log         TEXT NOT NULL DEFAULT '',
      error       TEXT,
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_actions_project ON actions (project_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_steps_action ON action_steps (action_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_runs_project ON action_runs (project_id, started_at DESC);
  `);
  for (const col of [
    "site_url TEXT",
    "run_kind TEXT NOT NULL DEFAULT 'none'",
    "port INTEGER",
    "boot INTEGER NOT NULL DEFAULT 0",
    "container TEXT",
    "compose_file TEXT",
    "unit TEXT",
    "publish_from TEXT",
    "publish_to TEXT",
    "start_command TEXT",
    "service_kind TEXT NOT NULL DEFAULT 'website'",
    "health_path TEXT",
    "embed_preview INTEGER NOT NULL DEFAULT 0",
    "embed_url TEXT",
    "notes TEXT",
    ...WORKER_COLUMNS,
  ]) {
    try {
      fresh.exec(`ALTER TABLE projects ADD COLUMN ${col};`);
    } catch {
      // already present
    }
  }
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS project_env (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      secret INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_env ON project_env (project_id, sort_order);
  `);
  for (const col of ["source TEXT", "dest TEXT"]) {
    try {
      fresh.exec(`ALTER TABLE action_steps ADD COLUMN ${col};`);
    } catch {
      // already present
    }
  }
  migrateOptionalProjectSource(fresh);
  // Interrupted runs from a previous process — mark them failed so the UI
  // never sits on a stuck "running" row.
  fresh
    .prepare(
      `UPDATE action_runs
          SET status = 'error',
              error = COALESCE(error, 'interrupted (server restarted)'),
              finished_at = ?
        WHERE status = 'running'`
    )
    .run(Date.now());
  db = fresh;
  return db;
}

/** Flushes the WAL so a file copy of projects.db is consistent. */
export function checkpointProjectsDb(): void {
  if (!db && !fs.existsSync(DB_FILE)) return;
  try {
    projectsDb().exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    // Best-effort; the copy still includes -wal/-shm when present.
  }
}

/** Closes the projects database so files can be replaced (restore). */
export function closeProjectsDb(): void {
  if (!db) return;
  try {
    db.close();
  } catch {
    // Ignore close errors so restore can still swap files.
  }
  db = null;
}

export function isGitProvider(v: unknown): v is GitProvider {
  return v === "github" || v === "gitlab";
}

export function isRunKind(v: unknown): v is RunKind {
  return typeof v === "string" && RUN_KINDS.has(v as RunKind);
}

export function isServiceKind(v: unknown): v is ServiceKind {
  return typeof v === "string" && SERVICE_KINDS.has(v as ServiceKind);
}

export function isRestartPolicy(v: unknown): v is RestartPolicy {
  return typeof v === "string" && RESTART_POLICIES.has(v as RestartPolicy);
}

export function isStepType(v: unknown): v is ActionStepType {
  return typeof v === "string" && STEP_TYPES.has(v as ActionStepType);
}

function tokenLast4(token: string): string {
  const t = token.trim();
  if (t.length <= 4) return t;
  return t.slice(-4);
}

function mapAccount(row: {
  id: number;
  provider: string;
  token: string;
  login: string;
  host: string;
  created_at: number;
}): GitAccountRecord {
  return {
    id: row.id,
    provider: row.provider as GitProvider,
    login: row.login,
    host: row.host,
    token: row.token,
    tokenLast4: tokenLast4(row.token),
    createdAt: row.created_at,
  };
}

export function toPublicAccount(acc: GitAccountRecord): GitAccountPublic {
  const { token: _token, ...pub } = acc;
  return pub;
}

export function listAccounts(): GitAccountPublic[] {
  const rows = projectsDb()
    .prepare(
      "SELECT id, provider, token, login, host, created_at FROM git_accounts ORDER BY provider"
    )
    .all() as Array<{
    id: number;
    provider: string;
    token: string;
    login: string;
    host: string;
    created_at: number;
  }>;
  return rows.map((r) => toPublicAccount(mapAccount(r)));
}

export function getAccountById(id: number): GitAccountRecord | null {
  const row = projectsDb()
    .prepare(
      "SELECT id, provider, token, login, host, created_at FROM git_accounts WHERE id = ?"
    )
    .get(id) as
    | {
        id: number;
        provider: string;
        token: string;
        login: string;
        host: string;
        created_at: number;
      }
    | undefined;
  return row ? mapAccount(row) : null;
}

export function getAccountByProvider(provider: GitProvider): GitAccountRecord | null {
  const row = projectsDb()
    .prepare(
      "SELECT id, provider, token, login, host, created_at FROM git_accounts WHERE provider = ?"
    )
    .get(provider) as
    | {
        id: number;
        provider: string;
        token: string;
        login: string;
        host: string;
        created_at: number;
      }
    | undefined;
  return row ? mapAccount(row) : null;
}

export function upsertAccount(input: {
  provider: GitProvider;
  token: string;
  login: string;
  host: string;
}): GitAccountPublic {
  const now = Date.now();
  const existing = getAccountByProvider(input.provider);
  if (existing) {
    projectsDb()
      .prepare(
        "UPDATE git_accounts SET token = ?, login = ?, host = ? WHERE id = ?"
      )
      .run(input.token, input.login, input.host, existing.id);
    return toPublicAccount(getAccountById(existing.id)!);
  }
  const info = projectsDb()
    .prepare(
      "INSERT INTO git_accounts (provider, token, login, host, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(input.provider, input.token, input.login, input.host, now);
  return toPublicAccount(getAccountById(Number(info.lastInsertRowid))!);
}

export function deleteAccount(id: number): void {
  const info = projectsDb().prepare("DELETE FROM git_accounts WHERE id = ?").run(id);
  if (info.changes === 0) throw new ProjectsError(404, "git account not found");
}

export function sanitizeBranch(raw: unknown, fallback = "main"): string {
  if (typeof raw !== "string") return fallback;
  const b = raw.trim();
  if (!b) return fallback;
  if (b.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(b) || b.includes("..")) {
    throw new ProjectsError(400, "invalid branch name");
  }
  return b;
}

export function sanitizeOptionalBranch(raw: unknown): string {
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
    return "";
  }
  return sanitizeBranch(raw, "");
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") throw new ProjectsError(400, "name is required");
  const n = raw.trim();
  if (!n) throw new ProjectsError(400, "name is required");
  if (n.length > 80) throw new ProjectsError(400, "name is too long");
  return n;
}

export function sanitizeLocalPath(raw: unknown): string {
  if (typeof raw !== "string") throw new ProjectsError(400, "local path is required");
  let p = raw.trim();
  if (!p) throw new ProjectsError(400, "local path is required");
  if (/^[A-Za-z]:$/.test(p)) p += path.sep;
  p = path.normalize(p);
  if (!path.isAbsolute(p)) {
    throw new ProjectsError(400, "local path must be absolute");
  }
  if (path.parse(p).root === p) {
    throw new ProjectsError(400, "pick a folder on the drive, not the drive root");
  }
  if (p.length > 500) throw new ProjectsError(400, "local path is too long");
  return p;
}

export function sanitizeOptionalLocalPath(raw: unknown): string | null {
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
    return null;
  }
  return sanitizeLocalPath(raw);
}

export function sanitizeSiteUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid site URL");
  const u = raw.trim();
  if (!u) return null;
  if (u.length > 500) throw new ProjectsError(400, "site URL is too long");
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new ProjectsError(400, "site URL must be http(s)");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProjectsError(400, "site URL must be http(s)");
  }
  return parsed.toString().replace(/\/+$/, "") || parsed.origin;
}

export function sanitizeRunKind(raw: unknown): RunKind {
  if (raw === undefined || raw === null || raw === "") return "none";
  if (!isRunKind(raw)) {
    throw new ProjectsError(400, "run kind must be none, docker, compose, systemd, static, or process");
  }
  if (raw === "systemd" && process.platform !== "linux") {
    throw new ProjectsError(400, "systemd is only available on Linux");
  }
  return raw;
}

export function sanitizeServiceKind(raw: unknown): ServiceKind {
  if (raw === undefined || raw === null || raw === "") return "website";
  if (!isServiceKind(raw)) {
    throw new ProjectsError(400, "kind must be website, api, or worker");
  }
  return raw;
}

export function sanitizeHealthPath(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid health path");
  let p = raw.trim().replace(/\\/g, "/");
  if (!p || p === "/") return null;
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 200) throw new ProjectsError(400, "health path is too long");
  if (p.includes("..") || p.includes("://") || p.includes("\\")) {
    throw new ProjectsError(400, "invalid health path");
  }
  return p;
}

export function sanitizeNotes(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid notes");
  const n = raw.replace(/\r\n/g, "\n").trim();
  if (!n) return null;
  if (n.length > 2000) throw new ProjectsError(400, "notes are too long");
  return n;
}

export function sanitizeEmbedPreview(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

export function sanitizePort(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ProjectsError(400, "port must be 1–65535");
  }
  return n;
}

export function sanitizeBoot(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

export function sanitizeRelPath(raw: unknown, label: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new ProjectsError(400, `invalid ${label}`);
  const p = raw.trim().replace(/\\/g, "/");
  if (!p) return null;
  if (p.length > 300) throw new ProjectsError(400, `${label} is too long`);
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p) || p.startsWith("/")) {
    throw new ProjectsError(400, `${label} must be relative to the project folder`);
  }
  if (p.split("/").some((part) => part === "..")) {
    throw new ProjectsError(400, `${label} cannot contain ..`);
  }
  return p;
}

export function sanitizeUnitName(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid systemd unit");
  const u = raw.trim();
  if (!u) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,255}$/.test(u)) {
    throw new ProjectsError(400, "invalid systemd unit");
  }
  return u;
}

export function sanitizeContainerName(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid container name");
  const c = raw.trim();
  if (!c) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/.test(c)) {
    throw new ProjectsError(400, "invalid container name");
  }
  return c;
}

export function sanitizeStartCommand(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid start command");
  const c = raw.trim();
  if (!c) return null;
  if (c.length > 2000) throw new ProjectsError(400, "start command is too long");
  return c;
}

export function sanitizeBool(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

export function sanitizeImage(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid image");
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 500) throw new ProjectsError(400, "image is too long");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@+-]*$/.test(v)) {
    throw new ProjectsError(400, "invalid image name");
  }
  return v;
}

export function sanitizeDockerfile(raw: unknown): string | null {
  return sanitizeRelPath(raw, "Dockerfile");
}

export function sanitizeWorkDir(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid working directory");
  const p = raw.trim();
  if (!p) return null;
  if (p.length > 400) throw new ProjectsError(400, "working directory is too long");
  return p;
}

export function sanitizeCpuLimit(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 256) {
    throw new ProjectsError(400, "CPU limit must be between 0 and 256 cores");
  }
  return Math.round(n * 1000) / 1000;
}

export function sanitizeMemoryMb(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 16 || n > 1024 * 1024) {
    throw new ProjectsError(400, "memory must be 16–1048576 MB");
  }
  return n;
}

export function sanitizeReplicas(raw: unknown, fallback = 1): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 32) {
    throw new ProjectsError(400, "replicas must be 1–32");
  }
  return n;
}

export function sanitizeRestartPolicy(raw: unknown): RestartPolicy {
  if (raw === undefined || raw === null || raw === "") return "always";
  if (!isRestartPolicy(raw)) {
    throw new ProjectsError(400, "restart policy must be always, on-failure, or no");
  }
  return raw;
}

export function sanitizePositiveInt(raw: unknown, label: string, min: number, max: number): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ProjectsError(400, `${label} must be ${min}–${max}`);
  }
  return n;
}

export function sanitizeSchedule(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid schedule");
  const s = raw.trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  if (parts.length !== 5) {
    throw new ProjectsError(400, "schedule must be a 5-field cron expression");
  }
  if (s.length > 80) throw new ProjectsError(400, "schedule is too long");
  return s;
}

export function sanitizePercent(raw: unknown, label: string): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new ProjectsError(400, `${label} must be 1–100`);
  }
  return n;
}

export function sanitizeEnvKey(raw: unknown): string {
  if (typeof raw !== "string") throw new ProjectsError(400, "env key is required");
  const k = raw.trim();
  if (!k) throw new ProjectsError(400, "env key is required");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
    throw new ProjectsError(400, `invalid env key: ${k}`);
  }
  if (k.length > 120) throw new ProjectsError(400, "env key is too long");
  return k;
}

export function sanitizeEnvValue(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new ProjectsError(400, "invalid env value");
  if (raw.length > 8000) throw new ProjectsError(400, "env value is too long");
  return raw;
}

export function sanitizeRemoteUrl(raw: unknown, opts?: { optional?: boolean }): string {
  if (opts?.optional && (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim()))) {
    return "";
  }
  if (typeof raw !== "string") throw new ProjectsError(400, "repo URL is required");
  const url = normalizeRemoteUrl(raw.trim());
  if (!url) throw new ProjectsError(400, "repo URL is required");
  if (url.length > 500) throw new ProjectsError(400, "repo URL is too long");
  if (!/^https:\/\//i.test(url)) {
    throw new ProjectsError(
      400,
      "use an HTTPS git URL (SSH remotes are not supported yet)"
    );
  }
  return url;
}

export function projectHasGit(p: { remoteUrl?: string | null }): boolean {
  return !!(p.remoteUrl && p.remoteUrl.trim());
}

export function projectHasFolder(p: { localPath?: string | null }): boolean {
  return !!(p.localPath && p.localPath.trim());
}

export function validateProjectShape(p: {
  serviceKind: ServiceKind;
  remoteUrl: string;
  localPath: string | null;
  runKind: RunKind;
  container: string | null;
  unit: string | null;
  managed?: boolean;
  image?: string | null;
  dockerfile?: string | null;
  startCommand?: string | null;
  replicas?: number;
}): void {
  const git = projectHasGit(p);
  const folder = projectHasFolder({ localPath: p.localPath });
  if (p.serviceKind === "website" || p.serviceKind === "api") {
    if (!git) throw new ProjectsError(400, "websites and APIs need a git repo");
    if (!folder) throw new ProjectsError(400, "local path is required");
  }
  if (p.serviceKind === "worker") {
    if (p.runKind === "static") {
      throw new ProjectsError(400, "workers do not publish a static site");
    }
    if (p.runKind === "none") {
      throw new ProjectsError(400, "pick how this worker runs (Docker, Compose, systemd, or a process)");
    }
    if (git && !folder) {
      throw new ProjectsError(400, "local folder is required to clone the repo");
    }
    if (p.runKind === "compose" && !folder) {
      throw new ProjectsError(400, "Compose needs a folder for the compose file");
    }
    if (p.runKind === "process" && !p.startCommand) {
      throw new ProjectsError(400, "a start command is required for a native worker");
    }
    if (p.runKind === "systemd" && !p.unit && !p.startCommand) {
      throw new ProjectsError(400, "systemd unit or start command is required");
    }
    if ((p.runKind === "systemd" || p.runKind === "compose") && (p.replicas ?? 1) > 1) {
      throw new ProjectsError(400, "replicas only apply to Docker and native process workers");
    }
    if (p.runKind === "docker" && p.dockerfile && !folder) {
      throw new ProjectsError(400, "building a Dockerfile needs a project folder");
    }
  }
}

/** Converts git@host:path and ssh:// URLs to https://, strips trailing slashes. */
export function normalizeRemoteUrl(input: string): string {
  let u = input.trim();
  if (!u) return "";
  const scp = /^git@([^:]+):(.+)$/.exec(u);
  if (scp) {
    u = `https://${scp[1]}/${scp[2]}`;
  } else {
    const ssh = /^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/i.exec(u);
    if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
  }
  u = u.replace(/\/+$/, "");
  return u;
}

export function remotesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    normalizeRemoteUrl(s).replace(/\.git$/i, "").toLowerCase();
  return norm(a) === norm(b);
}

export function remoteHost(url: string): string {
  try {
    return new URL(normalizeRemoteUrl(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function providerForUrl(url: string): GitProvider | null {
  const host = remoteHost(url);
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "gitlab.com" || host.endsWith(".gitlab.com")) return "gitlab";
  const gitlab = getAccountByProvider("gitlab");
  if (gitlab && host === gitlab.host.toLowerCase()) return "gitlab";
  return null;
}

function mapRun(row: {
  id: number;
  project_id: number;
  action_id: number | null;
  action_name: string;
  status: string;
  log: string;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}): ActionRun {
  return {
    id: row.id,
    projectId: row.project_id,
    actionId: row.action_id,
    actionName: row.action_name,
    status: row.status as RunStatus,
    log: row.log,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function getLatestRun(projectId: number): ActionRun | null {
  const row = projectsDb()
    .prepare(
      `SELECT id, project_id, action_id, action_name, status, log, error, started_at, finished_at
         FROM action_runs
        WHERE project_id = ?
        ORDER BY started_at DESC, id DESC
        LIMIT 1`
    )
    .get(projectId) as
    | {
        id: number;
        project_id: number;
        action_id: number | null;
        action_name: string;
        status: string;
        log: string;
        error: string | null;
        started_at: number;
        finished_at: number | null;
      }
    | undefined;
  return row ? mapRun(row) : null;
}

type ProjectRow = {
  id: number;
  name: string;
  local_path: string | null;
  remote_url: string;
  branch: string;
  account_id: number | null;
  created_at: number;
  site_url: string | null;
  run_kind: string | null;
  port: number | null;
  boot: number | null;
  container: string | null;
  compose_file: string | null;
  unit: string | null;
  publish_from: string | null;
  publish_to: string | null;
  start_command: string | null;
  service_kind: string | null;
  health_path: string | null;
  embed_preview: number | null;
  embed_url: string | null;
  notes: string | null;
  managed: number | null;
  cloned_by_beacon: number | null;
  image: string | null;
  dockerfile: string | null;
  build_context: string | null;
  build_command: string | null;
  work_dir: string | null;
  cpu_limit: number | null;
  memory_limit_mb: number | null;
  replicas: number | null;
  restart_policy: string | null;
  restart_max_retries: number | null;
  restart_backoff_ms: number | null;
  schedule: string | null;
  autoscale_enabled: number | null;
  autoscale_min: number | null;
  autoscale_max: number | null;
  autoscale_cpu_target: number | null;
  autoscale_mem_target: number | null;
  autodeploy: number | null;
  autodeploy_interval_s: number | null;
};

const PROJECT_COLS = `id, name, local_path, remote_url, branch, account_id, created_at,
         site_url, run_kind, port, boot, container, compose_file, unit,
         publish_from, publish_to, start_command, service_kind, health_path,
         embed_preview, embed_url, notes,
         managed, cloned_by_beacon, image, dockerfile, build_context, build_command,
         work_dir, cpu_limit, memory_limit_mb, replicas, restart_policy,
         restart_max_retries, restart_backoff_ms, schedule, autoscale_enabled,
         autoscale_min, autoscale_max, autoscale_cpu_target, autoscale_mem_target,
         autodeploy, autodeploy_interval_s`;

function mapProject(row: ProjectRow): ProjectSummary {
  const kind = isRunKind(row.run_kind) ? row.run_kind : "none";
  const serviceKind = isServiceKind(row.service_kind) ? row.service_kind : "website";
  const restart = isRestartPolicy(row.restart_policy) ? row.restart_policy : "always";
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path || "",
    remoteUrl: row.remote_url || "",
    branch: row.branch || "",
    accountId: row.account_id,
    createdAt: row.created_at,
    siteUrl: row.site_url || null,
    runKind: kind,
    serviceKind,
    port: typeof row.port === "number" && row.port > 0 ? row.port : null,
    boot: !!row.boot,
    container: row.container,
    composeFile: row.compose_file,
    unit: row.unit,
    publishFrom: row.publish_from,
    publishTo: row.publish_to,
    startCommand: row.start_command,
    healthPath: row.health_path || null,
    embedPreview: !!row.embed_preview,
    embedUrl: row.embed_url || null,
    notes: row.notes || null,
    managed: !!row.managed,
    clonedByBeacon: !!row.cloned_by_beacon,
    image: row.image || null,
    dockerfile: row.dockerfile || null,
    buildContext: row.build_context || null,
    buildCommand: row.build_command || null,
    workDir: row.work_dir || null,
    cpuLimit: typeof row.cpu_limit === "number" ? row.cpu_limit : null,
    memoryLimitMb: typeof row.memory_limit_mb === "number" ? row.memory_limit_mb : null,
    replicas: Math.max(1, row.replicas ?? 1),
    restartPolicy: restart,
    restartMaxRetries: row.restart_max_retries,
    restartBackoffMs: row.restart_backoff_ms ?? 3000,
    schedule: row.schedule || null,
    autoscaleEnabled: !!row.autoscale_enabled,
    autoscaleMin: Math.max(1, row.autoscale_min ?? 1),
    autoscaleMax: Math.max(1, row.autoscale_max ?? 1),
    autoscaleCpuTarget: row.autoscale_cpu_target,
    autoscaleMemTarget: row.autoscale_mem_target,
    autodeploy: !!row.autodeploy,
    autodeployIntervalS: row.autodeploy_interval_s ?? 300,
    lastRun: getLatestRun(row.id),
  };
}

export function listProjects(): ProjectSummary[] {
  const rows = projectsDb()
    .prepare(
      `SELECT ${PROJECT_COLS}
         FROM projects
        ORDER BY name COLLATE NOCASE`
    )
    .all() as ProjectRow[];
  return rows.map(mapProject);
}

export function getProject(id: number): ProjectSummary | null {
  const row = projectsDb()
    .prepare(
      `SELECT ${PROJECT_COLS}
         FROM projects WHERE id = ?`
    )
    .get(id) as ProjectRow | undefined;
  return row ? mapProject(row) : null;
}

export function requireProject(id: number): ProjectSummary {
  const p = getProject(id);
  if (!p) throw new ProjectsError(404, "project not found");
  return p;
}

function loadSteps(actionId: number): ActionStep[] {
  const rows = projectsDb()
    .prepare(
      `SELECT id, sort_order, type, command, container, unit, source, dest
         FROM action_steps
        WHERE action_id = ?
        ORDER BY sort_order, id`
    )
    .all(actionId) as Array<{
    id: number;
    sort_order: number;
    type: string;
    command: string | null;
    container: string | null;
    unit: string | null;
    source: string | null;
    dest: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    sortOrder: r.sort_order,
    type: r.type as ActionStepType,
    command: r.command,
    container: r.container,
    unit: r.unit,
    source: r.source,
    dest: r.dest,
  }));
}

export function listActions(projectId: number): ProjectAction[] {
  const rows = projectsDb()
    .prepare(
      `SELECT id, project_id, name, sort_order, created_at
         FROM actions
        WHERE project_id = ?
        ORDER BY sort_order, id`
    )
    .all(projectId) as Array<{
    id: number;
    project_id: number;
    name: string;
    sort_order: number;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    steps: loadSteps(r.id),
  }));
}

export function getAction(projectId: number, actionId: number): ProjectAction | null {
  const row = projectsDb()
    .prepare(
      `SELECT id, project_id, name, sort_order, created_at
         FROM actions WHERE id = ? AND project_id = ?`
    )
    .get(actionId, projectId) as
    | {
        id: number;
        project_id: number;
        name: string;
        sort_order: number;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    steps: loadSteps(row.id),
  };
}

export function requireAction(projectId: number, actionId: number): ProjectAction {
  const a = getAction(projectId, actionId);
  if (!a) throw new ProjectsError(404, "action not found");
  return a;
}

export function getProjectDetail(id: number): ProjectDetail {
  const project = requireProject(id);
  return { ...project, actions: listActions(id), env: listProjectEnv(id) };
}

export function resolveAccountForProject(project: ProjectSummary): GitAccountRecord | null {
  if (project.accountId) return getAccountById(project.accountId);
  const provider = providerForUrl(project.remoteUrl);
  if (provider) return getAccountByProvider(provider);
  return null;
}

export type WorkerPatch = {
  managed?: boolean;
  clonedByBeacon?: boolean;
  image?: string | null;
  dockerfile?: string | null;
  buildContext?: string | null;
  buildCommand?: string | null;
  workDir?: string | null;
  cpuLimit?: number | null;
  memoryLimitMb?: number | null;
  replicas?: number;
  restartPolicy?: RestartPolicy;
  restartMaxRetries?: number | null;
  restartBackoffMs?: number;
  schedule?: string | null;
  autoscaleEnabled?: boolean;
  autoscaleMin?: number;
  autoscaleMax?: number;
  autoscaleCpuTarget?: number | null;
  autoscaleMemTarget?: number | null;
  autodeploy?: boolean;
  autodeployIntervalS?: number;
};

export function insertProject(input: {
  name: string;
  localPath: string | null;
  remoteUrl: string;
  branch: string;
  accountId: number | null;
  siteUrl?: string | null;
  runKind?: RunKind;
  port?: number | null;
  boot?: boolean;
  container?: string | null;
  composeFile?: string | null;
  unit?: string | null;
  publishFrom?: string | null;
  publishTo?: string | null;
  startCommand?: string | null;
  serviceKind?: ServiceKind;
  healthPath?: string | null;
  embedPreview?: boolean;
  embedUrl?: string | null;
  notes?: string | null;
} & WorkerPatch): ProjectSummary {
  if (input.localPath) {
    const existing = projectsDb()
      .prepare("SELECT id FROM projects WHERE local_path = ?")
      .get(input.localPath) as { id: number } | undefined;
    if (existing) {
      throw new ProjectsError(409, "a project already uses that folder");
    }
  }
  if (input.accountId !== null && !getAccountById(input.accountId)) {
    throw new ProjectsError(400, "git account not found");
  }
  const runKind = input.runKind ?? "none";
  const serviceKind = input.serviceKind ?? "website";
  const managed = input.managed ?? (serviceKind === "worker" && runKind !== "none");
  const embedPreview =
    input.embedPreview !== undefined ? input.embedPreview : serviceKind === "website";
  const replicas = input.replicas ?? 1;
  validateProjectShape({
    serviceKind,
    remoteUrl: input.remoteUrl,
    localPath: input.localPath,
    runKind,
    container: input.container ?? null,
    unit: input.unit ?? null,
    managed,
    image: input.image ?? null,
    dockerfile: input.dockerfile ?? null,
    startCommand: input.startCommand ?? null,
    replicas,
  });
  const info = projectsDb()
    .prepare(
      `INSERT INTO projects (
         name, local_path, remote_url, branch, account_id, created_at,
         site_url, run_kind, port, boot, container, compose_file, unit,
         publish_from, publish_to, start_command, service_kind, health_path,
         embed_preview, embed_url, notes,
         managed, cloned_by_beacon, image, dockerfile, build_context, build_command,
         work_dir, cpu_limit, memory_limit_mb, replicas, restart_policy,
         restart_max_retries, restart_backoff_ms, schedule, autoscale_enabled,
         autoscale_min, autoscale_max, autoscale_cpu_target, autoscale_mem_target,
         autodeploy, autodeploy_interval_s
       ) VALUES (${Array.from({ length: 42 }, () => "?").join(", ")})`
    )
    .run(
      input.name,
      input.localPath,
      input.remoteUrl,
      input.branch,
      input.accountId,
      Date.now(),
      input.siteUrl ?? null,
      runKind,
      input.port ?? null,
      input.boot ? 1 : 0,
      input.container ?? null,
      input.composeFile ?? null,
      input.unit ?? null,
      input.publishFrom ?? null,
      input.publishTo ?? null,
      input.startCommand ?? null,
      serviceKind,
      input.healthPath ?? null,
      embedPreview ? 1 : 0,
      input.embedUrl ?? null,
      input.notes ?? null,
      managed ? 1 : 0,
      input.clonedByBeacon ? 1 : 0,
      input.image ?? null,
      input.dockerfile ?? null,
      input.buildContext ?? null,
      input.buildCommand ?? null,
      input.workDir ?? null,
      input.cpuLimit ?? null,
      input.memoryLimitMb ?? null,
      replicas,
      input.restartPolicy ?? "always",
      input.restartMaxRetries ?? null,
      input.restartBackoffMs ?? 3000,
      input.schedule ?? null,
      input.autoscaleEnabled ? 1 : 0,
      input.autoscaleMin ?? 1,
      input.autoscaleMax ?? 1,
      input.autoscaleCpuTarget ?? null,
      input.autoscaleMemTarget ?? null,
      input.autodeploy ? 1 : 0,
      input.autodeployIntervalS ?? 300
    );
  const id = Number(info.lastInsertRowid);
  if (serviceKind === "worker" && runKind === "docker" && !input.container) {
    projectsDb()
      .prepare("UPDATE projects SET container = ? WHERE id = ?")
      .run(`beacon-w-${id}`, id);
  }
  if (serviceKind === "worker" && runKind === "systemd" && !input.unit) {
    projectsDb()
      .prepare("UPDATE projects SET unit = ? WHERE id = ?")
      .run(`beacon-w-${id}.service`, id);
  }
  const project = requireProject(id);
  seedDefaultAction(project);
  return requireProject(project.id);
}

export function updateProject(
  id: number,
  patch: {
    name?: string;
    remoteUrl?: string;
    branch?: string;
    accountId?: number | null;
    siteUrl?: string | null;
    runKind?: RunKind;
    port?: number | null;
    boot?: boolean;
    container?: string | null;
    composeFile?: string | null;
    unit?: string | null;
    publishFrom?: string | null;
    publishTo?: string | null;
    startCommand?: string | null;
    serviceKind?: ServiceKind;
    healthPath?: string | null;
    embedPreview?: boolean;
    embedUrl?: string | null;
    notes?: string | null;
  } & WorkerPatch
): ProjectSummary {
  const prev = requireProject(id);
  validateProjectShape({
    serviceKind: patch.serviceKind ?? prev.serviceKind,
    remoteUrl: patch.remoteUrl ?? prev.remoteUrl,
    localPath: prev.localPath || null,
    runKind: patch.runKind ?? prev.runKind,
    container: patch.container !== undefined ? patch.container : prev.container,
    unit: patch.unit !== undefined ? patch.unit : prev.unit,
    managed: patch.managed ?? prev.managed,
    image: patch.image !== undefined ? patch.image : prev.image,
    dockerfile: patch.dockerfile !== undefined ? patch.dockerfile : prev.dockerfile,
    startCommand: patch.startCommand !== undefined ? patch.startCommand : prev.startCommand,
    replicas: patch.replicas ?? prev.replicas,
  });
  const dbh = projectsDb();
  const set = (sql: string, value: string | number | bigint | null) =>
    dbh.prepare(sql).run(value, id);
  if (patch.name !== undefined) set("UPDATE projects SET name = ? WHERE id = ?", patch.name);
  if (patch.remoteUrl !== undefined) set("UPDATE projects SET remote_url = ? WHERE id = ?", patch.remoteUrl);
  if (patch.branch !== undefined) set("UPDATE projects SET branch = ? WHERE id = ?", patch.branch);
  if (patch.accountId !== undefined) {
    if (patch.accountId !== null && !getAccountById(patch.accountId)) {
      throw new ProjectsError(400, "git account not found");
    }
    set("UPDATE projects SET account_id = ? WHERE id = ?", patch.accountId);
  }
  if (patch.siteUrl !== undefined) set("UPDATE projects SET site_url = ? WHERE id = ?", patch.siteUrl);
  if (patch.runKind !== undefined) set("UPDATE projects SET run_kind = ? WHERE id = ?", patch.runKind);
  if (patch.port !== undefined) set("UPDATE projects SET port = ? WHERE id = ?", patch.port);
  if (patch.boot !== undefined) set("UPDATE projects SET boot = ? WHERE id = ?", patch.boot ? 1 : 0);
  if (patch.container !== undefined) set("UPDATE projects SET container = ? WHERE id = ?", patch.container);
  if (patch.composeFile !== undefined) {
    set("UPDATE projects SET compose_file = ? WHERE id = ?", patch.composeFile);
  }
  if (patch.unit !== undefined) set("UPDATE projects SET unit = ? WHERE id = ?", patch.unit);
  if (patch.publishFrom !== undefined) {
    set("UPDATE projects SET publish_from = ? WHERE id = ?", patch.publishFrom);
  }
  if (patch.publishTo !== undefined) set("UPDATE projects SET publish_to = ? WHERE id = ?", patch.publishTo);
  if (patch.startCommand !== undefined) {
    set("UPDATE projects SET start_command = ? WHERE id = ?", patch.startCommand);
  }
  if (patch.serviceKind !== undefined) {
    set("UPDATE projects SET service_kind = ? WHERE id = ?", patch.serviceKind);
  }
  if (patch.healthPath !== undefined) {
    set("UPDATE projects SET health_path = ? WHERE id = ?", patch.healthPath);
  }
  if (patch.embedPreview !== undefined) {
    set("UPDATE projects SET embed_preview = ? WHERE id = ?", patch.embedPreview ? 1 : 0);
  }
  if (patch.embedUrl !== undefined) set("UPDATE projects SET embed_url = ? WHERE id = ?", patch.embedUrl);
  if (patch.notes !== undefined) set("UPDATE projects SET notes = ? WHERE id = ?", patch.notes);
  if (patch.managed !== undefined) set("UPDATE projects SET managed = ? WHERE id = ?", patch.managed ? 1 : 0);
  if (patch.clonedByBeacon !== undefined) {
    set("UPDATE projects SET cloned_by_beacon = ? WHERE id = ?", patch.clonedByBeacon ? 1 : 0);
  }
  if (patch.image !== undefined) set("UPDATE projects SET image = ? WHERE id = ?", patch.image);
  if (patch.dockerfile !== undefined) set("UPDATE projects SET dockerfile = ? WHERE id = ?", patch.dockerfile);
  if (patch.buildContext !== undefined) {
    set("UPDATE projects SET build_context = ? WHERE id = ?", patch.buildContext);
  }
  if (patch.buildCommand !== undefined) {
    set("UPDATE projects SET build_command = ? WHERE id = ?", patch.buildCommand);
  }
  if (patch.workDir !== undefined) set("UPDATE projects SET work_dir = ? WHERE id = ?", patch.workDir);
  if (patch.cpuLimit !== undefined) set("UPDATE projects SET cpu_limit = ? WHERE id = ?", patch.cpuLimit);
  if (patch.memoryLimitMb !== undefined) {
    set("UPDATE projects SET memory_limit_mb = ? WHERE id = ?", patch.memoryLimitMb);
  }
  if (patch.replicas !== undefined) set("UPDATE projects SET replicas = ? WHERE id = ?", patch.replicas);
  if (patch.restartPolicy !== undefined) {
    set("UPDATE projects SET restart_policy = ? WHERE id = ?", patch.restartPolicy);
  }
  if (patch.restartMaxRetries !== undefined) {
    set("UPDATE projects SET restart_max_retries = ? WHERE id = ?", patch.restartMaxRetries);
  }
  if (patch.restartBackoffMs !== undefined) {
    set("UPDATE projects SET restart_backoff_ms = ? WHERE id = ?", patch.restartBackoffMs);
  }
  if (patch.schedule !== undefined) set("UPDATE projects SET schedule = ? WHERE id = ?", patch.schedule);
  if (patch.autoscaleEnabled !== undefined) {
    set("UPDATE projects SET autoscale_enabled = ? WHERE id = ?", patch.autoscaleEnabled ? 1 : 0);
  }
  if (patch.autoscaleMin !== undefined) {
    set("UPDATE projects SET autoscale_min = ? WHERE id = ?", patch.autoscaleMin);
  }
  if (patch.autoscaleMax !== undefined) {
    set("UPDATE projects SET autoscale_max = ? WHERE id = ?", patch.autoscaleMax);
  }
  if (patch.autoscaleCpuTarget !== undefined) {
    set("UPDATE projects SET autoscale_cpu_target = ? WHERE id = ?", patch.autoscaleCpuTarget);
  }
  if (patch.autoscaleMemTarget !== undefined) {
    set("UPDATE projects SET autoscale_mem_target = ? WHERE id = ?", patch.autoscaleMemTarget);
  }
  if (patch.autodeploy !== undefined) {
    set("UPDATE projects SET autodeploy = ? WHERE id = ?", patch.autodeploy ? 1 : 0);
  }
  if (patch.autodeployIntervalS !== undefined) {
    set("UPDATE projects SET autodeploy_interval_s = ? WHERE id = ?", patch.autodeployIntervalS);
  }
  const next = requireProject(id);
  if (prev.runKind === "none" && next.runKind !== "none" && listActions(id).length === 0) {
    seedDefaultAction(next);
  }
  return requireProject(id);
}

export function deleteProject(id: number): void {
  const info = projectsDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  if (info.changes === 0) throw new ProjectsError(404, "project not found");
}

export function workerScratchDir(projectId: number): string {
  return path.join(DATA_DIR, "workers", String(projectId));
}

export function listProjectEnv(projectId: number, opts?: { includeSecrets?: boolean }): ProjectEnvVar[] {
  requireProject(projectId);
  const rows = projectsDb()
    .prepare(
      `SELECT id, key, value, secret, sort_order FROM project_env
        WHERE project_id = ? ORDER BY sort_order, id`
    )
    .all(projectId) as Array<{
    id: number;
    key: string;
    value: string;
    secret: number;
    sort_order: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    value: r.secret && !opts?.includeSecrets ? null : r.value,
    secret: !!r.secret,
    sortOrder: r.sort_order,
  }));
}

export function envMapForRuntime(projectId: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of listProjectEnv(projectId, { includeSecrets: true })) {
    out[row.key] = row.value ?? "";
  }
  return out;
}

export function writeWorkerEnvFile(projectId: number): string {
  const dir = workerScratchDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "env");
  const lines = listProjectEnv(projectId, { includeSecrets: true }).map((e) => {
    const v = (e.value ?? "").replace(/\r?\n/g, " ");
    return `${e.key}=${v}`;
  });
  fs.writeFileSync(dest, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  return dest;
}

export function replaceProjectEnv(projectId: number, items: EnvVarInput[]): ProjectEnvVar[] {
  requireProject(projectId);
  if (items.length > 200) throw new ProjectsError(400, "too many environment variables");
  const existing = projectsDb()
    .prepare("SELECT id, key, value, secret FROM project_env WHERE project_id = ?")
    .all(projectId) as Array<{ id: number; key: string; value: string; secret: number }>;
  const byId = new Map(existing.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const rows: Array<{ key: string; value: string; secret: number }> = [];
  for (const raw of items) {
    const key = sanitizeEnvKey(raw.key);
    if (seen.has(key)) throw new ProjectsError(400, `duplicate env key: ${key}`);
    seen.add(key);
    const secret = !!raw.secret;
    let value = raw.value !== undefined && raw.value !== null ? sanitizeEnvValue(raw.value) : "";
    if (secret && !value && raw.id && byId.has(raw.id)) {
      value = byId.get(raw.id)!.value;
    }
    rows.push({ key, value, secret: secret ? 1 : 0 });
  }
  projectsDb().prepare("DELETE FROM project_env WHERE project_id = ?").run(projectId);
  const insert = projectsDb().prepare(
    `INSERT INTO project_env (project_id, key, value, secret, sort_order) VALUES (?, ?, ?, ?, ?)`
  );
  rows.forEach((r, i) => insert.run(projectId, r.key, r.value, r.secret, i));
  return listProjectEnv(projectId);
}

export function validateSteps(steps: StepInput[]): StepInput[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new ProjectsError(400, "add at least one step");
  }
  if (steps.length > 30) throw new ProjectsError(400, "too many steps");
  return steps.map((raw, i) => {
    if (!isStepType(raw?.type)) {
      throw new ProjectsError(400, `step ${i + 1}: unknown type`);
    }
    if (raw.type === "command") {
      const command = typeof raw.command === "string" ? raw.command.trim() : "";
      if (!command) throw new ProjectsError(400, `step ${i + 1}: command is required`);
      if (command.length > 4000) {
        throw new ProjectsError(400, `step ${i + 1}: command is too long`);
      }
      return { type: "command", command };
    }
    if (raw.type === "docker_restart" || raw.type === "docker_ensure") {
      const container = typeof raw.container === "string" ? raw.container.trim() : "";
      if (!container) {
        throw new ProjectsError(400, `step ${i + 1}: container is required`);
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/.test(container)) {
        throw new ProjectsError(400, `step ${i + 1}: invalid container name`);
      }
      return { type: raw.type, container };
    }
    if (raw.type === "compose_up") {
      const source = sanitizeRelPath(raw.source ?? "compose.yaml", `step ${i + 1} compose file`);
      return { type: "compose_up", source: source || "compose.yaml" };
    }
    if (
      raw.type === "systemd_restart" ||
      raw.type === "systemd_enable" ||
      raw.type === "systemd_apply"
    ) {
      if (process.platform !== "linux") {
        throw new ProjectsError(400, "systemd steps are only available on Linux");
      }
      const unit = typeof raw.unit === "string" ? raw.unit.trim() : "";
      if (!unit || !/^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,255}$/.test(unit)) {
        throw new ProjectsError(400, `step ${i + 1}: invalid systemd unit`);
      }
      if (raw.type === "systemd_apply") {
        const command = typeof raw.command === "string" ? raw.command.trim() : "";
        if (!command) {
          throw new ProjectsError(400, `step ${i + 1}: start command is required`);
        }
        return { type: "systemd_apply", unit, command };
      }
      return { type: raw.type, unit };
    }
    if (raw.type === "publish") {
      const source = sanitizeRelPath(raw.source, `step ${i + 1} publish from`);
      if (!source) throw new ProjectsError(400, `step ${i + 1}: publish from is required`);
      if (typeof raw.dest !== "string" || !raw.dest.trim()) {
        throw new ProjectsError(400, `step ${i + 1}: publish destination is required`);
      }
      const dest = sanitizeLocalPath(raw.dest);
      return { type: "publish", source, dest };
    }
    if (raw.type === "worker_apply") {
      return { type: "worker_apply" };
    }
    return { type: "git_pull" };
  });
}

function defaultActionSteps(project: ProjectSummary): StepInput[] | null {
  const pull: StepInput[] = projectHasGit(project) ? [{ type: "git_pull" }] : [];
  if (project.serviceKind === "worker" && (project.managed || project.runKind === "process")) {
    return [...pull, { type: "worker_apply" }];
  }
  switch (project.runKind) {
    case "docker":
      if (!project.container) return pull.length ? pull : null;
      return [...pull, { type: "docker_ensure", container: project.container }];
    case "compose":
      return [
        ...pull,
        { type: "compose_up", source: project.composeFile || "compose.yaml" },
      ];
    case "systemd":
      if (!project.unit) return pull.length ? pull : null;
      if (project.startCommand) {
        return [
          ...pull,
          { type: "systemd_apply", unit: project.unit, command: project.startCommand },
        ];
      }
      return [...pull, { type: "systemd_enable", unit: project.unit }];
    case "static":
      if (!project.publishFrom || !project.publishTo) return pull.length ? pull : null;
      return [
        ...pull,
        { type: "publish", source: project.publishFrom, dest: project.publishTo },
      ];
    case "process":
      return [...pull, { type: "worker_apply" }];
    default:
      return pull.length ? pull : null;
  }
}

function seedDefaultAction(project: ProjectSummary): void {
  const steps = defaultActionSteps(project);
  if (!steps) return;
  createAction(project.id, projectHasGit(project) ? "Pull" : "Start", steps);
}

function replaceSteps(actionId: number, steps: StepInput[]): void {
  projectsDb().prepare("DELETE FROM action_steps WHERE action_id = ?").run(actionId);
  const insert = projectsDb().prepare(
    `INSERT INTO action_steps (action_id, sort_order, type, command, container, unit, source, dest)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  steps.forEach((s, i) => {
    insert.run(
      actionId,
      i,
      s.type,
      s.command ?? null,
      s.container ?? null,
      s.unit ?? null,
      s.source ?? null,
      s.dest ?? null
    );
  });
}

export function createAction(
  projectId: number,
  name: string,
  steps: StepInput[]
): ProjectAction {
  requireProject(projectId);
  const validated = validateSteps(steps);
  const max = projectsDb()
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM actions WHERE project_id = ?")
    .get(projectId) as { m: number };
  const info = projectsDb()
    .prepare(
      "INSERT INTO actions (project_id, name, sort_order, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(projectId, name, max.m + 1, Date.now());
  const id = Number(info.lastInsertRowid);
  replaceSteps(id, validated);
  return requireAction(projectId, id);
}

export function updateAction(
  projectId: number,
  actionId: number,
  patch: { name?: string; steps?: StepInput[] }
): ProjectAction {
  requireAction(projectId, actionId);
  if (patch.name !== undefined) {
    projectsDb()
      .prepare("UPDATE actions SET name = ? WHERE id = ?")
      .run(patch.name, actionId);
  }
  if (patch.steps !== undefined) {
    replaceSteps(actionId, validateSteps(patch.steps));
  }
  return requireAction(projectId, actionId);
}

export function deleteAction(projectId: number, actionId: number): void {
  requireAction(projectId, actionId);
  projectsDb().prepare("DELETE FROM actions WHERE id = ?").run(actionId);
}

export function insertRun(input: {
  projectId: number;
  actionId: number | null;
  actionName: string;
}): ActionRun {
  const info = projectsDb()
    .prepare(
      `INSERT INTO action_runs
         (project_id, action_id, action_name, status, log, error, started_at, finished_at)
       VALUES (?, ?, ?, 'running', '', NULL, ?, NULL)`
    )
    .run(input.projectId, input.actionId, input.actionName, Date.now());
  const row = projectsDb()
    .prepare(
      `SELECT id, project_id, action_id, action_name, status, log, error, started_at, finished_at
         FROM action_runs WHERE id = ?`
    )
    .get(Number(info.lastInsertRowid)) as {
    id: number;
    project_id: number;
    action_id: number | null;
    action_name: string;
    status: string;
    log: string;
    error: string | null;
    started_at: number;
    finished_at: number | null;
  };
  return mapRun(row);
}

export function finishRun(
  id: number,
  status: "ok" | "error",
  log: string,
  error: string | null
): void {
  projectsDb()
    .prepare(
      `UPDATE action_runs
          SET status = ?, log = ?, error = ?, finished_at = ?
        WHERE id = ?`
    )
    .run(status, log, error, Date.now(), id);
}

export function listRuns(projectId: number, limit = 20): ActionRun[] {
  const n = Math.max(1, Math.min(100, Math.round(limit)));
  const rows = projectsDb()
    .prepare(
      `SELECT id, project_id, action_id, action_name, status, log, error, started_at, finished_at
         FROM action_runs
        WHERE project_id = ?
        ORDER BY started_at DESC, id DESC
        LIMIT ?`
    )
    .all(projectId, n) as Array<{
    id: number;
    project_id: number;
    action_id: number | null;
    action_name: string;
    status: string;
    log: string;
    error: string | null;
    started_at: number;
    finished_at: number | null;
  }>;
  return rows.map(mapRun);
}

export function parseId(raw: string | string[] | undefined): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(s);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ProjectsError(400, "invalid id");
  }
  return id;
}
