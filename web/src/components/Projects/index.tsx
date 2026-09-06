import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitBranch,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import {
  checkProjectRemoteApi,
  connectGitAccountApi,
  connectCloudflareApi,
  createProjectActionApi,
  createProjectApi,
  addCloudflaredIngressApi,
  deleteProjectActionApi,
  deleteProjectApi,
  disconnectCloudflareApi,
  disconnectGitAccountApi,
  fetchGitAccountDetails,
  fetchGitBranches,
  fetchGitRepos,
  fetchProject,
  fetchProjectJob,
  fetchProjectsOverview,
  fetchSitesStatus,
  formatDate,
  formatRelative,
  runProjectActionApi,
  updateProjectActionApi,
  updateProjectApi,
} from "../../api";
import { cache } from "../../cache";
import { hasRole, useAuth } from "../../auth/AuthContext";
import type {
  ActionJob,
  ActionStepType,
  CloudflareAccountPublic,
  GitAccountDetails,
  GitAccountPublic,
  GitCheckResult,
  GitProvider,
  GitRepoInfo,
  IngressDiscovery,
  IngressRoute,
  ProjectAction,
  ProjectDetail,
  ProjectSiteStatus,
  ProjectSummary,
  ProjectsCapabilities,
  RunKind,
  SiteOverallState,
  StepInput,
} from "../../types";
import { Dropdown } from "../Dropdown";
import {
  AuthError,
  GhostBtn,
  Loading,
  ModalActions,
  ModalBtn,
  ModalCard,
  ModalClose,
  ModalHead,
  ModalOverlay,
  ModalSub,
  RevokeDetails,
} from "../ui/styles";
import { FolderPicker } from "./FolderPicker";
import { TunnelDnsHint } from "../TunnelDns";
import * as S from "./styles";

const JOB_POLL_MS = 800;

function stepSummary(step: {
  type: ActionStepType;
  command?: string | null;
  container?: string | null;
  unit?: string | null;
  source?: string | null;
  dest?: string | null;
}): string {
  switch (step.type) {
    case "git_pull":
      return "Pull latest from the tracked branch";
    case "command":
      return step.command || "Command";
    case "docker_restart":
      return `Restart Docker container ${step.container ?? ""}`.trim();
    case "docker_ensure":
      return `Ensure Docker ${step.container ?? ""}`.trim();
    case "compose_up":
      return `Compose up ${step.source ?? "compose.yaml"}`;
    case "systemd_restart":
      return `Restart ${step.unit ?? "systemd unit"}`;
    case "systemd_enable":
      return `Enable ${step.unit ?? "systemd unit"} on boot`;
    case "systemd_apply":
      return `Install systemd unit ${step.unit ?? ""}`.trim();
    case "publish":
      return `Publish ${step.source ?? "dist"} → ${step.dest ?? ""}`.trim();
    default:
      return step.type;
  }
}

function runStatus(
  run: ProjectSummary["lastRun"],
  job: ActionJob | null
): "ok" | "error" | "running" | undefined {
  if (job?.running && job.projectId === run?.projectId) return "running";
  if (run?.status === "ok" || run?.status === "error" || run?.status === "running") {
    return run.status;
  }
  return undefined;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

function probeDot(state: string | null | undefined): "up" | "degraded" | "down" | "unknown" {
  if (state === "up" || state === "degraded" || state === "down") return state;
  return "unknown";
}

function healthLabel(state: SiteOverallState): string {
  if (state === "up") return "Up";
  if (state === "degraded") return "Degraded";
  if (state === "down") return "Down";
  return "Unknown";
}

function probeSummary(probe: ProjectSiteStatus["public"]): string {
  if (!probe) return "not checked";
  if (probe.state === "up") {
    return `${probe.statusCode ?? "ok"}${probe.ms != null ? ` · ${probe.ms}ms` : ""}`;
  }
  return probe.error || probe.state;
}

function healthDetail(status: ProjectSiteStatus): string {
  const bits = [
    status.public ? `Public ${probeSummary(status.public)}` : null,
    status.origin ? `Origin ${probeSummary(status.origin)}` : null,
    status.runtime.state !== "skipped"
      ? `${status.runtime.kind} ${status.runtime.state}${
          status.runtime.detail ? ` (${status.runtime.detail})` : ""
        }`
      : null,
  ].filter(Boolean);
  return bits.join(" · ") || "No URL, port, or runtime to check yet.";
}

const STATUS_POLL_MS = 30_000;

export function Projects() {
  const { user } = useAuth();
  const canManage = hasRole(user, "user");
  const [projects, setProjects] = useState<ProjectSummary[]>(() => cache.projects.projects);
  const [accounts, setAccounts] = useState<GitAccountPublic[]>(() => cache.projects.accounts);
  const [capabilities, setCapabilities] = useState<ProjectsCapabilities | null>(
    () => cache.projects.capabilities
  );
  const [ingress, setIngress] = useState<IngressDiscovery | null>(
    () => cache.projects.ingress
  );
  const [cloudflare, setCloudflare] = useState<CloudflareAccountPublic | null>(
    () => cache.projects.cloudflare
  );
  const [sites, setSites] = useState<ProjectSiteStatus[]>(() => cache.projects.sites);
  const [selectedId, setSelectedId] = useState<number | null>(() => cache.projects.selectedId);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [job, setJob] = useState<ActionJob | null>(null);
  const [check, setCheck] = useState<GitCheckResult | null>(null);
  const [loading, setLoading] = useState(projects.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [cfOpen, setCfOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState<GitAccountPublic | null>(null);
  const [actionEdit, setActionEdit] = useState<ProjectAction | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const persist = useCallback(
    (next: {
      projects?: ProjectSummary[];
      accounts?: GitAccountPublic[];
      capabilities?: ProjectsCapabilities | null;
      ingress?: IngressDiscovery | null;
      cloudflare?: CloudflareAccountPublic | null;
      sites?: ProjectSiteStatus[];
      selectedId?: number | null;
    }) => {
      if (next.projects) {
        cache.projects.projects = next.projects;
        setProjects(next.projects);
      }
      if (next.accounts) {
        cache.projects.accounts = next.accounts;
        setAccounts(next.accounts);
      }
      if (next.capabilities !== undefined) {
        cache.projects.capabilities = next.capabilities;
        setCapabilities(next.capabilities);
      }
      if (next.ingress !== undefined) {
        cache.projects.ingress = next.ingress;
        setIngress(next.ingress);
      }
      if (next.cloudflare !== undefined) {
        cache.projects.cloudflare = next.cloudflare;
        setCloudflare(next.cloudflare);
      }
      if (next.sites) {
        cache.projects.sites = next.sites;
        setSites(next.sites);
      }
      if (next.selectedId !== undefined) {
        cache.projects.selectedId = next.selectedId;
        setSelectedId(next.selectedId);
      }
    },
    []
  );

  const reload = useCallback(async () => {
    try {
      const data = await fetchProjectsOverview();
      persist({
        projects: data.projects,
        accounts: data.accounts,
        capabilities: data.capabilities,
        ingress: data.ingress ?? null,
        cloudflare: data.cloudflare ?? null,
      });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  const loadSites = useCallback(
    async (refresh = false) => {
      try {
        const data = await fetchSitesStatus({ refresh });
        persist({
          sites: data.sites,
          cloudflare: data.cloudflare,
        });
      } catch (e) {
        if (refresh) setError((e as Error).message);
      }
    },
    [persist]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void loadSites();
    const id = window.setInterval(() => void loadSites(), STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [loadSites, projects.length]);

  const loadDetail = useCallback(
    async (id: number) => {
      const project = await fetchProject(id);
      setDetail(project);
      persist({
        projects: cache.projects.projects.map((p) => (p.id === project.id ? project : p)),
      });
      try {
        setJob(await fetchProjectJob(id));
      } catch {
        setJob(null);
      }
    },
    [persist]
  );

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      setCheck(null);
      return;
    }
    void loadDetail(selectedId).catch((e) => setError((e as Error).message));
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!job?.running || selectedId == null) return;
    const id = setInterval(async () => {
      try {
        const next = await fetchProjectJob(selectedId);
        setJob(next);
        if (!next.running) void loadDetail(selectedId);
      } catch {
        // ignore transient poll errors
      }
    }, JOB_POLL_MS);
    return () => clearInterval(id);
  }, [job?.running, selectedId, loadDetail]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.log]);

  async function onCheck(): Promise<void> {
    if (selectedId == null) return;
    setBusy(true);
    setError(null);
    try {
      setCheck(await checkProjectRemoteApi(selectedId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRun(actionId: number): Promise<void> {
    if (selectedId == null) return;
    setBusy(true);
    setError(null);
    try {
      const next = await runProjectActionApi(selectedId, actionId);
      setJob(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteProject(): Promise<void> {
    if (selectedId == null) return;
    if (!window.confirm("Remove this project from SystemDash? Files on disk are not deleted.")) {
      return;
    }
    setBusy(true);
    try {
      await deleteProjectApi(selectedId);
      persist({
        selectedId: null,
        projects: projects.filter((p) => p.id !== selectedId),
      });
      setDetail(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAction(actionId: number): Promise<void> {
    if (selectedId == null) return;
    setBusy(true);
    try {
      await deleteProjectActionApi(selectedId, actionId);
      await loadDetail(selectedId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect(id: number): Promise<void> {
    setBusy(true);
    try {
      await disconnectGitAccountApi(id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnectCloudflare(): Promise<void> {
    setBusy(true);
    try {
      const next = await disconnectCloudflareApi();
      persist({ cloudflare: next.cloudflare });
      await loadSites(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = detail ?? projects.find((p) => p.id === selectedId) ?? null;
  const running = job?.running ?? false;
  const sitesById = useMemo(() => {
    const map = new Map<number, ProjectSiteStatus>();
    for (const s of sites) map.set(s.projectId, s);
    return map;
  }, [sites]);
  const selectedStatus = selected ? sitesById.get(selected.id) ?? null : null;

  return (
    <S.Root>
      {selectedId == null || !selected ? (
        <>
          <S.Head>
            <S.HeadLeft>
              <h2>Projects</h2>
              <span className="muted">
                {projects.length} project{projects.length === 1 ? "" : "s"}
              </span>
            </S.HeadLeft>
            {canManage && (
              <S.HeadActions>
                <S.Btn type="button" onClick={() => setConnectOpen(true)}>
                  Connect Git
                </S.Btn>
                {!cloudflare?.connected && (
                  <S.Btn type="button" onClick={() => setCfOpen(true)}>
                    Connect Cloudflare
                  </S.Btn>
                )}
                <S.Btn type="button" onClick={() => setAddOpen(true)}>
                  <Plus size={14} />
                  Add project
                </S.Btn>
              </S.HeadActions>
            )}
          </S.Head>

          {(accounts.length > 0 || cloudflare?.connected) && (
            <S.Accounts>
              {accounts.map((a) => (
                <S.AccountWrap key={a.id}>
                  <S.AccountChip type="button" onClick={() => setAccountOpen(a)}>
                    <strong>{a.provider}</strong>
                    <span>
                      {a.login} · …{a.tokenLast4}
                    </span>
                  </S.AccountChip>
                  {canManage && (
                    <S.ChipBtn
                      type="button"
                      title="Disconnect"
                      onClick={() => void onDisconnect(a.id)}
                      disabled={busy}
                    >
                      <Unplug size={13} />
                    </S.ChipBtn>
                  )}
                </S.AccountWrap>
              ))}
              {cloudflare?.connected && (
                <S.AccountWrap>
                  <S.AccountChip type="button" onClick={() => canManage && setCfOpen(true)}>
                    <strong>cloudflare</strong>
                    <span>
                      {cloudflare.email ?? (cloudflare.source === "env" ? "env" : "API token")}
                      {cloudflare.tokenLast4 ? ` · …${cloudflare.tokenLast4}` : ""}
                    </span>
                  </S.AccountChip>
                  {canManage && cloudflare.source !== "env" && (
                    <S.ChipBtn
                      type="button"
                      title="Disconnect"
                      onClick={() => void onDisconnectCloudflare()}
                      disabled={busy}
                    >
                      <Unplug size={13} />
                    </S.ChipBtn>
                  )}
                </S.AccountWrap>
              )}
            </S.Accounts>
          )}

          {capabilities && !capabilities.git && (
            <S.Banner $bad>
              Git is not on PATH on this host. Install Git to clone and pull projects.
            </S.Banner>
          )}
          {error && <AuthError $inline>{error}</AuthError>}

          {loading ? (
            <Loading>Loading projects…</Loading>
          ) : projects.length === 0 ? (
            <S.Empty>
              Link a repo on this machine, then define actions like pull, a command, or a restart.
              {canManage && (
                <>
                  {" "}
                  <strong>Connect Git</strong> with a personal access token so pulls never
                  prompt for a password.
                </>
              )}
            </S.Empty>
          ) : (
            <S.Grid>
              {projects.map((p) => {
                const status = sitesById.get(p.id);
                const ms = status?.public?.ms ?? status?.origin?.ms;
                const visits = status?.traffic?.visits24h;
                return (
                  <S.Card key={p.id} type="button" onClick={() => persist({ selectedId: p.id })}>
                    <S.CardTop>
                      <S.CardTitle>{p.name}</S.CardTitle>
                      {status ? (
                        <S.HealthPill
                          $state={status.overall}
                          title={healthDetail(status)}
                        >
                            <S.HealthDot $state={status.overall} />
                            {healthLabel(status.overall)}
                            {ms != null ? ` · ${ms}ms` : ""}
                          </S.HealthPill>
                      ) : (
                        (p.siteUrl || p.port || p.runKind !== "none") && (
                          <S.HealthPill $state="unknown">Checking…</S.HealthPill>
                        )
                      )}
                    </S.CardTop>
                    <S.CardMeta>
                      {p.localPath}
                      <S.BranchLine>
                        <GitBranch size={12} />
                        {p.branch}
                      </S.BranchLine>
                      {p.siteUrl && (
                        <S.SiteLink
                          href={p.siteUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={12} />
                          {p.siteUrl.replace(/^https?:\/\//, "")}
                        </S.SiteLink>
                      )}
                      {visits != null && (
                        <S.VisitLine>
                          {formatCompact(visits)} visit{visits === 1 ? "" : "s"} / 24h
                          {status?.traffic?.requests24h != null &&
                            ` · ${formatCompact(status.traffic.requests24h)} requests`}
                        </S.VisitLine>
                      )}
                      {p.lastRun && (
                        <S.RunPill $status={runStatus(p.lastRun, job)}>
                          {p.lastRun.actionName} {p.lastRun.status}
                        </S.RunPill>
                      )}
                    </S.CardMeta>
                  </S.Card>
                );
              })}
            </S.Grid>
          )}
        </>
      ) : (
        <S.Detail>
          <S.Back type="button" onClick={() => persist({ selectedId: null })}>
            <ArrowLeft size={14} />
            Projects
          </S.Back>
          <S.DetailPanel>
            <S.DetailHead>
              <S.DetailTitle>
                <h3>{selected.name}</h3>
                <S.StatusLine>
                  <code>{selected.localPath}</code>
                  <br />
                  {selected.remoteUrl} · {selected.branch}
                </S.StatusLine>
                {check && (
                  <S.StatusLine>
                    {check.ok ? (
                      <>
                        HEAD <code>{check.headSha ?? "—"}</code>
                        {check.behind > 0 && (
                          <>
                            {" "}
                            · <strong>{check.behind} behind</strong> origin
                          </>
                        )}
                        {check.ahead > 0 && <> · {check.ahead} ahead</>}
                        {check.behind === 0 && check.ahead === 0 && " · up to date"}
                        {check.dirty && " · uncommitted changes"}
                        {check.message && (
                          <>
                            <br />
                            {check.message}
                          </>
                        )}
                      </>
                    ) : (
                      check.message
                    )}
                  </S.StatusLine>
                )}
              </S.DetailTitle>
              {canManage && (
                <S.HeadActions>
                  <S.Btn type="button" onClick={() => void onCheck()} disabled={busy || running}>
                    <RefreshCw size={14} />
                    Check remote
                  </S.Btn>
                  <S.Btn
                    type="button"
                    $danger
                    onClick={() => void onDeleteProject()}
                    disabled={busy || running}
                  >
                    <Trash2 size={14} />
                    Remove
                  </S.Btn>
                </S.HeadActions>
              )}
            </S.DetailHead>

            {error && (
              <div style={{ padding: "0 16px 12px" }}>
                <AuthError $inline>{error}</AuthError>
              </div>
            )}

            {detail && (
              <>
                <S.SectionLabel>Site</S.SectionLabel>
                <SiteEditor
                  project={detail}
                  capabilities={
                    capabilities ?? {
                      platform: "",
                      git: true,
                      systemd: false,
                      compose: false,
                    }
                  }
                  ingress={ingress}
                  canManage={canManage}
                  disabled={busy || running}
                  onSaved={async () => {
                    if (selectedId != null) await loadDetail(selectedId);
                    await reload();
                    await loadSites(true);
                  }}
                />
              </>
            )}

            <S.SectionHead>
              <S.SectionLabel>Health</S.SectionLabel>
              <S.Btn
                type="button"
                onClick={() => void loadSites(true)}
                disabled={busy}
              >
                <RefreshCw size={14} />
                Recheck
              </S.Btn>
            </S.SectionHead>
            <S.HealthPanel>
              <S.HealthCell>
                <span className="label">Public</span>
                <span className="value">
                  <S.HealthDot $state={probeDot(selectedStatus?.public?.state)} />
                  {selectedStatus?.public
                    ? healthLabel(
                        selectedStatus.public.state === "skipped"
                          ? "unknown"
                          : selectedStatus.public.state
                      )
                    : selected?.siteUrl
                      ? "Checking…"
                      : "No URL"}
                </span>
                <span className="meta">
                  {selectedStatus?.public
                    ? probeSummary(selectedStatus.public)
                    : selected?.siteUrl || "Set a public URL to probe the live site."}
                </span>
              </S.HealthCell>
              <S.HealthCell>
                <span className="label">Origin</span>
                <span className="value">
                  <S.HealthDot $state={probeDot(selectedStatus?.origin?.state)} />
                  {selectedStatus?.origin
                    ? healthLabel(
                        selectedStatus.origin.state === "skipped"
                          ? "unknown"
                          : selectedStatus.origin.state
                      )
                    : selected?.port
                      ? "Checking…"
                      : "No port"}
                </span>
                <span className="meta">
                  {selectedStatus?.origin
                    ? probeSummary(selectedStatus.origin)
                    : selected?.port
                      ? `127.0.0.1:${selected.port}`
                      : "Set a port to check the local process."}
                </span>
              </S.HealthCell>
              <S.HealthCell>
                <span className="label">Runtime</span>
                <span className="value">
                  <S.HealthDot
                    $state={
                      selectedStatus?.runtime.state === "running"
                        ? "up"
                        : selectedStatus?.runtime.state === "stopped" ||
                            selectedStatus?.runtime.state === "missing"
                          ? "down"
                          : "unknown"
                    }
                  />
                  {selectedStatus
                    ? selectedStatus.runtime.state === "skipped"
                      ? selectedStatus.runtime.kind
                      : selectedStatus.runtime.state
                    : "—"}
                </span>
                <span className="meta">
                  {selectedStatus?.runtime.detail ||
                    (selected?.runKind === "none"
                      ? "No runtime configured."
                      : selected?.runKind ?? "")}
                </span>
              </S.HealthCell>
              <S.HealthCell>
                <span className="label">Visits · 24h</span>
                <span className="value">
                  {selectedStatus?.traffic?.visits24h != null
                    ? formatCompact(selectedStatus.traffic.visits24h)
                    : cloudflare?.connected
                      ? "—"
                      : "Not connected"}
                </span>
                <span className="meta">
                  {selectedStatus?.traffic?.visits24h != null
                    ? `${formatCompact(selectedStatus.traffic.requests24h ?? 0)} requests${
                        selectedStatus.traffic.bytes24h
                          ? ` · ${formatBytes(selectedStatus.traffic.bytes24h)}`
                          : ""
                      }`
                    : selectedStatus?.traffic?.error
                      ? selectedStatus.traffic.error
                      : cloudflare?.connected
                        ? "No analytics for this hostname yet."
                        : "Connect Cloudflare (Zone Analytics) to see visits."}
                </span>
              </S.HealthCell>
            </S.HealthPanel>

            <S.SectionLabel>Actions</S.SectionLabel>
            {detail && detail.actions.length === 0 && (
              <S.StatusLine style={{ padding: "4px 16px 8px" }}>
                No actions yet. Add one to pull and ensure the site is running.
              </S.StatusLine>
            )}
            {detail?.actions.map((action) => (
              <S.ActionCard key={action.id}>
                <S.ActionTop>
                  <S.ActionName>{action.name}</S.ActionName>
                  {canManage && (
                    <S.ActionBtns>
                      <S.Btn
                        type="button"
                        onClick={() => void onRun(action.id)}
                        disabled={busy || running || action.steps.length === 0}
                      >
                        <Play size={14} />
                        Run
                      </S.Btn>
                      <S.Btn
                        type="button"
                        onClick={() => setActionEdit(action)}
                        disabled={busy || running}
                      >
                        Edit
                      </S.Btn>
                      <S.ChipBtn
                        type="button"
                        title="Delete action"
                        onClick={() => void onDeleteAction(action.id)}
                        disabled={busy || running}
                      >
                        <Trash2 size={14} />
                      </S.ChipBtn>
                    </S.ActionBtns>
                  )}
                </S.ActionTop>
                <S.Steps>
                  {action.steps.map((s) => (
                    <li key={s.id}>
                      <code>{stepSummary(s)}</code>
                    </li>
                  ))}
                </S.Steps>
              </S.ActionCard>
            ))}
            {canManage && (
              <div style={{ padding: "0 16px 16px" }}>
                <S.Btn
                  type="button"
                  onClick={() => setActionEdit("new")}
                  disabled={busy || running}
                >
                  <Plus size={14} />
                  New action
                </S.Btn>
              </div>
            )}

            {(job?.running || job?.log || job?.error) && (
              <>
                {(job.running || job.phase === "done" || job.phase === "error") && (
                  <S.ProgressWrap>
                    <S.ProgressLabel>
                      <span>
                        {job.running
                          ? `${job.stepLabel || job.actionName}…`
                          : job.phase === "error"
                            ? "Failed"
                            : "Finished"}
                      </span>
                      <span>{job.progress}%</span>
                    </S.ProgressLabel>
                    <S.ProgressTrack>
                      <S.ProgressFill $value={job.progress} />
                    </S.ProgressTrack>
                  </S.ProgressWrap>
                )}
                {job.log && <S.LogPanel ref={logRef}>{job.log}</S.LogPanel>}
              </>
            )}
            {selected.lastRun && !job?.log && (
              <S.StatusLine style={{ padding: "0 16px 16px" }}>
                Last run: {selected.lastRun.actionName} ({selected.lastRun.status}){" "}
                {formatRelative(selected.lastRun.startedAt, Date.now())}
              </S.StatusLine>
            )}
          </S.DetailPanel>
        </S.Detail>
      )}

      {connectOpen && (
        <ConnectGitModal
          onClose={() => setConnectOpen(false)}
          onSaved={async () => {
            setConnectOpen(false);
            await reload();
          }}
        />
      )}
      {cfOpen && (
        <ConnectCloudflareModal
          connected={cloudflare}
          onClose={() => setCfOpen(false)}
          onSaved={async () => {
            setCfOpen(false);
            await reload();
            await loadSites(true);
          }}
        />
      )}
      {accountOpen && (
        <GitAccountModal
          account={accountOpen}
          canManage={canManage}
          onClose={() => setAccountOpen(null)}
          onDisconnect={async () => {
            await onDisconnect(accountOpen.id);
            setAccountOpen(null);
          }}
          onOpenProject={(id) => {
            setAccountOpen(null);
            persist({ selectedId: id });
          }}
        />
      )}
      {addOpen && (
        <AddProjectModal
          accounts={accounts}
          capabilities={capabilities}
          ingress={ingress}
          onClose={() => setAddOpen(false)}
          onCreated={async (id) => {
            setAddOpen(false);
            await reload();
            await loadSites(true);
            persist({ selectedId: id });
          }}
        />
      )}
      {actionEdit && selectedId != null && (
        <ActionEditorModal
          existing={actionEdit === "new" ? null : actionEdit}
          capabilities={
            capabilities ?? { platform: "", git: true, systemd: false, compose: false }
          }
          projectPath={selected?.localPath ?? ""}
          onClose={() => setActionEdit(null)}
          onSave={async (name, steps) => {
            if (actionEdit === "new") {
              await createProjectActionApi(selectedId, name, steps);
            } else {
              await updateProjectActionApi(selectedId, actionEdit.id, { name, steps });
            }
            setActionEdit(null);
            await loadDetail(selectedId);
          }}
        />
      )}
    </S.Root>
  );
}

function row(label: string, value: ReactNode) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function runKindOptions(capabilities: ProjectsCapabilities): { value: RunKind; label: string }[] {
  const opts: { value: RunKind; label: string }[] = [
    { value: "none", label: "Not set yet" },
    { value: "docker", label: "Docker container" },
    { value: "compose", label: "Docker Compose" },
    { value: "static", label: "Static files" },
  ];
  if (capabilities.systemd) {
    opts.splice(3, 0, { value: "systemd", label: "systemd service" });
  }
  return opts;
}

type RunProfileDraft = {
  siteUrl: string;
  runKind: RunKind;
  port: string;
  boot: boolean;
  container: string;
  composeFile: string;
  unit: string;
  publishFrom: string;
  publishTo: string;
  startCommand: string;
};

function draftFromProject(p: ProjectSummary): RunProfileDraft {
  return {
    siteUrl: p.siteUrl ?? "",
    runKind: p.runKind ?? "none",
    port: p.port != null ? String(p.port) : "",
    boot: !!p.boot,
    container: p.container ?? "",
    composeFile: p.composeFile || "compose.yaml",
    unit: p.unit ?? "",
    publishFrom: p.publishFrom || "dist",
    publishTo: p.publishTo ?? "",
    startCommand: p.startCommand ?? "",
  };
}

function profilePayload(d: RunProfileDraft) {
  return {
    siteUrl: d.siteUrl.trim() || null,
    runKind: d.runKind,
    port: d.port.trim() ? Number(d.port) : null,
    boot: d.boot,
    container: d.container.trim() || null,
    composeFile: d.composeFile.trim() || null,
    unit: d.unit.trim() || null,
    publishFrom: d.publishFrom.trim() || null,
    publishTo: d.publishTo.trim() || null,
    startCommand: d.startCommand.trim() || null,
  };
}

function joinProjectRel(root: string, rel: string, fallback = "compose.yaml"): string {
  const file = rel.trim() || fallback;
  if (!root.trim()) return file;
  const sep = /\\/.test(root) && !root.startsWith("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${file.replace(/^[\\/]+/, "")}`;
}

function destExample(platform: string): string {
  return platform === "win32" ? "C:\\www\\my-app" : "/var/www/my-app";
}

function hostnameFromSiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const host = (/^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`)
    ).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function pendingCloudflaredChange(
  ingress: IngressDiscovery | null,
  siteUrl: string,
  port: string
): {
  hostname: string;
  port: number;
  kind: "add" | "update";
  previousPort: number | null;
} | null {
  const hostname = hostnameFromSiteUrl(siteUrl);
  const n = Number(port.trim());
  if (!hostname || !Number.isInteger(n) || n < 1 || n > 65535) return null;
  if (!ingress) return null;
  if (ingress.remotelyManaged && ingress.sources.length === 0) return null;
  const existing = ingress.routes.find((r) => r.hostname.toLowerCase() === hostname);
  if (!existing) return { hostname, port: n, kind: "add", previousPort: null };
  if (existing.port === n) return null;
  return { hostname, port: n, kind: "update", previousPort: existing.port };
}

function serviceHint(service: string): string {
  return service.replace(/^https?:\/\//i, "");
}

function sortedIngress(routes: IngressRoute[], port: string): IngressRoute[] {
  const n = Number(port);
  const want = Number.isFinite(n) && n > 0 ? n : null;
  return [...routes].sort((a, b) => {
    const am = want != null && a.port === want;
    const bm = want != null && b.port === want;
    if (am !== bm) return am ? -1 : 1;
    return a.hostname.localeCompare(b.hostname);
  });
}

function HostPathField({
  label,
  value,
  onChange,
  platform,
}: {
  label: string;
  value: string;
  onChange: (path: string) => void;
  platform: string;
}) {
  const [browse, setBrowse] = useState(false);
  const example = destExample(platform);
  const dest = value.trim();
  return (
    <>
      <S.Field>
        {label}
        <S.PathRow>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={example}
          />
          <S.Btn type="button" onClick={() => setBrowse(true)}>
            Browse
          </S.Btn>
        </S.PathRow>
        <S.FieldHint>
          {dest ? (
            <>
              Copies to <code>{dest}</code> on this machine. Absolute path — not a
              folder inside the project.
            </>
          ) : (
            <>
              Where files land after publish, e.g. <code>{example}</code>. Absolute
              path on this host, not inside the project.
            </>
          )}
        </S.FieldHint>
      </S.Field>
      {browse && (
        <FolderPicker
          initialPath={dest || example}
          onClose={() => setBrowse(false)}
          onPick={(next) => {
            onChange(next);
            setBrowse(false);
          }}
        />
      )}
    </>
  );
}

function RunProfileFields({
  draft,
  onChange,
  capabilities,
  projectPath,
  ingress,
  addCloudflared,
  onAddCloudflared,
  dnsMessage,
}: {
  draft: RunProfileDraft;
  onChange: (patch: Partial<RunProfileDraft>) => void;
  capabilities: ProjectsCapabilities;
  projectPath: string;
  ingress: IngressDiscovery | null;
  addCloudflared?: boolean;
  onAddCloudflared?: (next: boolean) => void;
  dnsMessage?: string | null;
}) {
  const pendingIngress = pendingCloudflaredChange(ingress, draft.siteUrl, draft.port);
  const hostForUrl = hostnameFromSiteUrl(draft.siteUrl);
  const existingForHost = hostForUrl
    ? ingress?.routes.find((r) => r.hostname.toLowerCase() === hostForUrl)
    : undefined;
  const needPortForIngress = !!(
    onAddCloudflared &&
    hostForUrl &&
    !pendingIngress &&
    !draft.port.trim() &&
    !(ingress?.remotelyManaged && ingress.sources.length === 0)
  );
  const liveMatch =
    existingForHost &&
    draft.port.trim() !== "" &&
    existingForHost.port === Number(draft.port);
  return (
    <>
      <S.Field>
        Site URL
        <input
          value={draft.siteUrl}
          onChange={(e) => onChange({ siteUrl: e.target.value })}
          placeholder="https://app.example.com"
        />
        {ingress && ingress.routes.length > 0 ? (
          <S.FieldHint>
            Click a hostname to fill URL and port, or type a new one. Save writes
            it to the local cloudflared config — no file editing.
          </S.FieldHint>
        ) : (
          <S.FieldHint>
            {ingress?.note ??
              "Public https:// URL. With a port, Save can add it to the local cloudflared tunnel."}
          </S.FieldHint>
        )}
      </S.Field>
      {ingress && ingress.routes.length > 0 && (
        <S.RepoList>
          {sortedIngress(ingress.routes, draft.port).map((r) => {
            const matchesPort =
              draft.port.trim() !== "" && r.port === Number(draft.port);
            return (
              <S.RepoRow
                key={r.url}
                type="button"
                $active={draft.siteUrl.replace(/\/+$/, "") === r.url}
                onClick={() =>
                  onChange({
                    siteUrl: r.url,
                    ...(r.port != null ? { port: String(r.port) } : {}),
                  })
                }
              >
                {r.hostname}
                <span>
                  {serviceHint(r.service)}
                  {matchesPort ? " · matches port" : ""}
                </span>
              </S.RepoRow>
            );
          })}
        </S.RepoList>
      )}
      <S.Field>
        How it runs
        <Dropdown
          value={draft.runKind}
          options={runKindOptions(capabilities)}
          onChange={(runKind) => {
            const next = runKind as RunKind;
            onChange({
              runKind: next,
              ...(next === "compose" && !draft.composeFile.trim()
                ? { composeFile: "compose.yaml" }
                : {}),
              ...(next === "static" && !draft.publishFrom.trim()
                ? { publishFrom: "dist" }
                : {}),
            });
          }}
          variant="underline"
        />
      </S.Field>
      <S.Field>
        Port
        <input
          value={draft.port}
          onChange={(e) => onChange({ port: e.target.value })}
          placeholder="optional"
          inputMode="numeric"
        />
      </S.Field>
      {onAddCloudflared && pendingIngress && (
        <S.CheckRow>
          <input
            type="checkbox"
            checked={!!addCloudflared}
            onChange={(e) => onAddCloudflared(e.target.checked)}
          />
          <S.Switch $on={!!addCloudflared}>
            <S.SwitchKnob $on={!!addCloudflared} />
          </S.Switch>
          {pendingIngress.kind === "update"
            ? `Update cloudflared: ${pendingIngress.hostname} → 127.0.0.1:${pendingIngress.port}${
                pendingIngress.previousPort != null
                  ? ` (now ${pendingIngress.previousPort})`
                  : ""
              }`
            : `Add ${pendingIngress.hostname} to cloudflared → 127.0.0.1:${pendingIngress.port}`}
        </S.CheckRow>
      )}
      {liveMatch && existingForHost && (
        <S.FieldHint>
          Already in cloudflared → {serviceHint(existingForHost.service)}
        </S.FieldHint>
      )}
      {needPortForIngress && (
        <S.FieldHint>
          {existingForHost
            ? `Set a port to update cloudflared for ${hostForUrl} (now ${serviceHint(existingForHost.service)}).`
            : "Set a port to add this hostname to the local cloudflared config."}
        </S.FieldHint>
      )}
      <TunnelDnsHint
        target={ingress?.dnsTarget}
        hostname={hostForUrl}
        dnsMessage={dnsMessage}
      />
      {draft.runKind !== "none" && (
        <S.CheckRow>
          <input
            type="checkbox"
            checked={draft.boot}
            onChange={(e) => onChange({ boot: e.target.checked })}
          />
          <S.Switch $on={draft.boot}>
            <S.SwitchKnob $on={draft.boot} />
          </S.Switch>
          Start when this machine boots
        </S.CheckRow>
      )}
      {draft.runKind === "docker" && (
        <S.Field>
          Container name
          <input
            value={draft.container}
            onChange={(e) => onChange({ container: e.target.value })}
            placeholder="my-app"
          />
        </S.Field>
      )}
      {draft.runKind === "compose" && (
        <S.Field>
          Compose file in the project folder
          <input
            value={draft.composeFile}
            onChange={(e) => onChange({ composeFile: e.target.value })}
            placeholder="compose.yaml"
          />
          <S.FieldHint>
            Looks for <code>{joinProjectRel(projectPath, draft.composeFile)}</code>
            . Type a path under this project, e.g. <code>compose.yaml</code> or{" "}
            <code>deploy/compose.yaml</code>.
          </S.FieldHint>
        </S.Field>
      )}
      {draft.runKind === "systemd" && (
        <>
          <S.Field>
            Unit
            <input
              value={draft.unit}
              onChange={(e) => onChange({ unit: e.target.value })}
              placeholder="my-app.service"
            />
          </S.Field>
          <S.Field>
            Start command
            <input
              value={draft.startCommand}
              onChange={(e) => onChange({ startCommand: e.target.value })}
              placeholder="/usr/bin/node server.js"
            />
          </S.Field>
        </>
      )}
      {draft.runKind === "static" && (
        <>
          <S.Field>
            Publish from (folder in this project)
            <input
              value={draft.publishFrom}
              onChange={(e) => onChange({ publishFrom: e.target.value })}
              placeholder="dist"
            />
            <S.FieldHint>
              Copies <code>{joinProjectRel(projectPath, draft.publishFrom, "dist")}</code>
              . Type a folder under this project, e.g. <code>dist</code> or{" "}
              <code>build</code>.
            </S.FieldHint>
          </S.Field>
          <HostPathField
            label="Publish to (on this machine)"
            value={draft.publishTo}
            platform={capabilities.platform}
            onChange={(publishTo) => onChange({ publishTo })}
          />
        </>
      )}
    </>
  );
}

function SiteEditor({
  project,
  capabilities,
  ingress,
  canManage,
  disabled,
  onSaved,
}: {
  project: ProjectDetail;
  capabilities: ProjectsCapabilities;
  ingress: IngressDiscovery | null;
  canManage: boolean;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => draftFromProject(project));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addCloudflared, setAddCloudflared] = useState(true);
  const [dnsMessage, setDnsMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromProject(project));
  }, [project]);

  if (!canManage) {
    return (
      <S.StatusLine style={{ padding: "8px 16px 12px" }}>
        {project.siteUrl ? (
          <S.SiteLink href={project.siteUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={12} />
            {project.siteUrl}
          </S.SiteLink>
        ) : (
          "No public URL set."
        )}
        {project.runKind !== "none" && (
          <>
            {" "}
            · {project.runKind}
            {project.boot ? " · starts on boot" : ""}
          </>
        )}
      </S.StatusLine>
    );
  }

  return (
    <S.SiteForm
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void (async () => {
          try {
            await updateProjectApi(project.id, profilePayload(draft));
            const pending = pendingCloudflaredChange(ingress, draft.siteUrl, draft.port);
            if (addCloudflared && pending) {
              const result = await addCloudflaredIngressApi(pending);
              setDnsMessage(result.dns);
            }
            await onSaved();
          } catch (err) {
            setError((err as Error).message);
            void onSaved();
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <RunProfileFields
        draft={draft}
        capabilities={capabilities}
        projectPath={project.localPath}
        ingress={ingress}
        addCloudflared={addCloudflared}
        onAddCloudflared={setAddCloudflared}
        dnsMessage={dnsMessage}
        onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
      />
      {error && <AuthError $inline>{error}</AuthError>}
      <div>
        <S.Btn type="submit" disabled={disabled || busy}>
          {busy ? "Saving…" : "Save site"}
        </S.Btn>
      </div>
    </S.SiteForm>
  );
}

function GitAccountModal({
  account,
  canManage,
  onClose,
  onDisconnect,
  onOpenProject,
}: {
  account: GitAccountPublic;
  canManage: boolean;
  onClose: () => void;
  onDisconnect: () => Promise<void>;
  onOpenProject: (id: number) => void;
}) {
  const [details, setDetails] = useState<GitAccountDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      return fetchGitAccountDetails(account.id, { refresh })
        .then((next) => {
          setDetails(next);
          setError(null);
        })
        .catch((e) => setError((e as Error).message))
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [account.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const profile = details?.profile;
  const displayName = profile?.name || profile?.login || account.login;

  return (
    <ModalOverlay onClick={onClose}>
      <S.WideModal onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>Git connection</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </ModalClose>
        </ModalHead>
        {loading ? (
          <ModalSub>Loading account from {account.provider}…</ModalSub>
        ) : (
          <>
            <S.ProfileHead>
              {profile?.avatarUrl && <img src={profile.avatarUrl} alt="" />}
              <S.ProfileName>
                <strong>{displayName}</strong>
                {profile?.htmlUrl ? (
                  <a href={profile.htmlUrl} target="_blank" rel="noreferrer">
                    {profile.htmlUrl}
                  </a>
                ) : (
                  <span>
                    {account.provider} · {account.login}
                  </span>
                )}
              </S.ProfileName>
            </S.ProfileHead>
            {profile?.bio && <ModalSub>{profile.bio}</ModalSub>}
            {(error || details?.error) && (
              <AuthError>{error || details?.error}</AuthError>
            )}
            <RevokeDetails>
              {row("Provider", account.provider)}
              {row("Host", account.host)}
              {row("Login", profile?.login || account.login)}
              {row("Email", profile?.email)}
              {row("Company", profile?.company)}
              {row("Location", profile?.location)}
              {row(
                "Public repos",
                profile?.publicRepos !== null && profile?.publicRepos !== undefined
                  ? String(profile.publicRepos)
                  : null
              )}
              {row(
                "Private repos",
                profile?.privateRepos !== null && profile?.privateRepos !== undefined
                  ? String(profile.privateRepos)
                  : null
              )}
              {row(
                "Git account created",
                profile?.accountCreatedAt
                  ? formatDate(Date.parse(profile.accountCreatedAt))
                  : null
              )}
              {row("Connected here", formatDate(account.createdAt))}
              {row("Token", `${details?.tokenKind ?? "Token"} · …${account.tokenLast4}`)}
              {row(
                "Expires",
                details?.expiresAt ? formatDate(Date.parse(details.expiresAt)) : null
              )}
              {row(
                "API rate limit",
                details?.rateLimit
                  ? `${details.rateLimit.remaining} / ${details.rateLimit.limit} left`
                  : null
              )}
              {row(
                "Fetched",
                details?.cachedAt ? formatRelative(details.cachedAt, now) : null
              )}
            </RevokeDetails>
            {details && details.scopes.length > 0 && (
              <>
                <ModalSub>Token scopes</ModalSub>
                <S.ScopeList>
                  {details.scopes.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </S.ScopeList>
              </>
            )}
            {details && details.projects.length > 0 && (
              <>
                <ModalSub>
                  Used by {details.projects.length} project
                  {details.projects.length === 1 ? "" : "s"}
                </ModalSub>
                <S.RepoList>
                  {details.projects.map((p) => (
                    <S.RepoRow key={p.id} type="button" onClick={() => onOpenProject(p.id)}>
                      {p.name}
                      <span>{p.localPath}</span>
                    </S.RepoRow>
                  ))}
                </S.RepoList>
              </>
            )}
            <ModalActions>
              <ModalBtn
                type="button"
                disabled={refreshing}
                onClick={() => void load(true)}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </ModalBtn>
              <ModalBtn type="button" onClick={onClose}>
                Close
              </ModalBtn>
              {canManage && (
                <ModalBtn
                  type="button"
                  $variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void onDisconnect().finally(() => setBusy(false));
                  }}
                >
                  Disconnect
                </ModalBtn>
              )}
            </ModalActions>
          </>
        )}
      </S.WideModal>
    </ModalOverlay>
  );
}

function ConnectGitModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<GitProvider>("github");
  const [token, setToken] = useState("");
  const [host, setHost] = useState("gitlab.com");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connectGitAccountApi({
        provider,
        token,
        host: provider === "gitlab" ? host : undefined,
      });
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>Connect Git</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </ModalClose>
        </ModalHead>
        <ModalSub>
          Paste a personal access token with repo read access. SystemDash stores it on
          this machine and uses it for clone/pull so git never prompts in the terminal.
        </ModalSub>
        <form onSubmit={(e) => void submit(e)}>
          <S.FormStack>
            <S.Field>
              Provider
              <Dropdown
                value={provider}
                options={[
                  { value: "github", label: "GitHub" },
                  { value: "gitlab", label: "GitLab" },
                ]}
                onChange={setProvider}
                variant="underline"
              />
            </S.Field>
            {provider === "gitlab" && (
              <S.Field>
                Host
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="gitlab.com"
                  autoComplete="off"
                />
              </S.Field>
            )}
            <S.Field>
              Token
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={provider === "github" ? "ghp_…" : "glpat-…"}
                autoComplete="off"
                autoFocus
              />
            </S.Field>
            {error && <AuthError>{error}</AuthError>}
            <ModalActions>
              <ModalBtn type="button" onClick={onClose}>
                Cancel
              </ModalBtn>
              <ModalBtn type="submit" $variant="primary" disabled={busy || !token.trim()}>
                {busy ? "Connecting…" : "Connect"}
              </ModalBtn>
            </ModalActions>
          </S.FormStack>
        </form>
      </ModalCard>
    </ModalOverlay>
  );
}

function ConnectCloudflareModal({
  connected,
  onClose,
  onSaved,
}: {
  connected: CloudflareAccountPublic | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connectCloudflareApi(token);
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClick={onClose}>
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>{connected?.connected ? "Cloudflare" : "Connect Cloudflare"}</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </ModalClose>
        </ModalHead>
        <ModalSub>
          Paste an API token with Zone · Zone · Read and Zone · Analytics · Read.
          SystemDash uses it to show visits and requests for the last 24 hours on each
          public hostname. Create one at dash.cloudflare.com/profile/api-tokens.
          {connected?.source === "env" &&
            " This host already has CLOUDFLARE_API_TOKEN set — connecting here stores a token instead."}
        </ModalSub>
        <form onSubmit={(e) => void submit(e)}>
          <S.FormStack>
            <S.Field>
              API token
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cloudflare API token"
                autoComplete="off"
                autoFocus
              />
            </S.Field>
            {error && <AuthError>{error}</AuthError>}
            <ModalActions>
              <ModalBtn type="button" onClick={onClose}>
                Cancel
              </ModalBtn>
              <ModalBtn type="submit" $variant="primary" disabled={busy || !token.trim()}>
                {busy ? "Connecting…" : connected?.connected ? "Replace token" : "Connect"}
              </ModalBtn>
            </ModalActions>
          </S.FormStack>
        </form>
      </ModalCard>
    </ModalOverlay>
  );
}

function AddProjectModal({
  accounts,
  capabilities,
  ingress,
  onClose,
  onCreated,
}: {
  accounts: GitAccountPublic[];
  capabilities: ProjectsCapabilities | null;
  ingress: IngressDiscovery | null;
  onClose: () => void;
  onCreated: (id: number) => Promise<void>;
}) {
  const defaultPath =
    capabilities?.platform === "win32" ? "C:\\Projects\\my-app" : "/opt/my-app";
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState(defaultPath);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [provider, setProvider] = useState<GitProvider>(
    accounts.find((a) => a.provider === "github")
      ? "github"
      : accounts[0]?.provider ?? "github"
  );
  const [repos, setRepos] = useState<GitRepoInfo[]>([]);
  const [repoQuery, setRepoQuery] = useState("");
  const [reposLoading, setReposLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [addCloudflared, setAddCloudflared] = useState(true);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [runDraft, setRunDraft] = useState<RunProfileDraft>({
    siteUrl: "",
    runKind: "none",
    port: "",
    boot: false,
    container: "",
    composeFile: "compose.yaml",
    unit: "",
    publishFrom: "dist",
    publishTo: "",
    startCommand: "",
  });
  const connected = accounts.filter((a) => a.provider === provider);

  useEffect(() => {
    if (connected.length === 0) {
      setRepos([]);
      return;
    }
    let cancelled = false;
    setReposLoading(true);
    void fetchGitRepos(provider)
      .then((list) => {
        if (!cancelled) setRepos(list);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setReposLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, connected.length]);

  useEffect(() => {
    const url = remoteUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      setBranches([]);
      setBranchesError(null);
      setBranchesLoading(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setBranchesLoading(true);
      setBranchesError(null);
      void fetchGitBranches(url, ctrl.signal)
        .then((result) => {
          if (cancelled) return;
          setBranches(result.branches);
          setBranch((current) => {
            if (current && result.branches.includes(current)) return current;
            return result.defaultBranch || result.branches[0] || current || "main";
          });
        })
        .catch((e) => {
          if (cancelled || (e as Error).name === "AbortError") return;
          setBranches([]);
          setBranchesError((e as Error).message);
        })
        .finally(() => {
          if (!cancelled) setBranchesLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [remoteUrl]);

  const filtered = useMemo(() => {
    const q = repoQuery.trim().toLowerCase();
    if (!q) return repos.slice(0, 40);
    return repos.filter((r) => r.fullName.toLowerCase().includes(q)).slice(0, 40);
  }, [repos, repoQuery]);

  function pickRepo(repo: GitRepoInfo): void {
    setRemoteUrl(repo.url);
    setBranch(repo.defaultBranch || "main");
    if (!name.trim()) setName(repo.name);
    if (localPath === defaultPath || localPath.endsWith("my-app")) {
      const base = capabilities?.platform === "win32" ? "C:\\Projects\\" : "/opt/";
      setLocalPath(`${base}${repo.name}`);
    }
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project } = await createProjectApi({
        name,
        localPath,
        remoteUrl,
        branch,
        ...profilePayload(runDraft),
      });
      const pending = pendingCloudflaredChange(ingress, runDraft.siteUrl, runDraft.port);
      if (addCloudflared && pending) {
        await addCloudflaredIngressApi(pending);
      }
      await onCreated(project.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const providerAccounts = accounts.length > 0;

  return (
    <ModalOverlay onClick={onClose}>
      <S.WideModal onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>Add project</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </ModalClose>
        </ModalHead>
        <ModalSub>
          Clone into the folder if it is empty, or attach an existing checkout of the
          same remote.
        </ModalSub>
        <form onSubmit={(e) => void submit(e)}>
          <S.FormStack>
            {providerAccounts && (
              <>
                <S.Field>
                  Pick from connected account
                  <Dropdown
                    value={provider}
                    options={accounts.map((a) => ({
                      value: a.provider,
                      label: `${a.provider} (${a.login})`,
                    }))}
                    onChange={setProvider}
                    variant="underline"
                  />
                </S.Field>
                {connected.length > 0 && (
                  <>
                    <S.PathRow>
                      <S.RepoSearch
                        value={repoQuery}
                        onChange={(e) => setRepoQuery(e.target.value)}
                        placeholder={reposLoading ? "Loading repos…" : "Search repos"}
                      />
                      <S.IconBtn
                        type="button"
                        title="Refresh repo list from the git host"
                        aria-label="Refresh repo list"
                        disabled={reposLoading}
                        onClick={() => {
                          setReposLoading(true);
                          void fetchGitRepos(provider, { refresh: true })
                            .then((list) => {
                              setRepos(list);
                              setError(null);
                            })
                            .catch((e) => setError((e as Error).message))
                            .finally(() => setReposLoading(false));
                        }}
                      >
                        <RefreshCw size={14} />
                      </S.IconBtn>
                    </S.PathRow>
                    {filtered.length > 0 && (
                      <S.RepoList>
                        {filtered.map((r) => (
                          <S.RepoRow
                            key={r.fullName}
                            type="button"
                            $active={remoteUrl === r.url}
                            onClick={() => pickRepo(r)}
                          >
                            {r.fullName}
                            <span>
                              {r.defaultBranch}
                              {r.private ? " · private" : ""}
                            </span>
                          </S.RepoRow>
                        ))}
                      </S.RepoList>
                    )}
                  </>
                )}
              </>
            )}
            <S.Field>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </S.Field>
            <S.Field>
              Repo URL
              <input
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://github.com/you/app.git"
                required
              />
            </S.Field>
            <S.Field>
              Local folder
              <S.PathRow>
                <input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder={defaultPath}
                  required
                />
                <S.Btn type="button" onClick={() => setBrowseOpen(true)}>
                  Browse
                </S.Btn>
              </S.PathRow>
            </S.Field>
            <S.Field>
              Branch
              {branches.length > 0 ? (
                <Dropdown
                  value={branch}
                  options={branches.map((b) => ({ value: b, label: b }))}
                  onChange={setBranch}
                  variant="underline"
                  ariaLabel="Branch"
                />
              ) : (
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder={branchesLoading ? "Loading branches…" : "main"}
                  required
                />
              )}
            </S.Field>
            <RunProfileFields
              draft={runDraft}
              capabilities={
                capabilities ?? {
                  platform: "",
                  git: true,
                  systemd: false,
                  compose: false,
                }
              }
              projectPath={localPath}
              ingress={ingress}
              addCloudflared={addCloudflared}
              onAddCloudflared={setAddCloudflared}
              onChange={(patch) => setRunDraft((prev) => ({ ...prev, ...patch }))}
            />
            {branchesLoading && branches.length === 0 && (
              <S.StatusLine>Reading branches from the remote…</S.StatusLine>
            )}
            {branchesError && !branchesLoading && (
              <S.StatusLine>Could not list branches — type one, or check the URL / Git token. {branchesError}</S.StatusLine>
            )}
            {error && <AuthError>{error}</AuthError>}
            <ModalActions>
              <ModalBtn type="button" onClick={onClose}>
                Cancel
              </ModalBtn>
              <ModalBtn type="submit" $variant="primary" disabled={busy}>
                {busy ? "Adding…" : "Add"}
              </ModalBtn>
            </ModalActions>
          </S.FormStack>
        </form>
        {browseOpen && (
          <FolderPicker
            initialPath={localPath}
            onClose={() => setBrowseOpen(false)}
            onPick={(next) => {
              setLocalPath(next);
              setBrowseOpen(false);
            }}
          />
        )}
      </S.WideModal>
    </ModalOverlay>
  );
}

function ActionEditorModal({
  existing,
  capabilities,
  projectPath,
  onClose,
  onSave,
}: {
  existing: ProjectAction | null;
  capabilities: ProjectsCapabilities;
  projectPath: string;
  onClose: () => void;
  onSave: (name: string, steps: StepInput[]) => Promise<void>;
}) {
  const [name, setName] = useState(existing?.name ?? "Pull");
  const [steps, setSteps] = useState<StepInput[]>(
    existing?.steps.map((s) => ({
      type: s.type,
      command: s.command,
      container: s.container,
      unit: s.unit,
      source: s.source,
      dest: s.dest,
    })) ?? [{ type: "git_pull" }]
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const typeOptions = useMemo(() => {
    const opts: { value: ActionStepType; label: string }[] = [
      { value: "git_pull", label: "Git pull" },
      { value: "command", label: "Command" },
      { value: "docker_ensure", label: "Ensure Docker container" },
      { value: "docker_restart", label: "Restart Docker container" },
      { value: "compose_up", label: "Compose up" },
      { value: "publish", label: "Publish folder" },
    ];
    if (capabilities.systemd) {
      opts.push(
        { value: "systemd_enable", label: "Enable systemd unit" },
        { value: "systemd_apply", label: "Install systemd unit" },
        { value: "systemd_restart", label: "Restart systemd unit" }
      );
    }
    return opts;
  }, [capabilities.compose, capabilities.systemd]);

  function updateStep(i: number, patch: Partial<StepInput>): void {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function move(i: number, dir: -1 | 1): void {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(name, steps);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClick={onClose}>
      <S.WideModal onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>{existing ? "Edit action" : "New action"}</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </ModalClose>
        </ModalHead>
        <ModalSub>Steps run in order and stop on the first failure.</ModalSub>
        <form onSubmit={(e) => void submit(e)}>
          <S.FormStack>
            <S.Field>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </S.Field>
            <S.StepList>
              {steps.map((step, i) => (
                <S.StepRow key={i}>
                  <S.StepTop>
                    <S.StepIndex>{i + 1}</S.StepIndex>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Dropdown
                        value={step.type}
                        options={typeOptions}
                        onChange={(type) => updateStep(i, { type })}
                        variant="underline"
                      />
                    </div>
                    <S.StepMove>
                      <S.IconBtn type="button" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ChevronUp size={14} />
                      </S.IconBtn>
                      <S.IconBtn
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === steps.length - 1}
                      >
                        <ChevronDown size={14} />
                      </S.IconBtn>
                      <S.IconBtn
                        type="button"
                        $danger
                        onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                        disabled={steps.length <= 1}
                      >
                        <Trash2 size={14} />
                      </S.IconBtn>
                    </S.StepMove>
                  </S.StepTop>
                  {step.type === "command" && (
                    <S.Field>
                      Command
                      <input
                        value={step.command ?? ""}
                        onChange={(e) => updateStep(i, { command: e.target.value })}
                        placeholder="yarn build"
                      />
                    </S.Field>
                  )}
                  {(step.type === "docker_restart" || step.type === "docker_ensure") && (
                    <S.Field>
                      Container name or id
                      <input
                        value={step.container ?? ""}
                        onChange={(e) => updateStep(i, { container: e.target.value })}
                        placeholder="my-app"
                      />
                    </S.Field>
                  )}
                  {step.type === "compose_up" && (
                    <S.Field>
                      Compose file in the project folder
                      <input
                        value={step.source ?? ""}
                        onChange={(e) => updateStep(i, { source: e.target.value })}
                        placeholder="compose.yaml"
                      />
                      <S.FieldHint>
                        <code>{joinProjectRel(projectPath, step.source ?? "")}</code>
                      </S.FieldHint>
                    </S.Field>
                  )}
                  {(step.type === "systemd_restart" ||
                    step.type === "systemd_enable" ||
                    step.type === "systemd_apply") && (
                    <S.Field>
                      Unit
                      <input
                        value={step.unit ?? ""}
                        onChange={(e) => updateStep(i, { unit: e.target.value })}
                        placeholder="my-app.service"
                      />
                    </S.Field>
                  )}
                  {step.type === "systemd_apply" && (
                    <S.Field>
                      Start command
                      <input
                        value={step.command ?? ""}
                        onChange={(e) => updateStep(i, { command: e.target.value })}
                        placeholder="/usr/bin/node server.js"
                      />
                    </S.Field>
                  )}
                  {step.type === "publish" && (
                    <>
                      <S.Field>
                        From (folder in this project)
                        <input
                          value={step.source ?? ""}
                          onChange={(e) => updateStep(i, { source: e.target.value })}
                          placeholder="dist"
                        />
                        <S.FieldHint>
                          Copies{" "}
                          <code>{joinProjectRel(projectPath, step.source ?? "", "dist")}</code>
                          . Type a folder under this project, e.g. <code>dist</code>.
                        </S.FieldHint>
                      </S.Field>
                      <HostPathField
                        label="To (on this machine)"
                        value={step.dest ?? ""}
                        platform={capabilities.platform}
                        onChange={(dest) => updateStep(i, { dest })}
                      />
                    </>
                  )}
                </S.StepRow>
              ))}
            </S.StepList>
            <GhostBtn
              type="button"
              onClick={() => setSteps((prev) => [...prev, { type: "command", command: "" }])}
            >
              <Plus size={14} />
              Add step
            </GhostBtn>
            {error && <AuthError>{error}</AuthError>}
            <ModalActions>
              <ModalBtn type="button" onClick={onClose}>
                Cancel
              </ModalBtn>
              <ModalBtn type="submit" $variant="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </ModalBtn>
            </ModalActions>
          </S.FormStack>
        </form>
      </S.WideModal>
    </ModalOverlay>
  );
}
