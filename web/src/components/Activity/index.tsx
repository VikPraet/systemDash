import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Monitor,
  RefreshCw,
  Power,
  XCircle,
  AlertTriangle,
  X,
  Search,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  UserCog,
  UserMinus,
  Terminal,
  SquareTerminal,
  ChevronRight,
  FileText,
  Download,
  FilePen,
  Trash2,
  FolderPlus,
  FilePlus,
  PenLine,
  FolderInput,
  Copy,
  Upload,
  Ban,
  Eraser,
  Settings,
  Circle,
  PowerOff,
  Smartphone,
  Tablet,
  Bot,
  Archive,
  HelpCircle,
  KeyRound,
  LayoutGrid,
  MapPin,
  Network,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  clearAudit,
  DEFAULT_SETTINGS,
  fetchAudit,
  fetchAuditStats,
  fetchSessions,
  fetchSettings,
  formatBytes,
  formatDate,
  formatRelative,
  revokeSession,
  saveSettings,
} from "../../api";
import { cache } from "../../cache";
import type {
  ActivitySettings,
  ActivityStats,
  AuditEntry,
  GeoLocation,
  SessionInfo,
  Settings as AppSettings,
} from "../../types";
import { parseUserAgent } from "../../device";
import type { DeviceKind } from "../../device";
import {
  AuthError,
  DangerBtn,
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
  RevokeWarn,
  RoleBadge,
} from "../ui/styles";
import { Tooltip } from "../ui/Tooltip";
import { Bar, Stat } from "../widgets";
import { CardTitle } from "../widgets/styles";
import * as H from "../History/styles";
import * as S from "./styles";

// Turns an ISO 3166-1 alpha-2 code into its flag emoji (regional indicators).
function flagEmoji(cc: string | null): string {
  if (!cc || !/^[a-z]{2}$/i.test(cc)) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map((c) => base + (c.codePointAt(0) ?? 65) - 65)
  );
}

// Shows where a connection came from. Local/private addresses are labelled
// without a flag; resolved public addresses show a flag + "City, Country".
function LocationLine({
  location,
  hideUnknown = false,
}: Readonly<{
  location: GeoLocation | null;
  hideUnknown?: boolean;
}>) {
  if (!location) return null;
  if (location.status === "local") {
    return (
      <S.LocLine>
        <Network size={12} strokeWidth={1.8} />
        <S.LocText>{location.label}</S.LocText>
      </S.LocLine>
    );
  }
  if (location.status === "unknown") {
    if (hideUnknown) return null;
    return (
      <S.LocLine>
        <MapPin size={12} strokeWidth={1.8} />
        <S.LocText>Unknown location</S.LocText>
      </S.LocLine>
    );
  }
  const flag = flagEmoji(location.countryCode);
  const title = [location.city, location.region, location.country]
    .filter(Boolean)
    .join(", ");
  return (
    <S.LocLine title={title || location.label}>
      {flag ? (
        <S.LocFlag aria-hidden>{flag}</S.LocFlag>
      ) : (
        <MapPin size={12} strokeWidth={1.8} />
      )}
      <S.LocText>{location.label}</S.LocText>
    </S.LocLine>
  );
}

// Icon for each parsed device category shown next to a session.
const DEVICE_ICON: Record<DeviceKind, LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot,
  unknown: HelpCircle,
};

const POLL_MS = 5000;

type ActionKind =
  | "info"
  | "success"
  | "warn"
  | "danger"
  | "neutral"
  | "terminal";

interface ActionMeta {
  // Past-tense phrase shown when the action actually succeeded.
  label: string;
  // Infinitive phrase used when the action was only attempted (denied/failed),
  // e.g. "edit a file" -> "Tried to edit a file".
  attempt: string;
  icon: LucideIcon;
  kind: ActionKind;
}

// Friendly label + icon + colour for each action code the backend records.
const ACTION_META: Record<string, ActionMeta> = {
  "auth.login": { label: "Signed in", attempt: "sign in", icon: LogIn, kind: "info" },
  "auth.login_failed": {
    label: "Failed sign-in",
    attempt: "sign in",
    icon: ShieldAlert,
    kind: "danger",
  },
  "auth.logout": { label: "Signed out", attempt: "sign out", icon: LogOut, kind: "neutral" },
  "auth.setup": { label: "Created admin", attempt: "create the admin account", icon: ShieldCheck, kind: "info" },
  "auth.recover_username": {
    label: "Recovered username",
    attempt: "recover a username",
    icon: HelpCircle,
    kind: "info",
  },
  "auth.recover_username_failed": {
    label: "Failed username recovery",
    attempt: "recover a username",
    icon: ShieldAlert,
    kind: "danger",
  },
  "auth.recover_password": {
    label: "Reset password via recovery",
    attempt: "reset a password",
    icon: KeyRound,
    kind: "warn",
  },
  "auth.recover_password_failed": {
    label: "Failed password recovery",
    attempt: "reset a password",
    icon: ShieldAlert,
    kind: "danger",
  },
  "auth.recovery_set": {
    label: "Set recovery question",
    attempt: "set a recovery question",
    icon: KeyRound,
    kind: "info",
  },
  "user.create": { label: "Created user", attempt: "create a user", icon: UserPlus, kind: "success" },
  "user.update": { label: "Updated user", attempt: "update a user", icon: UserCog, kind: "warn" },
  "user.delete": { label: "Deleted user", attempt: "delete a user", icon: UserMinus, kind: "danger" },
  "session.revoke": { label: "Revoked session", attempt: "revoke a session", icon: XCircle, kind: "danger" },
  "terminal.connect": {
    label: "Opened terminal",
    attempt: "open a terminal",
    icon: SquareTerminal,
    kind: "terminal",
  },
  "terminal.disconnect": {
    label: "Closed terminal",
    attempt: "close the terminal",
    icon: Terminal,
    kind: "terminal",
  },
  "terminal.command": {
    label: "Ran command",
    attempt: "run a command",
    icon: ChevronRight,
    kind: "terminal",
  },
  "fs.read": { label: "Opened file", attempt: "open a file", icon: FileText, kind: "neutral" },
  "fs.download": { label: "Downloaded file", attempt: "download a file", icon: Download, kind: "neutral" },
  "fs.write": { label: "Edited file", attempt: "edit a file", icon: FilePen, kind: "warn" },
  "fs.delete": { label: "Moved to trash", attempt: "delete an item", icon: Trash2, kind: "danger" },
  "fs.trash.restore": { label: "Restored from trash", attempt: "restore an item", icon: FolderInput, kind: "success" },
  "fs.trash.purge": { label: "Deleted forever", attempt: "permanently delete an item", icon: Trash2, kind: "danger" },
  "fs.trash.empty": { label: "Emptied trash", attempt: "empty trash", icon: Eraser, kind: "danger" },
  "fs.folder": { label: "Created folder", attempt: "create a folder", icon: FolderPlus, kind: "success" },
  "fs.file": { label: "Created file", attempt: "create a file", icon: FilePlus, kind: "success" },
  "fs.rename": { label: "Renamed item", attempt: "rename an item", icon: PenLine, kind: "warn" },
  "fs.move": { label: "Moved item", attempt: "move an item", icon: FolderInput, kind: "warn" },
  "fs.copy": { label: "Copied item", attempt: "copy an item", icon: Copy, kind: "neutral" },
  "fs.upload": { label: "Uploaded file", attempt: "upload a file", icon: Upload, kind: "success" },
  "fs.shares.add": { label: "Added network drive", attempt: "add a network drive", icon: Network, kind: "success" },
  "fs.shares.connect": { label: "Connected network drive", attempt: "connect a network drive", icon: Network, kind: "neutral" },
  "fs.shares.remove": { label: "Removed network drive", attempt: "remove a network drive", icon: Network, kind: "warn" },
  "process.kill": { label: "Killed process", attempt: "kill a process", icon: Ban, kind: "danger" },
  "process.end": { label: "Ended process", attempt: "end a process", icon: Ban, kind: "danger" },
  "history.clear": { label: "Cleared history", attempt: "clear history", icon: Eraser, kind: "danger" },
  "activity.clear": { label: "Cleared activity log", attempt: "clear the activity log", icon: Eraser, kind: "danger" },
  "system.reboot": { label: "Scheduled reboot", attempt: "reboot the host", icon: RefreshCw, kind: "danger" },
  "system.shutdown": { label: "Scheduled shutdown", attempt: "shut down the host", icon: Power, kind: "danger" },
  "system.poweroff": {
    label: "Scheduled force power off",
    attempt: "force power off the host",
    icon: PowerOff,
    kind: "danger",
  },
  settings: { label: "Changed settings", attempt: "change settings", icon: Settings, kind: "warn" },
  "settings.files": { label: "Changed file settings", attempt: "change file settings", icon: Settings, kind: "warn" },
  "settings.history": { label: "Changed history settings", attempt: "change history settings", icon: Settings, kind: "warn" },
  "settings.activity": { label: "Changed activity settings", attempt: "change activity settings", icon: Settings, kind: "warn" },
  "settings.terminal": { label: "Changed terminal settings", attempt: "change terminal settings", icon: Settings, kind: "warn" },
  "backup.create": { label: "Created backup", attempt: "create a backup", icon: Archive, kind: "success" },
  "backup.download": { label: "Downloaded backup", attempt: "download a backup", icon: Download, kind: "neutral" },
  "backup.restore": { label: "Restored backup", attempt: "restore a backup", icon: Archive, kind: "danger" },
};

function actionMeta(action: string): ActionMeta {
  const meta = ACTION_META[action];
  if (meta) return meta;
  // Fallback for unknown / dynamically derived action codes.
  if (action.startsWith("auth."))
    return { label: action, attempt: action, icon: LogIn, kind: "info" };
  if (action.startsWith("user."))
    return { label: action, attempt: action, icon: UserCog, kind: "warn" };
  if (action.startsWith("terminal."))
    return { label: action, attempt: action, icon: Terminal, kind: "terminal" };
  if (action.startsWith("fs."))
    return { label: action, attempt: action, icon: FileText, kind: "neutral" };
  if (action.startsWith("settings.")) {
    const section = action.slice("settings.".length);
    return {
      label: `Changed ${section} settings`,
      attempt: `change ${section} settings`,
      icon: Settings,
      kind: "warn",
    };
  }
  return { label: action, attempt: action, icon: Circle, kind: "neutral" };
}

// Broad group used by the filter chips (independent of the colour kind).
type CategoryId =
  | "all"
  | "auth"
  | "users"
  | "sessions"
  | "terminal"
  | "files"
  | "system";

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "auth", label: "Auth" },
  { id: "users", label: "Users" },
  { id: "sessions", label: "Sessions" },
  { id: "terminal", label: "Terminal" },
  { id: "files", label: "Files" },
  { id: "system", label: "System" },
];

function actionCategory(action: string): Exclude<CategoryId, "all"> {
  if (action.startsWith("auth.")) return "auth";
  if (action.startsWith("user.")) return "users";
  if (action.startsWith("session.")) return "sessions";
  if (action.startsWith("terminal.")) return "terminal";
  if (action.startsWith("fs.")) return "files";
  return "system";
}

type Outcome = "ok" | "denied" | "failed";

// Classifies an entry by its HTTP status. Auth failures (401) on a login are a
// genuine "failed sign-in" rather than a permission denial, so we keep those as
// failed. 401/403 elsewhere mean the user was blocked before anything happened.
function outcome(e: AuditEntry): Outcome {
  const s = e.status;
  if (typeof s !== "number" || s < 400) return "ok";
  if ((s === 401 || s === 403) && e.action !== "auth.login_failed") {
    return "denied";
  }
  return "failed";
}

function isFailed(e: AuditEntry): boolean {
  return outcome(e) !== "ok";
}

// What to show as the row's headline. For denied/failed attempts we phrase it as
// an attempt ("Tried to edit a file") so the log never implies the action
// actually happened when it didn't.
function displayLabel(e: AuditEntry): string {
  const meta = actionMeta(e.action);
  switch (outcome(e)) {
    case "denied":
      return `Tried to ${meta.attempt}`;
    case "failed":
      return e.action === "auth.login_failed"
        ? meta.label
        : `Couldn't ${meta.attempt}`;
    default:
      return meta.label;
  }
}

export function Activity() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [s, a, st] = await Promise.all([
        fetchSessions(),
        fetchAudit(2000),
        fetchAuditStats().catch(() => null),
      ]);
      setSessions(s);
      setAudit(a.entries ?? []);
      setAuditTotal(a.total ?? a.entries.length);
      if (st) setStats(st);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function confirmRevoke(session: SessionInfo) {
    await revokeSession(session.id);
    await load();
  }

  // Per-category counts so the chips can show how many entries each holds.
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: audit.length };
    for (const e of audit) {
      const c = actionCategory(e.action);
      map[c] = (map[c] ?? 0) + 1;
    }
    return map;
  }, [audit]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audit.filter((e) => {
      if (category !== "all" && actionCategory(e.action) !== category)
        return false;
      if (failedOnly && !isFailed(e)) return false;
      if (!q) return true;
      const hay = [
        displayLabel(e),
        e.action,
        e.username ?? "",
        e.detail ?? "",
        e.ip ?? "",
        e.location?.label ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [audit, category, query, failedOnly]);

  return (
    <S.ActivityTab>
      <S.ActivityHead>
        <h2>Activity</h2>
        <Tooltip label="Refresh">
          <GhostBtn onClick={load}>
            <RefreshCw size={15} strokeWidth={1.8} />
            Refresh
          </GhostBtn>
        </Tooltip>
      </S.ActivityHead>

      {error && <AuthError $inline>{error}</AuthError>}

      <S.ActivityCard>
        <S.SectionTitle>
          Active sessions
          <span>{sessions.length}</span>
        </S.SectionTitle>
        {sessions.length === 0 ? (
          <S.ActivityEmpty className="muted">No active sessions.</S.ActivityEmpty>
        ) : (
          <S.SessionGrid>
            {sessions.map((s) => {
              const device = parseUserAgent(s.userAgent);
              const DeviceIcon = DEVICE_ICON[device.kind];
              return (
                <S.SessionCard $current={s.current} $editing={s.layoutEditing} key={s.id}>
                  <S.SessUser>
                    {s.username}
                    {s.current && <S.SelfBadge>you</S.SelfBadge>}
                    <RoleBadge $role={s.role}>{s.role}</RoleBadge>
                    {s.layoutEditing && (
                      <S.EditBadge>
                        <LayoutGrid size={10} strokeWidth={2.2} />
                        customizing layout
                      </S.EditBadge>
                    )}
                  </S.SessUser>
                  <S.SessDevice title={device.raw ?? "No device information"}>
                    <DeviceIcon size={14} strokeWidth={1.8} />
                    {device.label}
                  </S.SessDevice>
                  <S.SessNet>
                    <LocationLine location={s.location} />
                    <S.SessIp className="mono" title={s.ip || undefined}>
                      {s.ip || "—"}
                    </S.SessIp>
                  </S.SessNet>
                  <S.SessFoot>
                    <S.SessTimes>
                      <span title={formatDate(s.createdAt)}>
                        Signed in {formatRelative(s.createdAt, now)}
                      </span>
                      <span title={formatDate(s.lastSeen)}>
                        Last seen {formatRelative(s.lastSeen, now)}
                      </span>
                    </S.SessTimes>
                    <Tooltip
                      label={s.current ? "Revoke (signs you out)" : "Revoke session"}
                    >
                      <GhostBtn $danger onClick={() => setRevokeTarget(s)}>
                        <XCircle size={15} strokeWidth={1.8} />
                      </GhostBtn>
                    </Tooltip>
                  </S.SessFoot>
                </S.SessionCard>
              );
            })}
          </S.SessionGrid>
        )}
      </S.ActivityCard>

      <S.ActivityCard $log>
        <S.LogSticky>
          <S.SectionTitle>
            Activity log
            <span>
              {filtered.length !== audit.length
                ? `${filtered.length} / ${audit.length}`
                : auditTotal > audit.length
                  ? `${audit.length.toLocaleString()} of ${auditTotal.toLocaleString()}`
                  : auditTotal.toLocaleString()}
            </span>
          </S.SectionTitle>

          {audit.length > 0 && (
            <S.LogToolbar>
              <S.Seg>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={category === c.id ? "active" : undefined}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.label}
                    <span className="seg-count">{counts[c.id] ?? 0}</span>
                  </button>
                ))}
              </S.Seg>
              <S.LogToolbarRight>
                <Tooltip label="Show only failed actions">
                  <S.Seg>
                    <button
                      type="button"
                      className={failedOnly ? "active danger" : undefined}
                      onClick={() => setFailedOnly((v) => !v)}
                    >
                      <ShieldAlert size={13} strokeWidth={1.9} />
                      Failures
                    </button>
                  </S.Seg>
                </Tooltip>
                <S.AuditSearch>
                  <Search size={14} strokeWidth={1.8} />
                  <input
                    type="text"
                    placeholder="Search user, action, detail…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <Tooltip label="Clear">
                      <S.AuditSearchClear type="button" onClick={() => setQuery("")}>
                        <X size={13} strokeWidth={2} />
                      </S.AuditSearchClear>
                    </Tooltip>
                  )}
                </S.AuditSearch>
              </S.LogToolbarRight>
            </S.LogToolbar>
          )}
        </S.LogSticky>

        {loading && audit.length === 0 ? (
          <Loading>Loading…</Loading>
        ) : audit.length === 0 ? (
          <S.ActivityEmpty className="muted">
            No activity recorded yet.
          </S.ActivityEmpty>
        ) : filtered.length === 0 ? (
          <S.ActivityEmpty className="muted">
            No activity matches your filters.
          </S.ActivityEmpty>
        ) : (
          <S.AuditList>
            {filtered.map((e) => {
              const meta = actionMeta(e.action);
              const result = outcome(e);
              const Icon = result === "denied" ? ShieldAlert : meta.icon;
              const iconKind = result === "ok" ? meta.kind : "neutral";
              return (
                <S.AuditRow $outcome={result} key={e.id}>
                  <S.AuditIcon $kind={iconKind}>
                    <Icon size={14} strokeWidth={1.9} />
                  </S.AuditIcon>
                  <S.AuditBody>
                    <S.AuditTop>
                      <S.AuditAction>{displayLabel(e)}</S.AuditAction>
                      <S.AuditCat>{actionCategory(e.action)}</S.AuditCat>
                      {result === "denied" && (
                        <S.AuditStatusBadge $denied>
                          denied{e.status ? ` · ${e.status}` : ""}
                        </S.AuditStatusBadge>
                      )}
                      {result === "failed" && e.action !== "auth.login_failed" && (
                        <S.AuditStatusBadge>
                          failed{e.status ? ` · ${e.status}` : ""}
                        </S.AuditStatusBadge>
                      )}
                      <S.AuditTime title={formatDate(e.ts)}>
                        {formatRelative(e.ts, now)}
                      </S.AuditTime>
                    </S.AuditTop>
                    <S.AuditMeta>
                      <S.AuditUser>{e.username ?? "—"}</S.AuditUser>
                      {e.detail ? (
                        <S.AuditDetail title={e.detail}>{e.detail}</S.AuditDetail>
                      ) : null}
                      {e.ip ? (
                        <S.AuditIp className="mono" title={e.ip}>
                          {e.ip}
                        </S.AuditIp>
                      ) : null}
                      <LocationLine location={e.location} hideUnknown />
                    </S.AuditMeta>
                  </S.AuditBody>
                </S.AuditRow>
              );
            })}
          </S.AuditList>
        )}
      </S.ActivityCard>

      <S.StorageWrap>
        <StoragePanel stats={stats} onChanged={() => void load()} />
      </S.StorageWrap>

      {revokeTarget && (
        <RevokeModal
          session={revokeTarget}
          now={now}
          onClose={() => setRevokeTarget(null)}
          onConfirm={async () => {
            await confirmRevoke(revokeTarget);
            setRevokeTarget(null);
          }}
        />
      )}
    </S.ActivityTab>
  );
}

function StoragePanel({
  stats,
  onChanged,
}: {
  stats: ActivityStats | null;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<ActivitySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(cache.settings.activity ?? DEFAULT_SETTINGS.activity);
    fetchSettings()
      .then((s) => {
        cache.settings = s;
        setDraft(s.activity ?? DEFAULT_SETTINGS.activity);
      })
      .catch(() => {});
  }, []);

  if (!draft) return null;

  const dirty =
    !!stats &&
    (draft.enabled !== stats.enabled ||
      draft.retentionDays !== stats.retentionDays ||
      draft.maxSizeMb !== stats.maxSizeMb);

  async function save() {
    if (busy || !draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const next: AppSettings = { ...cache.settings, activity: draft };
      const saved = await saveSettings(next);
      cache.settings = saved;
      setDraft(saved.activity ?? draft);
      onChanged();
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doClear() {
    setBusy(true);
    setMsg(null);
    try {
      await clearAudit();
      onChanged();
      setConfirmClear(false);
      setMsg("Activity log cleared.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const usedPct =
    stats && stats.maxSizeMb > 0
      ? (stats.dbBytes / (stats.maxSizeMb * 1024 * 1024)) * 100
      : 0;

  return (
    <H.StoragePanel>
      <CardTitle as="h2">Storage &amp; recording</CardTitle>
      <H.StorageGrid>
        <H.StorageStats>
          {stats ? (
            <>
              <H.KvTight>
                <Stat label="Log size" value={formatBytes(stats.dbBytes)} />
                <Stat
                  label="Entries stored"
                  value={stats.rowCount.toLocaleString()}
                />
                <Stat
                  label="Per entry"
                  value={
                    stats.bytesPerEntry > 0 ? formatBytes(stats.bytesPerEntry) : "—"
                  }
                />
                <Stat label="Oldest record" value={formatDate(stats.oldest)} />
                <Stat
                  label="Est. headroom"
                  value={
                    stats.estimatedDaysToFull != null
                      ? `~${stats.estimatedDaysToFull.toFixed(1)} days`
                      : "unlimited"
                  }
                />
              </H.KvTight>
              {stats.maxSizeMb > 0 && (
                <H.StorageBar>
                  <Bar value={usedPct} />
                  <H.StorageBarFoot className="muted">
                    {formatBytes(stats.dbBytes)} of {stats.maxSizeMb} MB cap (
                    {usedPct.toFixed(usedPct < 10 ? 1 : 0)}%)
                  </H.StorageBarFoot>
                </H.StorageBar>
              )}
            </>
          ) : (
            <div className="muted">Loading storage stats…</div>
          )}
        </H.StorageStats>
        <H.StorageForm>
          <H.ToggleRow
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          >
            <H.ToggleText>
              <H.ToggleLabel>Record activity</H.ToggleLabel>
              <H.ToggleDesc>
                Store logins, file changes, terminal sessions, and other actions as they happen.
              </H.ToggleDesc>
            </H.ToggleText>
            <H.Switch $on={draft.enabled}>
              <H.SwitchKnob />
            </H.Switch>
          </H.ToggleRow>
          <NumberField
            label="Keep activity for"
            unit="days (0 = no age limit)"
            min={0}
            max={3650}
            value={draft.retentionDays}
            onChange={(v) => setDraft({ ...draft, retentionDays: v })}
          />
          <NumberField
            label="Max log size"
            unit="MB (0 = no size limit)"
            min={0}
            max={1048576}
            value={draft.maxSizeMb}
            onChange={(v) => setDraft({ ...draft, maxSizeMb: v })}
          />
          <H.StorageActions>
            <ModalBtn
              type="button"
              $variant="danger-ghost"
              onClick={() => setConfirmClear(true)}
              disabled={busy}
            >
              Clear log
            </ModalBtn>
            <H.StorageActionsRight>
              {msg && <H.StorageMsg className="muted">{msg}</H.StorageMsg>}
              <ModalBtn
                type="button"
                $variant="primary"
                onClick={() => void save()}
                disabled={busy || !dirty}
              >
                {busy ? "Saving…" : "Save"}
              </ModalBtn>
            </H.StorageActionsRight>
          </H.StorageActions>
        </H.StorageForm>
      </H.StorageGrid>
      {confirmClear && (
        <H.StorageConfirm>
          <span>Permanently delete all activity log entries?</span>
          <H.StorageConfirmActions>
            <ModalBtn
              type="button"
              onClick={() => setConfirmClear(false)}
              disabled={busy}
            >
              Cancel
            </ModalBtn>
            <ModalBtn
              type="button"
              $variant="danger"
              onClick={() => void doClear()}
              disabled={busy}
            >
              Delete everything
            </ModalBtn>
          </H.StorageConfirmActions>
        </H.StorageConfirm>
      )}
    </H.StoragePanel>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <H.NumField>
      <H.NumFieldLabel>{label}</H.NumFieldLabel>
      <H.NumFieldInput>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.max(min, Math.min(max, Math.round(n))));
          }}
        />
        <H.NumFieldUnit className="muted">{unit}</H.NumFieldUnit>
      </H.NumFieldInput>
    </H.NumField>
  );
}

function RevokeModal({
  session,
  now,
  onClose,
  onConfirm,
}: {
  session: SessionInfo;
  now: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const device = parseUserAgent(session.userAgent);
  const DeviceIcon = DEVICE_ICON[device.kind];

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClick={onClose} role="presentation">
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>Revoke session</h3>
          <ModalClose type="button" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </ModalClose>
        </ModalHead>

        <ModalSub>
          This immediately signs out <strong>{session.username}</strong> on this
          session. They will need to log in again to continue.
        </ModalSub>

        <RevokeDetails>
          <div>
            <dt>User</dt>
            <dd>
              {session.username}
              <RoleBadge $role={session.role}>{session.role}</RoleBadge>
            </dd>
          </div>
          <div>
            <dt>Device</dt>
            <dd title={device.raw ?? "No device information"}>
              <DeviceIcon size={15} strokeWidth={1.8} />
              {device.label}
              {device.os && <span className="muted">· {device.os}</span>}
            </dd>
          </div>
          <div>
            <dt>IP address</dt>
            <dd className="mono">{session.ip || "—"}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {session.location ? (
                <LocationLine location={session.location} />
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Signed in</dt>
            <dd title={formatDate(session.createdAt)}>
              {formatRelative(session.createdAt, now)}
            </dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd title={formatDate(session.lastSeen)}>
              {formatRelative(session.lastSeen, now)}
            </dd>
          </div>
        </RevokeDetails>

        {session.layoutEditing && (
          <RevokeWarn>
            <LayoutGrid size={15} strokeWidth={1.8} />
            This session is customizing the dashboard layout. Revoking it will
            end that edit session.
          </RevokeWarn>
        )}

        {session.current && (
          <RevokeWarn>
            <AlertTriangle size={15} strokeWidth={1.8} />
            This is your own current session — revoking it will sign you out.
          </RevokeWarn>
        )}

        {error && <AuthError>{error}</AuthError>}

        <ModalActions>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
          <DangerBtn type="button" onClick={confirm} disabled={busy}>
            <XCircle size={15} strokeWidth={1.8} />
            {busy ? "Revoking…" : "Revoke session"}
          </DangerBtn>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}
