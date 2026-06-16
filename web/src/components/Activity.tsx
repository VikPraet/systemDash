import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Monitor,
  RefreshCw,
  ScrollText,
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
  Smartphone,
  Tablet,
  Bot,
  HelpCircle,
  MapPin,
  Network,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  fetchAudit,
  fetchSessions,
  formatDate,
  formatRelative,
  revokeSession,
} from "../api";
import type { AuditEntry, GeoLocation, SessionInfo } from "../types";
import { parseUserAgent } from "../device";
import type { DeviceKind } from "../device";

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
      <span className="loc-line muted">
        <Network size={12} strokeWidth={1.8} />
        {location.label}
      </span>
    );
  }
  if (location.status === "unknown") {
    if (hideUnknown) return null;
    return (
      <span className="loc-line muted">
        <MapPin size={12} strokeWidth={1.8} />
        Unknown location
      </span>
    );
  }
  const flag = flagEmoji(location.countryCode);
  const title = [location.city, location.region, location.country]
    .filter(Boolean)
    .join(", ");
  return (
    <span className="loc-line" title={title || location.label}>
      {flag ? (
        <span className="loc-flag" aria-hidden>
          {flag}
        </span>
      ) : (
        <MapPin size={12} strokeWidth={1.8} />
      )}
      {location.label}
    </span>
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
  "fs.delete": { label: "Deleted item", attempt: "delete an item", icon: Trash2, kind: "danger" },
  "fs.folder": { label: "Created folder", attempt: "create a folder", icon: FolderPlus, kind: "success" },
  "fs.file": { label: "Created file", attempt: "create a file", icon: FilePlus, kind: "success" },
  "fs.rename": { label: "Renamed item", attempt: "rename an item", icon: PenLine, kind: "warn" },
  "fs.move": { label: "Moved item", attempt: "move an item", icon: FolderInput, kind: "warn" },
  "fs.copy": { label: "Copied item", attempt: "copy an item", icon: Copy, kind: "neutral" },
  "fs.upload": { label: "Uploaded file", attempt: "upload a file", icon: Upload, kind: "success" },
  "process.kill": { label: "Killed process", attempt: "kill a process", icon: Ban, kind: "danger" },
  "process.end": { label: "Ended process", attempt: "end a process", icon: Ban, kind: "danger" },
  "history.clear": { label: "Cleared history", attempt: "clear history", icon: Eraser, kind: "danger" },
  settings: { label: "Changed settings", attempt: "change settings", icon: Settings, kind: "warn" },
  "settings.files": { label: "Changed file settings", attempt: "change file settings", icon: Settings, kind: "warn" },
  "settings.history": { label: "Changed history settings", attempt: "change history settings", icon: Settings, kind: "warn" },
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
  const [category, setCategory] = useState<CategoryId>("all");
  const [query, setQuery] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [s, a] = await Promise.all([fetchSessions(), fetchAudit(200)]);
      setSessions(s);
      setAudit(a);
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
    <div className="activity-tab">
      <div className="activity-head">
        <h2>Activity</h2>
        <button className="ghost-btn" onClick={load} title="Refresh">
          <RefreshCw size={15} strokeWidth={1.8} />
          Refresh
        </button>
      </div>

      {error && <div className="auth-error inline">{error}</div>}

      <section className="activity-card">
        <div className="activity-card-head">
          <Monitor size={16} strokeWidth={1.8} />
          <h3>Active sessions</h3>
          <span className="muted">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div className="muted activity-empty">No active sessions.</div>
        ) : (
          <div className="sessions-table">
            <div className="sessions-row sessions-row-head">
              <span>User</span>
              <span>Device</span>
              <span>IP</span>
              <span>Signed in</span>
              <span>Last seen</span>
              <span></span>
            </div>
            {sessions.map((s) => {
              const device = parseUserAgent(s.userAgent);
              const DeviceIcon = DEVICE_ICON[device.kind];
              return (
              <div className={`sessions-row${s.current ? " current" : ""}`} key={s.id}>
                <span className="sess-user">
                  {s.username}
                  {s.current && <span className="self-badge">you</span>}
                  <span className={`role-badge ${s.role}`}>{s.role}</span>
                </span>
                <span className="sess-device" title={device.raw ?? "No device information"}>
                  <DeviceIcon size={15} strokeWidth={1.8} />
                  <span className="sess-device-text">
                    <span className="sess-device-label">{device.label}</span>
                    {device.os && <span className="sess-device-os muted">{device.os}</span>}
                  </span>
                </span>
                <span className="sess-net">
                  <span className="muted mono">{s.ip || "—"}</span>
                  <LocationLine location={s.location} />
                </span>
                <span className="muted" title={formatDate(s.createdAt)}>
                  {formatRelative(s.createdAt, now)}
                </span>
                <span className="muted" title={formatDate(s.lastSeen)}>
                  {formatRelative(s.lastSeen, now)}
                </span>
                <span className="sess-actions">
                  <button
                    className="ghost-btn danger"
                    onClick={() => setRevokeTarget(s)}
                    title={s.current ? "Revoke (signs you out)" : "Revoke session"}
                  >
                    <XCircle size={15} strokeWidth={1.8} />
                  </button>
                </span>
              </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="activity-card">
        <div className="activity-card-head">
          <ScrollText size={16} strokeWidth={1.8} />
          <h3>Activity log</h3>
          <span className="muted">
            {filtered.length === audit.length
              ? audit.length
              : `${filtered.length} / ${audit.length}`}
          </span>
        </div>

        {audit.length > 0 && (
          <div className="audit-filters">
            <div className="audit-chips">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  className={`audit-chip${category === c.id ? " active" : ""}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                  <span className="audit-chip-count">{counts[c.id] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="audit-filter-right">
              <button
                className={`audit-chip${failedOnly ? " active danger" : ""}`}
                onClick={() => setFailedOnly((v) => !v)}
                title="Show only failed actions"
              >
                <ShieldAlert size={13} strokeWidth={1.9} />
                Failures
              </button>
              <div className="audit-search">
                <Search size={14} strokeWidth={1.8} />
                <input
                  type="text"
                  placeholder="Search user, action, detail…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    className="audit-search-clear"
                    onClick={() => setQuery("")}
                    title="Clear"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && audit.length === 0 ? (
          <div className="loading">Loading…</div>
        ) : audit.length === 0 ? (
          <div className="muted activity-empty">No activity recorded yet.</div>
        ) : filtered.length === 0 ? (
          <div className="muted activity-empty">No activity matches your filters.</div>
        ) : (
          <div className="audit-list">
            {filtered.map((e) => {
              const meta = actionMeta(e.action);
              const result = outcome(e);
              // Denied/failed attempts get a neutral grey icon so the colour
              // doesn't imply the action actually took effect.
              const Icon = result === "denied" ? ShieldAlert : meta.icon;
              const iconKind = result === "ok" ? meta.kind : "neutral";
              return (
              <div
                className={`audit-row outcome-${result}`}
                key={e.id}
              >
                <span className={`audit-icon ${iconKind}`}>
                  <Icon size={14} strokeWidth={1.9} />
                </span>
                <span className="audit-main">
                  <span className="audit-action">{displayLabel(e)}</span>
                  <span className={`audit-cat ${actionCategory(e.action)}`}>
                    {actionCategory(e.action)}
                  </span>
                  {result === "denied" && (
                    <span className="audit-status-badge denied">
                      denied{e.status ? ` · ${e.status}` : ""}
                    </span>
                  )}
                  {result === "failed" && e.action !== "auth.login_failed" && (
                    <span className="audit-status-badge">
                      failed{e.status ? ` · ${e.status}` : ""}
                    </span>
                  )}
                </span>
                <span className="audit-user">{e.username ?? "—"}</span>
                <span className="audit-detail muted" title={e.detail ?? ""}>
                  {e.detail ?? ""}
                </span>
                <span className="audit-ip muted">
                  {e.ip && <span className="mono">{e.ip}</span>}
                  <LocationLine location={e.location} hideUnknown />
                </span>
                <span className="audit-time muted" title={formatDate(e.ts)}>
                  {formatRelative(e.ts, now)}
                </span>
              </div>
              );
            })}
          </div>
        )}
      </section>

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
    </div>
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
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Revoke session</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <p className="modal-sub">
          This immediately signs out <strong>{session.username}</strong> on this
          session. They will need to log in again to continue.
        </p>

        <dl className="revoke-details">
          <div>
            <dt>User</dt>
            <dd>
              {session.username}
              <span className={`role-badge ${session.role}`}>{session.role}</span>
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
        </dl>

        {session.current && (
          <div className="revoke-warn">
            <AlertTriangle size={15} strokeWidth={1.8} />
            This is your own current session — revoking it will sign you out.
          </div>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={confirm}
            disabled={busy}
          >
            <XCircle size={15} strokeWidth={1.8} />
            {busy ? "Revoking…" : "Revoke session"}
          </button>
        </div>
      </div>
    </div>
  );
}
