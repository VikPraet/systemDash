import { execFile, spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import {
  ProjectsError,
  getAccountById,
  getAccountByProvider,
  normalizeRemoteUrl,
  providerForUrl,
  remotesMatch,
  type GitAccountRecord,
  type GitProvider,
} from "./projects.js";
import { APP_USER_AGENT } from "./brand.js";

export interface GitRepoInfo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  private: boolean;
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

const GIT_TIMEOUT_MS = 5 * 60_000;
const OUTPUT_TAIL = 16_000;

function commandExists(bin: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const ext = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const dir of pathEnv.split(sep).filter(Boolean)) {
    for (const e of ext) {
      if (fs.existsSync(path.join(dir, `${bin}${e}`))) return true;
    }
  }
  return false;
}

function gitFallbacks(): string[] {
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LocalAppData || "";
    return [
      path.join(pf, "Git", "cmd", "git.exe"),
      path.join(pf86, "Git", "cmd", "git.exe"),
      local ? path.join(local, "Programs", "Git", "cmd", "git.exe") : "",
    ].filter(Boolean);
  }
  return ["/usr/bin/git", "/usr/local/bin/git"];
}

let gitBinCache: string | null | undefined;

function resolveGitBin(): string | null {
  if (gitBinCache !== undefined) return gitBinCache;
  if (commandExists("git")) {
    gitBinCache = "git";
    return gitBinCache;
  }
  for (const candidate of gitFallbacks()) {
    if (fs.existsSync(candidate)) {
      gitBinCache = candidate;
      return gitBinCache;
    }
  }
  gitBinCache = null;
  return null;
}

export function gitAvailable(): boolean {
  return resolveGitBin() !== null;
}

function assertGit(): void {
  if (!gitAvailable()) {
    throw new ProjectsError(
      503,
      "git is not installed or not on PATH — install Git on this host to clone and pull"
    );
  }
}

type GitAuth = {
  token?: string | null;
  provider?: GitProvider | null;
  host?: string | null;
};

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_ASKPASS;
  delete env.SSH_ASKPASS;
  for (const key of Object.keys(env)) {
    if (/^GIT_CONFIG_(COUNT|KEY_|VALUE_)/.test(key)) delete env[key];
  }
  // Fail instead of prompting: Windows GCM, Linux libsecret/ssh-askpass, etc.
  env.GIT_TERMINAL_PROMPT = "0";
  env.GCM_INTERACTIVE = "never";
  env.FORCE_COLOR = env.FORCE_COLOR || "1";
  env.CLICOLOR_FORCE = "1";
  env.TERM = env.TERM && env.TERM !== "dumb" ? env.TERM : "xterm-256color";
  return env;
}

/**
 * Same argv on Windows and Linux. Empty helper disables GCM/libsecret/store.
 * extraHeader Basic is what GitHub Actions uses for PATs on both runners.
 */
function gitArgv(auth: GitAuth, args: string[]): string[] {
  const prefix = [
    "-c",
    "credential.helper=",
    "-c",
    "core.askPass=",
    // Repos on this host are often owned by a login user while the service
    // runs as another — Git 2.35+ then refuses them as "dubious ownership".
    "-c",
    "safe.directory=*",
    "-c",
    "color.ui=always",
  ];
  if (auth.token && auth.provider) {
    const user = auth.provider === "gitlab" ? "oauth2" : "x-access-token";
    const basic = Buffer.from(`${user}:${auth.token}`, "utf8").toString("base64");
    const host = (auth.host ?? (auth.provider === "gitlab" ? "gitlab.com" : "github.com"))
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    prefix.push(
      "-c",
      `http.https://${host}/.extraheader=AUTHORIZATION: basic ${basic}`
    );
  }
  return [...prefix, ...args];
}

function redactGitOutput(text: string): string {
  return text
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_***")
    .replace(/gh[pousr]_[A-Za-z0-9]+/g, "gh*_***")
    .replace(/glpat-[A-Za-z0-9_-]+/g, "glpat-***")
    .replace(/AUTHORIZATION:\s*basic\s+\S+/gi, "AUTHORIZATION: basic ***")
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}

function authFailedError(detail: string): ProjectsError {
  const hint = redactGitOutput(detail)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join(" — ");
  return new ProjectsError(
    400,
    hint
      ? `git authentication failed — ${hint}`
      : "git authentication failed — reconnect the token (fine-grained GitHub tokens need Contents: Read on the repo)"
  );
}

function tail(text: string): string {
  if (text.length <= OUTPUT_TAIL) return text;
  return `…\n${text.slice(text.length - OUTPUT_TAIL)}`;
}

function runGit(
  args: string[],
  opts: {
    cwd?: string;
    token?: string | null;
    provider?: GitProvider | null;
    host?: string | null;
    timeout?: number;
  } = {}
): Promise<string> {
  assertGit();
  const timeout = opts.timeout ?? GIT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    execFile(
      resolveGitBin() as string,
      gitArgv(opts, args),
      {
        cwd: opts.cwd,
        env: gitEnv(),
        timeout,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ""}${stderr ?? ""}`.trim();
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            reject(
              new ProjectsError(503, "git is not installed or not on PATH")
            );
            return;
          }
          const msg = out || err.message;
          if (/could not read username|authentication failed|invalid credentials|403|401/i.test(msg)) {
            reject(authFailedError(msg));
            return;
          }
          reject(new ProjectsError(500, tail(msg)));
          return;
        }
        resolve((stdout ?? "").trim());
      }
    );
  });
}

export function spawnGit(
  args: string[],
  opts: {
    cwd?: string;
    token?: string | null;
    provider?: GitProvider | null;
    host?: string | null;
    onChunk?: (text: string) => void;
    timeout?: number;
  } = {}
): Promise<void> {
  assertGit();
  const timeout = opts.timeout ?? GIT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(resolveGitBin() as string, gitArgv(opts, args), {
      cwd: opts.cwd,
      env: gitEnv(),
      windowsHide: true,
    });
    let log = "";
    const append = (buf: Buffer) => {
      const text = buf.toString();
      log = tail(log + text);
      opts.onChunk?.(text);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        reject(new ProjectsError(503, "git is not installed or not on PATH"));
        return;
      }
      reject(err);
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ProjectsError(504, "git timed out"));
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      if (/could not read username|authentication failed|invalid credentials|403|401/i.test(log)) {
        reject(authFailedError(log));
        return;
      }
      reject(new ProjectsError(500, tail(log) || `git exited with code ${code ?? "?"}`));
    });
  });
}

export async function verifyGitToken(
  provider: GitProvider,
  token: string,
  host: string
): Promise<{ login: string; host: string }> {
  const trimmed = token.trim();
  if (trimmed.length < 8 || trimmed.length > 512) {
    throw new ProjectsError(400, "token looks invalid");
  }
  const h = host.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "") || (
    provider === "gitlab" ? "gitlab.com" : "github.com"
  );
  if (!/^[A-Za-z0-9.-]+$/.test(h)) {
    throw new ProjectsError(400, "invalid git host");
  }

  if (provider === "github") {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${trimmed}`,
        "User-Agent": APP_USER_AGENT,
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProjectsError(400, "GitHub rejected that token");
    }
    if (!res.ok) {
      throw new ProjectsError(502, `GitHub API error (${res.status})`);
    }
    const body = (await res.json()) as { login?: string };
    if (!body.login) throw new ProjectsError(502, "GitHub did not return a username");
    return { login: body.login, host: "github.com" };
  }

  const res = await fetch(`https://${h}/api/v4/user`, {
    headers: {
      "PRIVATE-TOKEN": trimmed,
      "User-Agent": APP_USER_AGENT,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new ProjectsError(400, "GitLab rejected that token");
  }
  if (!res.ok) {
    throw new ProjectsError(502, `GitLab API error (${res.status})`);
  }
  const body = (await res.json()) as { username?: string };
  if (!body.username) throw new ProjectsError(502, "GitLab did not return a username");
  return { login: body.username, host: h };
}

export interface GitAccountDetails {
  account: {
    id: number;
    provider: GitProvider;
    login: string;
    host: string;
    tokenLast4: string;
    createdAt: number;
  };
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
}

function tokenKind(provider: GitProvider, token: string): string {
  if (token.startsWith("github_pat_")) return "Fine-grained PAT";
  if (token.startsWith("ghp_")) return "Classic PAT";
  if (token.startsWith("gho_")) return "OAuth token";
  if (token.startsWith("ghs_")) return "GitHub App token";
  if (token.startsWith("glpat-")) return "Personal access token";
  return provider === "gitlab" ? "GitLab token" : "GitHub token";
}

function header(res: Response, name: string): string | null {
  return res.headers.get(name) || res.headers.get(name.toLowerCase());
}

const GIT_API_CACHE_MS = 5 * 60_000;

const detailsCache = new Map<number, { at: number; details: GitAccountDetails }>();
const detailsInflight = new Map<number, Promise<GitAccountDetails>>();
const reposCache = new Map<GitProvider, { at: number; repos: GitRepoInfo[] }>();
const reposInflight = new Map<GitProvider, Promise<GitRepoInfo[]>>();

export function invalidateGitApiCache(accountId?: number): void {
  if (accountId != null) detailsCache.delete(accountId);
  else detailsCache.clear();
  reposCache.clear();
}

export async function fetchAccountDetails(
  accountId: number,
  opts?: { force?: boolean }
): Promise<GitAccountDetails> {
  if (!opts?.force) {
    const hit = detailsCache.get(accountId);
    if (hit && Date.now() - hit.at < GIT_API_CACHE_MS) {
      return { ...hit.details, cachedAt: hit.at };
    }
  }
  const pending = detailsInflight.get(accountId);
  if (pending) return pending;
  const task = loadAccountDetails(accountId).then((details) => {
    const at = Date.now();
    const stored = { ...details, cachedAt: details.error ? null : at };
    if (!details.error) detailsCache.set(accountId, { at, details: stored });
    return stored;
  });
  detailsInflight.set(accountId, task);
  try {
    return await task;
  } finally {
    detailsInflight.delete(accountId);
  }
}

async function loadAccountDetails(accountId: number): Promise<GitAccountDetails> {
  const acc = getAccountById(accountId);
  if (!acc) throw new ProjectsError(404, "git account not found");
  const base: GitAccountDetails = {
    account: {
      id: acc.id,
      provider: acc.provider,
      login: acc.login,
      host: acc.host,
      tokenLast4: acc.tokenLast4,
      createdAt: acc.createdAt,
    },
    tokenKind: tokenKind(acc.provider, acc.token),
    scopes: [],
    expiresAt: null,
    profile: null,
    rateLimit: null,
    error: null,
    cachedAt: null,
  };

  try {
    if (acc.provider === "github") {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${acc.token}`,
          "User-Agent": APP_USER_AGENT,
        },
      });
      const scopes = (header(res, "x-oauth-scopes") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const limit = Number(header(res, "x-ratelimit-limit"));
      const remaining = Number(header(res, "x-ratelimit-remaining"));
      const reset = Number(header(res, "x-ratelimit-reset"));
      base.scopes = scopes;
      base.expiresAt = header(res, "github-authentication-token-expiration");
      if (Number.isFinite(limit) && Number.isFinite(remaining)) {
        base.rateLimit = {
          limit,
          remaining,
          resetAt: Number.isFinite(reset) ? reset * 1000 : null,
        };
      }
      if (res.status === 401 || res.status === 403) {
        base.error = "GitHub rejected this token — reconnect it";
        return base;
      }
      if (!res.ok) {
        base.error = `GitHub API error (${res.status})`;
        return base;
      }
      const u = (await res.json()) as {
        login?: string;
        name?: string | null;
        html_url?: string;
        avatar_url?: string;
        email?: string | null;
        company?: string | null;
        location?: string | null;
        bio?: string | null;
        public_repos?: number;
        total_private_repos?: number;
        created_at?: string;
      };
      base.profile = {
        login: u.login || acc.login,
        name: u.name ?? null,
        htmlUrl: u.html_url ?? `https://github.com/${acc.login}`,
        avatarUrl: u.avatar_url ?? null,
        email: u.email ?? null,
        company: u.company ?? null,
        location: u.location ?? null,
        bio: u.bio ?? null,
        publicRepos: typeof u.public_repos === "number" ? u.public_repos : null,
        privateRepos:
          typeof u.total_private_repos === "number" ? u.total_private_repos : null,
        accountCreatedAt: u.created_at ?? null,
      };
      return base;
    }

    const res = await fetch(`https://${acc.host}/api/v4/user`, {
      headers: {
        "PRIVATE-TOKEN": acc.token,
        "User-Agent": APP_USER_AGENT,
      },
    });
    if (res.status === 401 || res.status === 403) {
      base.error = "GitLab rejected this token — reconnect it";
      return base;
    }
    if (!res.ok) {
      base.error = `GitLab API error (${res.status})`;
      return base;
    }
    const u = (await res.json()) as {
      username?: string;
      name?: string | null;
      web_url?: string;
      avatar_url?: string;
      email?: string | null;
      organization?: string | null;
      location?: string | null;
      bio?: string | null;
      created_at?: string;
    };
    base.profile = {
      login: u.username || acc.login,
      name: u.name ?? null,
      htmlUrl: u.web_url ?? `https://${acc.host}/${acc.login}`,
      avatarUrl: u.avatar_url ?? null,
      email: u.email ?? null,
      company: u.organization ?? null,
      location: u.location ?? null,
      bio: u.bio ?? null,
      publicRepos: null,
      privateRepos: null,
      accountCreatedAt: u.created_at ?? null,
    };
    try {
      const tok = await fetch(`https://${acc.host}/api/v4/personal_access_tokens/self`, {
        headers: {
          "PRIVATE-TOKEN": acc.token,
          "User-Agent": APP_USER_AGENT,
        },
      });
      if (tok.ok) {
        const t = (await tok.json()) as {
          scopes?: string[];
          expires_at?: string | null;
          name?: string;
        };
        if (Array.isArray(t.scopes)) base.scopes = t.scopes;
        if (t.expires_at) base.expiresAt = t.expires_at;
        if (t.name) base.tokenKind = t.name;
      }
    } catch {
      // Optional metadata; profile is enough.
    }
    return base;
  } catch (err) {
    base.error = err instanceof Error ? err.message : "could not reach git host";
    return base;
  }
}

export async function listRemoteRepos(
  provider: GitProvider,
  opts?: { force?: boolean }
): Promise<GitRepoInfo[]> {
  if (!opts?.force) {
    const hit = reposCache.get(provider);
    if (hit && Date.now() - hit.at < GIT_API_CACHE_MS) return hit.repos;
  }
  const pending = reposInflight.get(provider);
  if (pending) return pending;
  const task = loadRemoteRepos(provider).then((repos) => {
    reposCache.set(provider, { at: Date.now(), repos });
    return repos;
  });
  reposInflight.set(provider, task);
  try {
    return await task;
  } finally {
    reposInflight.delete(provider);
  }
}

async function loadRemoteRepos(provider: GitProvider): Promise<GitRepoInfo[]> {
  const acc = getAccountByProvider(provider);
  if (!acc) {
    throw new ProjectsError(400, `connect a ${provider} token first`);
  }
  if (provider === "github") {
    const repos: GitRepoInfo[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${acc.token}`,
            "User-Agent": APP_USER_AGENT,
          },
        }
      );
      if (!res.ok) {
        throw new ProjectsError(
          res.status === 401 || res.status === 403 ? 400 : 502,
          res.status === 401 || res.status === 403
            ? "GitHub rejected that token"
            : `GitHub API error (${res.status})`
        );
      }
      const batch = (await res.json()) as Array<{
        name: string;
        full_name: string;
        clone_url: string;
        default_branch: string;
        private: boolean;
      }>;
      for (const r of batch) {
        repos.push({
          name: r.name,
          fullName: r.full_name,
          url: r.clone_url,
          defaultBranch: r.default_branch || "main",
          private: !!r.private,
        });
      }
      if (batch.length < 100) break;
    }
    return repos;
  }

  const repos: GitRepoInfo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://${acc.host}/api/v4/projects?membership=true&simple=true&order_by=updated_at&per_page=100&page=${page}`,
      {
        headers: {
          "PRIVATE-TOKEN": acc.token,
          "User-Agent": APP_USER_AGENT,
        },
      }
    );
    if (!res.ok) {
      throw new ProjectsError(
        res.status === 401 || res.status === 403 ? 400 : 502,
        res.status === 401 || res.status === 403
          ? "GitLab rejected that token"
          : `GitLab API error (${res.status})`
      );
    }
    const batch = (await res.json()) as Array<{
      name: string;
      path_with_namespace: string;
      http_url_to_repo: string;
      default_branch: string | null;
      visibility: string;
    }>;
    for (const r of batch) {
      repos.push({
        name: r.name,
        fullName: r.path_with_namespace,
        url: r.http_url_to_repo,
        defaultBranch: r.default_branch || "main",
        private: r.visibility !== "public",
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    const st = await fsp.stat(dir);
    if (!st.isDirectory()) {
      throw new ProjectsError(400, "local path exists and is not a folder");
    }
    const entries = await fsp.readdir(dir);
    return entries.length === 0;
  } catch (err) {
    if (err instanceof ProjectsError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return true;
    throw err;
  }
}

async function isGitDir(dir: string): Promise<boolean> {
  try {
    const st = await fsp.stat(path.join(dir, ".git"));
    return st.isDirectory() || st.isFile();
  } catch {
    return false;
  }
}

export function credentialsForRemote(
  remoteUrl: string,
  account: GitAccountRecord | null
): { token: string | null; provider: GitProvider | null; host: string | null } {
  if (account) {
    return { token: account.token, provider: account.provider, host: account.host };
  }
  const provider = providerForUrl(remoteUrl);
  if (!provider) return { token: null, provider: null, host: null };
  const fallback = getAccountByProvider(provider);
  return fallback
    ? { token: fallback.token, provider: fallback.provider, host: fallback.host }
    : { token: null, provider, host: null };
}

export interface RemoteBranches {
  branches: string[];
  defaultBranch: string | null;
}

/** Lists remote heads via `git ls-remote` (no local clone). */
export async function listRemoteBranches(remoteUrl: string): Promise<RemoteBranches> {
  const url = normalizeRemoteUrl(remoteUrl);
  if (!url) throw new ProjectsError(400, "repo URL is required");
  const creds = credentialsForRemote(url, null);
  const [heads, headRef] = await Promise.all([
    runGit(["ls-remote", "--heads", "--", url], { ...creds, timeout: 30_000 }),
    runGit(["ls-remote", "--symref", "--", url, "HEAD"], {
      ...creds,
      timeout: 30_000,
    }).catch(() => ""),
  ]);
  const branches: string[] = [];
  for (const line of heads.split(/\r?\n/)) {
    const head = /\trefs\/heads\/(.+)$/.exec(line.trim());
    if (head) branches.push(head[1]);
  }
  let defaultBranch: string | null = null;
  for (const line of headRef.split(/\r?\n/)) {
    const sym = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/i.exec(line.trim());
    if (sym) {
      defaultBranch = sym[1];
      break;
    }
  }
  const unique = [...new Set(branches)].sort((a, b) => a.localeCompare(b));
  if (defaultBranch && !unique.includes(defaultBranch)) unique.unshift(defaultBranch);
  if (!defaultBranch) {
    defaultBranch = unique.includes("main")
      ? "main"
      : unique.includes("master")
        ? "master"
        : unique[0] ?? null;
  }
  return { branches: unique, defaultBranch };
}

export async function ensureLocalRepo(opts: {
  localPath: string;
  remoteUrl: string;
  branch: string;
  account: GitAccountRecord | null;
}): Promise<{ cloned: boolean }> {
  const url = normalizeRemoteUrl(opts.remoteUrl);
  const creds = credentialsForRemote(url, opts.account);
  const exists = fs.existsSync(opts.localPath);
  if (exists && !(await isEmptyDir(opts.localPath))) {
    if (!(await isGitDir(opts.localPath))) {
      throw new ProjectsError(
        400,
        "that folder already has files and is not a git repository"
      );
    }
    const origin = await runGit(["remote", "get-url", "origin"], {
      cwd: opts.localPath,
    });
    if (!remotesMatch(origin, url)) {
      throw new ProjectsError(
        400,
        `folder already tracks a different remote (${origin})`
      );
    }
    return { cloned: false };
  }
  const parent = path.dirname(opts.localPath);
  if (parent && parent !== opts.localPath && !fs.existsSync(parent)) {
    try {
      await fsp.mkdir(parent, { recursive: true });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EPERM" || e.code === "EACCES") {
        throw new ProjectsError(
          400,
          `cannot create folder ${parent} — permission denied`
        );
      }
      throw new ProjectsError(500, e.message || "could not create folder");
    }
  }
  await spawnGit(
    ["clone", "--branch", opts.branch, "--", url, opts.localPath],
    creds
  );
  return { cloned: true };
}

export async function gitPull(
  opts: {
    localPath: string;
    branch: string;
    account: GitAccountRecord | null;
    remoteUrl: string;
    onChunk?: (text: string) => void;
  }
): Promise<void> {
  const creds = credentialsForRemote(opts.remoteUrl, opts.account);
  await spawnGit(["fetch", "origin"], {
    cwd: opts.localPath,
    ...creds,
    onChunk: opts.onChunk,
  });
  try {
    await spawnGit(["checkout", opts.branch], {
      cwd: opts.localPath,
      ...creds,
      onChunk: opts.onChunk,
    });
  } catch {
    await spawnGit(["checkout", "-B", opts.branch, "--track", `origin/${opts.branch}`], {
      cwd: opts.localPath,
      ...creds,
      onChunk: opts.onChunk,
    });
  }
  await spawnGit(["pull", "--ff-only", "origin", opts.branch], {
    cwd: opts.localPath,
    ...creds,
    onChunk: opts.onChunk,
  });
}

export async function checkRemote(opts: {
  localPath: string;
  branch: string;
  account: GitAccountRecord | null;
  remoteUrl: string;
}): Promise<GitCheckResult> {
  if (!fs.existsSync(opts.localPath) || !(await isGitDir(opts.localPath))) {
    return {
      ok: false,
      cloned: false,
      branch: opts.branch,
      headSha: null,
      remoteSha: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      message: "project folder is missing or is not a git checkout",
    };
  }
  const creds = credentialsForRemote(opts.remoteUrl, opts.account);
  await spawnGit(["fetch", "origin"], { cwd: opts.localPath, ...creds });
  const headSha = await runGit(["rev-parse", "HEAD"], { cwd: opts.localPath });
  let remoteSha: string | null = null;
  try {
    remoteSha = await runGit(["rev-parse", `origin/${opts.branch}`], {
      cwd: opts.localPath,
    });
  } catch {
    remoteSha = null;
  }
  let ahead = 0;
  let behind = 0;
  if (remoteSha) {
    const counts = await runGit(
      ["rev-list", "--left-right", "--count", `HEAD...origin/${opts.branch}`],
      { cwd: opts.localPath }
    );
    const parts = counts.split(/\s+/);
    ahead = Number(parts[0]) || 0;
    behind = Number(parts[1]) || 0;
  }
  const porcelain = await runGit(["status", "--porcelain"], {
    cwd: opts.localPath,
  });
  let message: string | null = null;
  try {
    message = await runGit(["log", "-1", "--pretty=%s"], { cwd: opts.localPath });
  } catch {
    message = null;
  }
  return {
    ok: true,
    cloned: true,
    branch: opts.branch,
    headSha: headSha.slice(0, 12),
    remoteSha: remoteSha ? remoteSha.slice(0, 12) : null,
    ahead,
    behind,
    dirty: porcelain.length > 0,
    message,
  };
}
