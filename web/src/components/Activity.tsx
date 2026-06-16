import { useCallback, useEffect, useRef, useState } from "react";
import {
  Monitor,
  RefreshCw,
  ScrollText,
  XCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  fetchAudit,
  fetchSessions,
  formatDate,
  formatRelative,
  revokeSession,
} from "../api";
import type { AuditEntry, SessionInfo } from "../types";

const POLL_MS = 5000;

// Friendly labels for the dotted action codes the backend records.
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.logout": "Signed out",
  "auth.setup": "Created admin",
  "user.create": "Created user",
  "user.update": "Updated user",
  "user.delete": "Deleted user",
  "session.revoke": "Revoked session",
  "terminal.connect": "Opened terminal",
  "terminal.disconnect": "Closed terminal",
  "terminal.command": "Ran command",
  "fs.read": "Opened file",
  "fs.download": "Downloaded file",
  "fs.write": "Edited file",
  "fs.delete": "Deleted item",
  "fs.folder": "Created folder",
  "fs.file": "Created file",
  "fs.rename": "Renamed item",
  "fs.move": "Moved item",
  "fs.copy": "Copied item",
  "fs.upload": "Uploaded file",
  "history.clear": "Cleared history",
  settings: "Changed settings",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function actionKind(action: string): "auth" | "danger" | "write" | "neutral" {
  if (action === "auth.login_failed") return "danger";
  if (action.startsWith("auth.") || action.startsWith("terminal.")) return "auth";
  if (action.startsWith("user.") || action.startsWith("session.")) return "danger";
  if (action === "fs.read" || action === "fs.download") return "neutral";
  return "write";
}

export function Activity() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
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
              <span>IP</span>
              <span>Signed in</span>
              <span>Last seen</span>
              <span></span>
            </div>
            {sessions.map((s) => (
              <div className={`sessions-row${s.current ? " current" : ""}`} key={s.id}>
                <span className="sess-user">
                  {s.username}
                  {s.current && <span className="self-badge">you</span>}
                  <span className={`role-badge ${s.role}`}>{s.role}</span>
                </span>
                <span className="muted mono">{s.ip || "—"}</span>
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
            ))}
          </div>
        )}
      </section>

      <section className="activity-card">
        <div className="activity-card-head">
          <ScrollText size={16} strokeWidth={1.8} />
          <h3>Activity log</h3>
          <span className="muted">{audit.length}</span>
        </div>
        {loading && audit.length === 0 ? (
          <div className="loading">Loading…</div>
        ) : audit.length === 0 ? (
          <div className="muted activity-empty">No activity recorded yet.</div>
        ) : (
          <div className="audit-list">
            {audit.map((e) => (
              <div className="audit-row" key={e.id}>
                <span className={`audit-dot ${actionKind(e.action)}`} />
                <span className="audit-action">{actionLabel(e.action)}</span>
                <span className="audit-user">{e.username ?? "—"}</span>
                <span className="audit-detail muted">{e.detail ?? ""}</span>
                <span className="audit-ip muted mono">{e.ip || ""}</span>
                <span className="audit-time muted" title={formatDate(e.ts)}>
                  {formatRelative(e.ts, now)}
                </span>
              </div>
            ))}
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
            <dt>IP address</dt>
            <dd className="mono">{session.ip || "—"}</dd>
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
