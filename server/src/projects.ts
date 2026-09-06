import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_DIR =
  process.env.SYSTEMDASH_DATA_DIR ?? path.join(os.homedir(), ".systemdash");
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
  | "publish";
export type RunKind = "none" | "docker" | "compose" | "systemd" | "static";
export type RunStatus = "running" | "ok" | "error";

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
  port: number | null;
  boot: boolean;
  container: string | null;
  composeFile: string | null;
  unit: string | null;
  publishFrom: string | null;
  publishTo: string | null;
  startCommand: string | null;
  lastRun: ActionRun | null;
}

export interface ProjectDetail extends ProjectSummary {
  actions: ProjectAction[];
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
]);
const RUN_KINDS = new Set<RunKind>(["none", "docker", "compose", "systemd", "static"]);

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
    CREATE TABLE IF NOT EXISTS projects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      local_path TEXT NOT NULL UNIQUE,
      remote_url TEXT NOT NULL,
      branch     TEXT NOT NULL,
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
  ]) {
    try {
      fresh.exec(`ALTER TABLE projects ADD COLUMN ${col};`);
    } catch {
      // already present
    }
  }
  for (const col of ["source TEXT", "dest TEXT"]) {
    try {
      fresh.exec(`ALTER TABLE action_steps ADD COLUMN ${col};`);
    } catch {
      // already present
    }
  }
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

export function isGitProvider(v: unknown): v is GitProvider {
  return v === "github" || v === "gitlab";
}

export function isRunKind(v: unknown): v is RunKind {
  return typeof v === "string" && RUN_KINDS.has(v as RunKind);
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
    throw new ProjectsError(400, "run kind must be none, docker, compose, systemd, or static");
  }
  if (raw === "systemd" && process.platform !== "linux") {
    throw new ProjectsError(400, "systemd is only available on Linux");
  }
  return raw;
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

export function sanitizeRemoteUrl(raw: unknown): string {
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
  local_path: string;
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
};

const PROJECT_COLS = `id, name, local_path, remote_url, branch, account_id, created_at,
         site_url, run_kind, port, boot, container, compose_file, unit,
         publish_from, publish_to, start_command`;

function mapProject(row: ProjectRow): ProjectSummary {
  const kind = isRunKind(row.run_kind) ? row.run_kind : "none";
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path,
    remoteUrl: row.remote_url,
    branch: row.branch,
    accountId: row.account_id,
    createdAt: row.created_at,
    siteUrl: row.site_url || null,
    runKind: kind,
    port: typeof row.port === "number" && row.port > 0 ? row.port : null,
    boot: !!row.boot,
    container: row.container,
    composeFile: row.compose_file,
    unit: row.unit,
    publishFrom: row.publish_from,
    publishTo: row.publish_to,
    startCommand: row.start_command,
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
  return { ...project, actions: listActions(id) };
}

export function resolveAccountForProject(project: ProjectSummary): GitAccountRecord | null {
  if (project.accountId) return getAccountById(project.accountId);
  const provider = providerForUrl(project.remoteUrl);
  if (provider) return getAccountByProvider(provider);
  return null;
}

export function insertProject(input: {
  name: string;
  localPath: string;
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
}): ProjectSummary {
  const existing = projectsDb()
    .prepare("SELECT id FROM projects WHERE local_path = ?")
    .get(input.localPath) as { id: number } | undefined;
  if (existing) {
    throw new ProjectsError(409, "a project already uses that folder");
  }
  if (input.accountId !== null && !getAccountById(input.accountId)) {
    throw new ProjectsError(400, "git account not found");
  }
  const runKind = input.runKind ?? "none";
  const info = projectsDb()
    .prepare(
      `INSERT INTO projects (
         name, local_path, remote_url, branch, account_id, created_at,
         site_url, run_kind, port, boot, container, compose_file, unit,
         publish_from, publish_to, start_command
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.startCommand ?? null
    );
  const project = requireProject(Number(info.lastInsertRowid));
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
  }
): ProjectSummary {
  const prev = requireProject(id);
  if (patch.name !== undefined) {
    projectsDb().prepare("UPDATE projects SET name = ? WHERE id = ?").run(patch.name, id);
  }
  if (patch.remoteUrl !== undefined) {
    projectsDb()
      .prepare("UPDATE projects SET remote_url = ? WHERE id = ?")
      .run(patch.remoteUrl, id);
  }
  if (patch.branch !== undefined) {
    projectsDb()
      .prepare("UPDATE projects SET branch = ? WHERE id = ?")
      .run(patch.branch, id);
  }
  if (patch.accountId !== undefined) {
    if (patch.accountId !== null && !getAccountById(patch.accountId)) {
      throw new ProjectsError(400, "git account not found");
    }
    projectsDb()
      .prepare("UPDATE projects SET account_id = ? WHERE id = ?")
      .run(patch.accountId, id);
  }
  if (patch.siteUrl !== undefined) {
    projectsDb().prepare("UPDATE projects SET site_url = ? WHERE id = ?").run(patch.siteUrl, id);
  }
  if (patch.runKind !== undefined) {
    projectsDb().prepare("UPDATE projects SET run_kind = ? WHERE id = ?").run(patch.runKind, id);
  }
  if (patch.port !== undefined) {
    projectsDb().prepare("UPDATE projects SET port = ? WHERE id = ?").run(patch.port, id);
  }
  if (patch.boot !== undefined) {
    projectsDb().prepare("UPDATE projects SET boot = ? WHERE id = ?").run(patch.boot ? 1 : 0, id);
  }
  if (patch.container !== undefined) {
    projectsDb()
      .prepare("UPDATE projects SET container = ? WHERE id = ?")
      .run(patch.container, id);
  }
  if (patch.composeFile !== undefined) {
    projectsDb()
      .prepare("UPDATE projects SET compose_file = ? WHERE id = ?")
      .run(patch.composeFile, id);
  }
  if (patch.unit !== undefined) {
    projectsDb().prepare("UPDATE projects SET unit = ? WHERE id = ?").run(patch.unit, id);
  }
  if (patch.publishFrom !== undefined) {
    projectsDb()
      .prepare("UPDATE projects SET publish_from = ? WHERE id = ?")
      .run(patch.publishFrom, id);
  }
  if (patch.publishTo !== undefined) {
    projectsDb()
      .prepare("UPDATE projects SET publish_to = ? WHERE id = ?")
      .run(patch.publishTo, id);
  }
  if (patch.startCommand !== undefined) {
    projectsDb()
      .prepare("UPDATE projects SET start_command = ? WHERE id = ?")
      .run(patch.startCommand, id);
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
    return { type: "git_pull" };
  });
}

function defaultActionSteps(project: ProjectSummary): StepInput[] | null {
  switch (project.runKind) {
    case "docker":
      if (!project.container) return [{ type: "git_pull" }];
      return [{ type: "git_pull" }, { type: "docker_ensure", container: project.container }];
    case "compose":
      return [
        { type: "git_pull" },
        { type: "compose_up", source: project.composeFile || "compose.yaml" },
      ];
    case "systemd":
      if (!project.unit) return [{ type: "git_pull" }];
      if (project.startCommand) {
        return [
          { type: "git_pull" },
          { type: "systemd_apply", unit: project.unit, command: project.startCommand },
        ];
      }
      return [{ type: "git_pull" }, { type: "systemd_enable", unit: project.unit }];
    case "static":
      if (!project.publishFrom || !project.publishTo) return [{ type: "git_pull" }];
      return [
        { type: "git_pull" },
        { type: "publish", source: project.publishFrom, dest: project.publishTo },
      ];
    default:
      return null;
  }
}

function seedDefaultAction(project: ProjectSummary): void {
  const steps = defaultActionSteps(project);
  if (!steps) return;
  createAction(project.id, "Pull", steps);
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
