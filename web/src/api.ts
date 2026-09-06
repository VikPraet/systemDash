import type {
  AuditEntry,
  AuthStatus,
  DirListing,
  DockerContainerList,
  DockerStatus,
  FsEntry,
  FsRoot,
  HistorySeries,
  HistoryStats,
  ProcessList,
  Role,
  SessionInfo,
  Settings,
  SystemSnapshot,
  UpdatesRunResult,
  UpdatesStatus,
  UpdateJob,
  UpdatePhase,
  UpdatesPhaseResult,
  AppUpdateStatus,
  AppUpdateJob,
  User,
  PowerCapabilities,
  PowerAction,
  PowerRunResult,
  ActionJob,
  GitAccountPublic,
  GitAccountDetails,
  GitCheckResult,
  GitProvider,
  GitRepoInfo,
  AddIngressResult,
  ProjectAction,
  ProjectDetail,
  ProjectsOverview,
  RunKind,
  StepInput,
} from "./types";

// When a gated /api call comes back 401 with "authentication required", the
// session has expired/been revoked. Git/GitHub token failures used to reuse 401
// and must not dump the user at sign-in.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

// Centralise the 401 handling by wrapping window.fetch once. Cookies are sent
// automatically for same-origin requests (the SPA is served from the API host,
// and the dev server proxies /api), so we only need to watch responses.
const rawFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await rawFetch(input, init);
  const url = typeof input === "string" ? input : input.toString();
  if (
    res.status === 401 &&
    url.includes("/api/") &&
    !url.includes("/api/auth/")
  ) {
    const body = (await res.clone().json().catch(() => ({}))) as {
      error?: string;
    };
    if (!body.error || body.error === "authentication required") {
      onUnauthorized?.();
    }
  }
  return res;
};

export async function fetchAuthStatus(signal?: AbortSignal): Promise<AuthStatus> {
  const res = await fetch("/api/auth/status", { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as AuthStatus;
}

export async function setupAdmin(
  username: string,
  password: string,
  recovery: { question: string; answer: string }
): Promise<User> {
  const { user } = await postJson<{ user: User }>("/api/auth/setup", {
    username,
    password,
    recoveryQuestion: recovery.question,
    recoveryAnswer: recovery.answer,
  });
  return user;
}

export async function recoverUsernameApi(
  question: string,
  answer: string
): Promise<string> {
  const { username } = await postJson<{ username: string }>(
    "/api/auth/recover/username",
    { question, answer }
  );
  return username;
}

export async function recoverPasswordApi(
  username: string,
  answer: string,
  password: string
): Promise<void> {
  await postJson("/api/auth/recover/password", { username, answer, password });
}

export async function saveRecoveryApi(
  question: string,
  answer: string
): Promise<User> {
  const res = await fetch("/api/auth/recovery", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answer }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { user: User }).user;
}

export async function login(username: string, password: string): Promise<User> {
  const { user } = await postJson<{ user: User }>("/api/auth/login", {
    username,
    password,
  });
  return user;
}

export async function logout(): Promise<void> {
  await postJson("/api/auth/logout", {});
}

export async function fetchUsers(signal?: AbortSignal): Promise<User[]> {
  const res = await fetch("/api/users", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { users: User[] }).users;
}

export async function createUserApi(
  username: string,
  password: string,
  role: Role
): Promise<User> {
  const { user } = await postJson<{ user: User }>("/api/users", {
    username,
    password,
    role,
  });
  return user;
}

export async function updateUserApi(
  id: number,
  patch: { role?: Role; active?: boolean; password?: string }
): Promise<User> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { user: User }).user;
}

export async function deleteUserApi(id: number): Promise<void> {
  const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
}

export async function fetchSessions(signal?: AbortSignal): Promise<SessionInfo[]> {
  const res = await fetch("/api/sessions", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { sessions: SessionInfo[] }).sessions;
}

export async function revokeSession(id: string): Promise<void> {
  await postJson("/api/sessions/revoke", { id });
}

export async function fetchAudit(
  limit = 200,
  signal?: AbortSignal
): Promise<AuditEntry[]> {
  const res = await fetch(`/api/audit?limit=${limit}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { entries: AuditEntry[] }).entries;
}

export const DEFAULT_SETTINGS: Settings = {
  files: {
    showHiddenFiles: false,
    showFileExtensions: true,
    showFolderSizes: true,
    confirmDelete: true,
  },
  history: {
    enabled: true,
    intervalSeconds: 5,
    retentionDays: 30,
    maxSizeMb: 500,
  },
  terminal: {
    osUser: "",
  },
};

export async function fetchSettings(signal?: AbortSignal): Promise<Settings> {
  const res = await fetch("/api/settings", { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as Settings;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as Settings;
}

export async function fetchSnapshot(signal?: AbortSignal): Promise<SystemSnapshot> {
  const res = await fetch("/api/system", { signal });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as SystemSnapshot;
}

export async function fetchHistory(
  from: number,
  to: number,
  points: number,
  signal?: AbortSignal
): Promise<HistorySeries> {
  const params = new URLSearchParams({
    from: String(Math.round(from)),
    to: String(Math.round(to)),
    points: String(Math.round(points)),
  });
  const res = await fetch(`/api/history?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as HistorySeries;
}

export async function fetchHistoryStats(
  signal?: AbortSignal
): Promise<HistoryStats> {
  const res = await fetch("/api/history/stats", { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as HistoryStats;
}

export async function clearHistory(): Promise<{ ok: true }> {
  return postJson("/api/history/clear", {});
}

export async function fetchProcesses(signal?: AbortSignal): Promise<ProcessList> {
  const res = await fetch("/api/processes", { signal });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as ProcessList;
}

export async function fetchDockerStatus(signal?: AbortSignal): Promise<DockerStatus> {
  const res = await fetch("/api/docker/status", { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as DockerStatus;
}

export async function fetchDockerContainers(
  signal?: AbortSignal
): Promise<DockerContainerList> {
  const res = await fetch("/api/docker/containers", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as DockerContainerList;
}

export async function fetchDockerLogs(
  id: string,
  tail = 300,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(
    `/api/docker/containers/${encodeURIComponent(id)}/logs?tail=${tail}`,
    { signal }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { logs: string }).logs;
}

export function dockerContainerAction(
  id: string,
  action: "start" | "stop" | "restart"
): Promise<{ ok: true }> {
  return postJson(`/api/docker/containers/${encodeURIComponent(id)}/${action}`, {});
}

export function removeDockerContainer(
  id: string,
  force = false
): Promise<{ ok: true }> {
  return postJson(`/api/docker/containers/${encodeURIComponent(id)}/remove`, { force });
}

export async function fetchUpdatesStatus(
  opts?: { refresh?: boolean; descriptions?: boolean; signal?: AbortSignal }
): Promise<UpdatesStatus> {
  const params = new URLSearchParams();
  if (opts?.refresh) params.set("refresh", "1");
  if (opts?.descriptions) params.set("descriptions", "1");
  const qs = params.toString();
  const res = await fetch(`/api/updates/status${qs ? `?${qs}` : ""}`, { signal: opts?.signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as UpdatesStatus;
}

export async function fetchUpdatesJob(signal?: AbortSignal): Promise<UpdateJob> {
  const res = await fetch("/api/updates/job", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as UpdateJob;
}

export async function startSystemUpdates(opts: {
  scope: "packages" | "all";
  packages?: string[];
}): Promise<{ ok: true }> {
  return postJson("/api/updates/start", opts);
}

export async function fetchAppUpdateStatus(
  opts?: { refresh?: boolean; signal?: AbortSignal }
): Promise<AppUpdateStatus> {
  const qs = opts?.refresh ? "?refresh=1" : "";
  const res = await fetch(`/api/app-update/status${qs}`, { signal: opts?.signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as AppUpdateStatus;
}

export async function fetchAppUpdateJob(signal?: AbortSignal): Promise<AppUpdateJob> {
  const res = await fetch("/api/app-update/job", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as AppUpdateJob;
}

export async function startAppUpdate(version?: string): Promise<{ ok: true }> {
  return postJson("/api/app-update/start", version ? { version } : {});
}

export async function fetchPowerCapabilities(
  signal?: AbortSignal
): Promise<PowerCapabilities> {
  const res = await fetch("/api/power/capabilities", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as PowerCapabilities;
}

export async function runPowerAction(opts: {
  action: PowerAction;
  confirm: string;
  delaySeconds?: number;
}): Promise<PowerRunResult> {
  const res = await fetch("/api/power/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<PowerRunResult>;
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body as PowerRunResult;
}

export async function runSystemUpdates(
  scope: "packages" | "all"
): Promise<UpdatesRunResult> {
  return postJson<UpdatesRunResult>("/api/updates/run", { scope });
}

export async function runSystemUpdatesPhase(
  phase: UpdatePhase,
  scope?: "packages" | "all"
): Promise<UpdatesPhaseResult> {
  return postJson<UpdatesPhaseResult>("/api/updates/run", { phase, scope });
}

/** Terminates a process: `end` is graceful, `kill` forces it. */
export function killProcess(
  pid: number,
  mode: "end" | "kill",
  name?: string
): Promise<{ ok: true }> {
  return postJson("/api/processes/kill", { pid, mode, name });
}

export async function fetchRoots(signal?: AbortSignal): Promise<FsRoot[]> {
  const res = await fetch("/api/fs/roots", { signal });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return ((await res.json()) as { roots: FsRoot[] }).roots;
}

export async function fetchListing(
  path: string,
  signal?: AbortSignal
): Promise<DirListing> {
  const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`, {
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as DirListing;
}

export async function fetchDirSize(
  path: string,
  signal?: AbortSignal
): Promise<{ bytes: number; partial: boolean }> {
  const res = await fetch(`/api/fs/dirsize?path=${encodeURIComponent(path)}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as { bytes: number; partial: boolean };
}

export function downloadUrl(path: string): string {
  return `/api/fs/download?path=${encodeURIComponent(path)}`;
}

export async function readTextFile(
  path: string,
  signal?: AbortSignal
): Promise<{ path: string; content: string }> {
  const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`, {
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as { path: string; content: string };
}

export function writeTextFile(
  path: string,
  content: string
): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/write", { path, content });
}

/** POSTs JSON to an /api endpoint and surfaces the server's error message. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  return sendJson<T>(url, "POST", body);
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  return sendJson<T>(url, "PATCH", body);
}

async function sendJson<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function deleteJson(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
}

export async function fetchProjectsOverview(
  signal?: AbortSignal
): Promise<ProjectsOverview> {
  const res = await fetch("/api/projects", { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as ProjectsOverview;
}

export async function fetchProject(id: number): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { project: ProjectDetail }).project;
}

export function createProjectApi(input: {
  name: string;
  localPath: string;
  remoteUrl: string;
  branch: string;
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
}): Promise<{ project: ProjectDetail }> {
  return postJson("/api/projects", input);
}

export function updateProjectApi(
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
): Promise<{ project: ProjectDetail }> {
  return patchJson(`/api/projects/${id}`, patch);
}

export function addCloudflaredIngressApi(input: {
  hostname: string;
  port: number;
}): Promise<AddIngressResult> {
  return postJson("/api/projects/ingress", input);
}

export function deleteProjectApi(id: number): Promise<void> {
  return deleteJson(`/api/projects/${id}`);
}

export function connectGitAccountApi(input: {
  provider: GitProvider;
  token: string;
  host?: string;
}): Promise<{ account: GitAccountPublic }> {
  return postJson("/api/projects/accounts", input);
}

export function disconnectGitAccountApi(id: number): Promise<void> {
  return deleteJson(`/api/projects/accounts/${id}`);
}

export async function fetchGitAccountDetails(
  id: number,
  opts?: { refresh?: boolean }
): Promise<GitAccountDetails> {
  const q = opts?.refresh ? "?refresh=1" : "";
  const res = await fetch(`/api/projects/accounts/${id}${q}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as GitAccountDetails;
}

export async function fetchGitRepos(
  provider: GitProvider,
  opts?: { refresh?: boolean }
): Promise<GitRepoInfo[]> {
  const q = new URLSearchParams({ provider });
  if (opts?.refresh) q.set("refresh", "1");
  const res = await fetch(`/api/projects/repos?${q}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return ((await res.json()) as { repos: GitRepoInfo[] }).repos;
}

export async function fetchGitBranches(
  url: string,
  signal?: AbortSignal
): Promise<{ branches: string[]; defaultBranch: string | null }> {
  const res = await fetch(
    `/api/projects/branches?url=${encodeURIComponent(url)}`,
    { signal }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as { branches: string[]; defaultBranch: string | null };
}

export function checkProjectRemoteApi(id: number): Promise<GitCheckResult> {
  return postJson(`/api/projects/${id}/check`, {});
}

export async function fetchProjectJob(id: number): Promise<ActionJob> {
  const res = await fetch(`/api/projects/${id}/job`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as ActionJob;
}

export function createProjectActionApi(
  projectId: number,
  name: string,
  steps: StepInput[]
): Promise<{ action: ProjectAction }> {
  return postJson(`/api/projects/${projectId}/actions`, { name, steps });
}

export function updateProjectActionApi(
  projectId: number,
  actionId: number,
  patch: { name?: string; steps?: StepInput[] }
): Promise<{ action: ProjectAction }> {
  return patchJson(`/api/projects/${projectId}/actions/${actionId}`, patch);
}

export function deleteProjectActionApi(
  projectId: number,
  actionId: number
): Promise<void> {
  return deleteJson(`/api/projects/${projectId}/actions/${actionId}`);
}

export function runProjectActionApi(
  projectId: number,
  actionId: number
): Promise<ActionJob> {
  return postJson(`/api/projects/${projectId}/actions/${actionId}/run`, {});
}

export function createFolder(path: string, name: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/folder", { path, name });
}

export function createFile(path: string, name: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/file", { path, name });
}

export function renameEntry(path: string, newName: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/rename", { path, newName });
}

export function moveEntry(path: string, dest: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/move", { path, dest });
}

export function copyEntry(path: string, dest: string): Promise<{ entry: FsEntry }> {
  return postJson("/api/fs/copy", { path, dest });
}

export function deleteEntry(path: string): Promise<{ ok: true }> {
  return postJson("/api/fs/delete", { path });
}

/** Streams a single File to the given directory; reports progress 0..1. */
export function uploadFile(
  dir: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const url = `/api/fs/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(
    file.name
  )}`;
  // XHR (not fetch) so we get upload progress events.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `Upload failed: ${xhr.status}`;
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch {
          // non-JSON error body; keep the generic message
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}

export function formatDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(fromMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - fromMs);
  const s = Math.floor(diff / 1000);
  if (s < 1) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUptime(seconds: number): string {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}
