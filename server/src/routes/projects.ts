import { Router } from "express";
import { clientIp, recordAudit, requireRole } from "../auth.js";
import {
  ProjectsError,
  createAction,
  deleteAccount,
  deleteAction,
  deleteProject,
  getAccountById,
  getAccountByProvider,
  getProjectDetail,
  insertProject,
  isGitProvider,
  listAccounts,
  listProjects,
  listRuns,
  parseId,
  providerForUrl,
  requireProject,
  sanitizeBoot,
  sanitizeBranch,
  sanitizeOptionalBranch,
  sanitizeContainerName,
  sanitizeLocalPath,
  sanitizeOptionalLocalPath,
  sanitizeName,
  sanitizePort,
  sanitizeRemoteUrl,
  sanitizeRunKind,
  sanitizeServiceKind,
  sanitizeSiteUrl,
  sanitizeStartCommand,
  sanitizeHealthPath,
  sanitizeEmbedPreview,
  sanitizeNotes,
  sanitizeRelPath,
  sanitizeUnitName,
  projectHasGit,
  updateAction,
  updateProject,
  upsertAccount,
  type RunKind,
  type ServiceKind,
  type StepInput,
} from "../projects.js";
import {
  ensureLocalRepo,
  fetchAccountDetails,
  gitAvailable,
  invalidateGitApiCache,
  listRemoteBranches,
  listRemoteRepos,
  verifyGitToken,
} from "../gitRemote.js";
import {
  checkProjectRemote,
  getProjectJob,
  projectsCapabilities,
  startActionRun,
} from "../actionRunner.js";
import { addCloudflaredIngress, discoverCloudflaredIngress } from "../cloudflared.js";
import {
  cloudflareHint,
  connectCloudflareAccount,
  deleteCloudflareAccount,
  getCloudflareAccountPublic,
} from "../cloudflareAnalytics.js";
import { invalidateSiteStatus, listSiteStatus } from "../siteStatus.js";

export const projectsRouter = Router();

const mutate = requireRole("user");

function parseRunProfile(body: Record<string, unknown>): {
  siteUrl?: string | null;
  runKind?: RunKind;
  serviceKind?: ServiceKind;
  port?: number | null;
  boot?: boolean;
  container?: string | null;
  composeFile?: string | null;
  unit?: string | null;
  publishFrom?: string | null;
  publishTo?: string | null;
  startCommand?: string | null;
  healthPath?: string | null;
  embedPreview?: boolean;
  embedUrl?: string | null;
  notes?: string | null;
} {
  const profile: ReturnType<typeof parseRunProfile> = {};
  if (body.siteUrl !== undefined) profile.siteUrl = sanitizeSiteUrl(body.siteUrl);
  if (body.runKind !== undefined) profile.runKind = sanitizeRunKind(body.runKind);
  if (body.serviceKind !== undefined) profile.serviceKind = sanitizeServiceKind(body.serviceKind);
  if (body.port !== undefined) profile.port = sanitizePort(body.port);
  if (body.boot !== undefined) profile.boot = sanitizeBoot(body.boot);
  if (body.container !== undefined) profile.container = sanitizeContainerName(body.container);
  if (body.composeFile !== undefined) {
    profile.composeFile = sanitizeRelPath(body.composeFile, "compose file");
  }
  if (body.unit !== undefined) profile.unit = sanitizeUnitName(body.unit);
  if (body.publishFrom !== undefined) {
    profile.publishFrom = sanitizeRelPath(body.publishFrom, "publish from");
  }
  if (body.publishTo !== undefined) {
    profile.publishTo =
      body.publishTo === null || body.publishTo === ""
        ? null
        : sanitizeLocalPath(body.publishTo);
  }
  if (body.startCommand !== undefined) {
    profile.startCommand = sanitizeStartCommand(body.startCommand);
  }
  if (body.healthPath !== undefined) profile.healthPath = sanitizeHealthPath(body.healthPath);
  if (body.embedPreview !== undefined) {
    profile.embedPreview = sanitizeEmbedPreview(body.embedPreview);
  }
  if (body.embedUrl !== undefined) profile.embedUrl = sanitizeSiteUrl(body.embedUrl);
  if (body.notes !== undefined) profile.notes = sanitizeNotes(body.notes);
  return profile;
}

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof ProjectsError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("projects error:", err);
  res.status(500).json({ error: "project request failed" });
}

projectsRouter.get("/capabilities", (_req, res) => {
  res.json(projectsCapabilities());
});

projectsRouter.get("/accounts", (_req, res) => {
  res.json({ accounts: listAccounts() });
});

projectsRouter.post("/accounts", mutate, async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      provider?: unknown;
      token?: unknown;
      host?: unknown;
    };
    if (!isGitProvider(body.provider)) {
      res.status(400).json({ error: 'provider must be "github" or "gitlab"' });
      return;
    }
    if (typeof body.token !== "string" || !body.token.trim()) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const host =
      typeof body.host === "string" && body.host.trim()
        ? body.host.trim()
        : body.provider === "gitlab"
          ? "gitlab.com"
          : "github.com";
    const verified = await verifyGitToken(body.provider, body.token.trim(), host);
    const account = upsertAccount({
      provider: body.provider,
      token: body.token.trim(),
      login: verified.login,
      host: verified.host,
    });
    invalidateGitApiCache(account.id);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.git.connect",
      detail: `${account.provider}:${account.login}`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ account });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.get("/accounts/:id", mutate, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!getAccountById(id)) {
      throw new ProjectsError(404, "git account not found");
    }
    const details = await fetchAccountDetails(id, {
      force: req.query.refresh === "1",
    });
    const projects = listProjects()
      .filter((p) => p.accountId === id)
      .map((p) => ({ id: p.id, name: p.name, localPath: p.localPath }));
    res.json({ ...details, projects });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.delete("/accounts/:id", mutate, (req, res) => {
  try {
    const id = parseId(req.params.id);
    const acc = getAccountById(id);
    deleteAccount(id);
    invalidateGitApiCache(id);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.git.disconnect",
      detail: acc ? `${acc.provider}:${acc.login}` : String(id),
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.get("/repos", mutate, async (req, res) => {
  try {
    const raw = req.query.provider;
    const provider = Array.isArray(raw) ? raw[0] : raw;
    if (!isGitProvider(provider)) {
      res.status(400).json({ error: 'provider must be "github" or "gitlab"' });
      return;
    }
    res.json({
      repos: await listRemoteRepos(provider, { force: req.query.refresh === "1" }),
    });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.get("/branches", mutate, async (req, res) => {
  try {
    const raw = req.query.url;
    const url = Array.isArray(raw) ? raw[0] : raw;
    if (typeof url !== "string" || !url.trim()) {
      res.status(400).json({ error: "url is required" });
      return;
    }
    if (!gitAvailable()) {
      throw new ProjectsError(
        503,
        "git is not installed or not on PATH — install Git on this host first"
      );
    }
    res.json(await listRemoteBranches(sanitizeRemoteUrl(url)));
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.get("/", async (_req, res) => {
  res.json({
    projects: listProjects(),
    accounts: listAccounts(),
    capabilities: projectsCapabilities(),
    ingress: await discoverCloudflaredIngress(),
    cloudflare: getCloudflareAccountPublic(),
  });
});

projectsRouter.get("/status", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const projects = listProjects();
    res.json({
      sites: await listSiteStatus(projects, { force }),
      cloudflare: getCloudflareAccountPublic(),
      hint: cloudflareHint(),
    });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.post("/cloudflare", mutate, async (req, res) => {
  try {
    const body = (req.body ?? {}) as { token?: unknown };
    if (typeof body.token !== "string") {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const account = await connectCloudflareAccount(body.token);
    invalidateSiteStatus();
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.cloudflare.connect",
      detail: account.email ? `cloudflare:${account.email}` : "cloudflare",
      status: 200,
      ip: clientIp(req),
    });
    res.json({ cloudflare: account });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.delete("/cloudflare", mutate, (req, res) => {
  try {
    const prev = getCloudflareAccountPublic();
    if (prev.source === "env") {
      res.status(400).json({
        error: "Cloudflare is connected via CLOUDFLARE_API_TOKEN — unset the env var to disconnect",
      });
      return;
    }
    deleteCloudflareAccount();
    invalidateSiteStatus();
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.cloudflare.disconnect",
      detail: prev.email ?? "cloudflare",
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true, cloudflare: getCloudflareAccountPublic() });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.post("/ingress", mutate, async (req, res) => {
  try {
    const body = (req.body ?? {}) as { hostname?: unknown; port?: unknown };
    const hostname = typeof body.hostname === "string" ? body.hostname : "";
    const port = typeof body.port === "number" ? body.port : Number(body.port);
    const result = await addCloudflaredIngress({ hostname, port });
    const detail = result.updated
      ? `updated ${hostname} → 127.0.0.1:${port} (${result.file ?? ""})`
      : result.already
        ? `${hostname} already in cloudflared`
        : `added ${hostname} → 127.0.0.1:${port} (${result.file ?? ""})`;
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.cloudflared.ingress",
      detail,
      status: 200,
      ip: clientIp(req),
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.post("/", mutate, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = sanitizeName(body.name);
    const profile = parseRunProfile(body);
    const serviceKind = profile.serviceKind ?? "website";
    const remoteUrl = sanitizeRemoteUrl(body.remoteUrl, { optional: serviceKind === "worker" });
    const wantsGit = projectHasGit({ remoteUrl });
    const localPath = sanitizeOptionalLocalPath(body.localPath);
    const branch = wantsGit ? sanitizeBranch(body.branch) : sanitizeOptionalBranch(body.branch);
    if (wantsGit || serviceKind !== "worker") {
      if (!gitAvailable()) {
        throw new ProjectsError(
          503,
          "git is not installed or not on PATH — install Git on this host first"
        );
      }
    }
    let accountId: number | null = null;
    if (body.accountId !== undefined && body.accountId !== null && body.accountId !== "") {
      accountId = parseId(String(body.accountId));
      if (!getAccountById(accountId)) {
        throw new ProjectsError(400, "git account not found");
      }
    } else if (wantsGit) {
      const provider = providerForUrl(remoteUrl);
      if (provider) {
        const acc = getAccountByProvider(provider);
        if (acc) accountId = acc.id;
      }
    }
    const account = accountId ? getAccountById(accountId) : null;
    if (wantsGit) {
      if (!localPath) throw new ProjectsError(400, "local path is required");
      await ensureLocalRepo({ localPath, remoteUrl, branch, account });
    }
    const project = insertProject({
      name,
      localPath,
      remoteUrl,
      branch,
      accountId: wantsGit ? accountId : null,
      ...profile,
    });
    invalidateSiteStatus();
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.create",
      detail: project.localPath ? `${project.name} (${project.localPath})` : project.name,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ project: getProjectDetail(project.id) });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.get("/:id/job", (req, res) => {
  try {
    const id = parseId(req.params.id);
    requireProject(id);
    res.json(getProjectJob(id));
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.get("/:id/runs", (req, res) => {
  try {
    const id = parseId(req.params.id);
    requireProject(id);
    const limit = Number(req.query.limit);
    res.json({
      runs: listRuns(id, Number.isFinite(limit) ? limit : 20),
    });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.post("/:id/check", mutate, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const project = requireProject(id);
    const result = await checkProjectRemote(id);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.check",
      detail: project.name,
      status: 200,
      ip: clientIp(req),
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.get("/:id", (req, res) => {
  try {
    res.json({ project: getProjectDetail(parseId(req.params.id)) });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.patch("/:id", mutate, (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: {
      name?: string;
      remoteUrl?: string;
      branch?: string;
      accountId?: number | null;
    } & ReturnType<typeof parseRunProfile> = {
      ...parseRunProfile(body),
    };
    if (body.name !== undefined) patch.name = sanitizeName(body.name);
    if (body.remoteUrl !== undefined) patch.remoteUrl = sanitizeRemoteUrl(body.remoteUrl);
    if (body.branch !== undefined) patch.branch = sanitizeBranch(body.branch);
    if (body.accountId !== undefined) {
      patch.accountId =
        body.accountId === null || body.accountId === ""
          ? null
          : parseId(String(body.accountId));
    }
    const project = updateProject(id, patch);
    invalidateSiteStatus();
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.update",
      detail: project.name,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ project: getProjectDetail(id) });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.delete("/:id", mutate, (req, res) => {
  try {
    const id = parseId(req.params.id);
    const project = requireProject(id);
    deleteProject(id);
    invalidateSiteStatus();
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.delete",
      detail: `${project.name} (${project.localPath})`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.post("/:id/actions", mutate, (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = (req.body ?? {}) as { name?: unknown; steps?: unknown };
    const name = sanitizeName(body.name);
    if (!Array.isArray(body.steps)) {
      res.status(400).json({ error: "steps is required" });
      return;
    }
    const action = createAction(id, name, body.steps);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.action.create",
      detail: `${requireProject(id).name}: ${action.name}`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ action });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.patch("/:id/actions/:actionId", mutate, (req, res) => {
  try {
    const id = parseId(req.params.id);
    const actionId = parseId(req.params.actionId);
    const body = (req.body ?? {}) as { name?: unknown; steps?: unknown };
    const patch: { name?: string; steps?: StepInput[] } = {};
    if (body.name !== undefined) patch.name = sanitizeName(body.name);
    if (body.steps !== undefined) {
      if (!Array.isArray(body.steps)) {
        res.status(400).json({ error: "steps must be an array" });
        return;
      }
      patch.steps = body.steps as StepInput[];
    }
    const action = updateAction(id, actionId, patch);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.action.update",
      detail: `${requireProject(id).name}: ${action.name}`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ action });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.delete("/:id/actions/:actionId", mutate, (req, res) => {
  try {
    const id = parseId(req.params.id);
    const actionId = parseId(req.params.actionId);
    const project = requireProject(id);
    deleteAction(id, actionId);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.action.delete",
      detail: `${project.name} action ${actionId}`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

projectsRouter.post("/:id/actions/:actionId/run", mutate, (req, res) => {
  try {
    const id = parseId(req.params.id);
    const actionId = parseId(req.params.actionId);
    const job = startActionRun(id, actionId);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "project.run",
      detail: `${requireProject(id).name}: ${job.actionName}`,
      status: 200,
      ip: clientIp(req),
    });
    res.json(job);
  } catch (err) {
    sendError(res, err);
  }
});
