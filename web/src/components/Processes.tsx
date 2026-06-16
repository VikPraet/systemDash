import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Power, X } from "lucide-react";
import { fetchProcesses, formatBytes, killProcess } from "../api";
import { cache } from "../cache";
import { hasRole, useAuth } from "../auth/AuthContext";
import type { ProcessInfo, ProcessList } from "../types";
import { ProcessIcon } from "./ProcessIcon";

const POLL_MS = 2000;

type SortKey = "name" | "pid" | "cpuPercent" | "memBytes" | "user";

export function Processes() {
  const { user } = useAuth();
  const canManage = hasRole(user, "user");
  const [data, setData] = useState<ProcessList | null>(() => cache.processes);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpuPercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "apps" | "background">("all");
  const [target, setTarget] = useState<ProcessInfo | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetchProcesses();
      cache.processes = res;
      setData(res);
    } catch {
      // a manual refresh failing is non-fatal; the poll loop will retry
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetchProcesses(ctrl.signal);
        if (!cancelled) {
          cache.processes = res;
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        inFlight.current = false;
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            String(p.pid).includes(q) ||
            p.user.toLowerCase().includes(q)
        )
      : data.list;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "user" ? "asc" : "desc");
    }
  }

  const apps = rows.filter((p) => p.hasWindow);
  const background = rows.filter((p) => !p.hasWindow);
  const appTotal = data?.list.filter((p) => p.hasWindow).length ?? 0;
  const bgTotal = (data?.list.length ?? 0) - appTotal;

  if (!data) {
    return (
      <div className="loading">
        {error ? `Could not load processes: ${error}` : "Loading processes…"}
      </div>
    );
  }

  const cols = canManage ? 6 : 5;

  return (
    <div className="proc">
      <div className="proc-toolbar">
        <input
          className="proc-search"
          type="text"
          placeholder="Filter by name, PID or user…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="segmented">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={filter === "apps" ? "active" : ""}
            onClick={() => setFilter("apps")}
          >
            Apps {appTotal > 0 && <span className="seg-count">{appTotal}</span>}
          </button>
          <button
            className={filter === "background" ? "active" : ""}
            onClick={() => setFilter("background")}
          >
            Background <span className="seg-count">{bgTotal}</span>
          </button>
        </div>
        <div className="proc-summary muted">
          <span>{data.summary.all} total</span>
        </div>
      </div>

      <div className="proc-table-wrap">
        <table className="proc-table">
          <thead>
            <tr>
              <Th label="Process" col="name" {...{ sortKey, sortDir, toggleSort }} />
              <Th label="PID" col="pid" align="right" {...{ sortKey, sortDir, toggleSort }} />
              <Th label="User" col="user" {...{ sortKey, sortDir, toggleSort }} />
              <Th label="CPU" col="cpuPercent" align="right" {...{ sortKey, sortDir, toggleSort }} />
              <Th label="Memory" col="memBytes" align="right" {...{ sortKey, sortDir, toggleSort }} />
              {canManage && <th className="ta-right proc-actions-th" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {filter !== "background" && apps.length > 0 && (
              <>
                <GroupRow label="Apps" count={apps.length} span={cols} />
                {apps.map((p) => (
                  <Row key={p.pid} p={p} canManage={canManage} onManage={setTarget} />
                ))}
              </>
            )}
            {filter !== "apps" && background.length > 0 && (
              <>
                <GroupRow label="Background processes" count={background.length} span={cols} />
                {background.map((p) => (
                  <Row key={p.pid} p={p} canManage={canManage} onManage={setTarget} />
                ))}
              </>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols} className="muted proc-empty">
                  No matching processes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {target && (
        <ProcessActionModal
          p={target}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function GroupRow({ label, count, span }: { label: string; count: number; span: number }) {
  return (
    <tr className="proc-group">
      <td colSpan={span}>
        {label} <span className="muted">({count})</span>
      </td>
    </tr>
  );
}

function Th({
  label,
  col,
  align,
  sortKey,
  sortDir,
  toggleSort,
}: {
  label: string;
  col: SortKey;
  align?: "right";
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`${align === "right" ? "ta-right" : ""} ${active ? "sorted" : ""}`}
      onClick={() => toggleSort(col)}
    >
      {label}
      {active && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`;
}

// A single process rarely uses much of the *total* CPU or RAM, so a 0–100% bar
// looks permanently empty. Instead we tint each cell like a heatmap: the busier
// the process, the stronger the colour, while idle rows stay clean.
function usageColor(v: number): string {
  if (v >= 50) return "var(--bad)";
  if (v >= 20) return "var(--warn)";
  return "var(--accent)";
}

function intensity(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  // Square-root keeps light loads visible without making everything look busy;
  // the offset fades out near-idle values so most rows stay plain.
  const t = Math.sqrt(v / 100);
  return Math.max(0, Math.min(1, (t - 0.12) / 0.88));
}

function Row({
  p,
  canManage,
  onManage,
}: {
  p: ProcessInfo;
  canManage: boolean;
  onManage: (p: ProcessInfo) => void;
}) {
  return (
    <tr>
      <td className="proc-name" title={p.name}>
        <span className="proc-name-cell">
          <ProcessIcon name={p.name} hasWindow={p.hasWindow} />
          <span className="proc-name-text">{p.name}</span>
        </span>
      </td>
      <td className="ta-right muted">{p.pid}</td>
      <td className="proc-user muted" title={p.user}>
        {shortUser(p.user)}
      </td>
      <td className="ta-right">
        <UsageCell value={p.cpuPercent} text={pct(p.cpuPercent)} />
      </td>
      <td className="ta-right">
        <UsageCell
          value={p.memPercent}
          text={formatBytes(p.memBytes)}
          title={`${pct(p.memPercent)} of RAM`}
        />
      </td>
      {canManage && (
        <td className="ta-right proc-actions">
          <button
            type="button"
            className="proc-end-btn"
            title={`End ${p.name}…`}
            onClick={() => onManage(p)}
          >
            <Power size={14} strokeWidth={2} />
            <span>End</span>
          </button>
        </td>
      )}
    </tr>
  );
}

function ProcessActionModal({
  p,
  onClose,
  onDone,
}: {
  p: ProcessInfo;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<"end" | "kill" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "end" | "kill") {
    setBusy(mode);
    setError(null);
    try {
      await killProcess(p.pid, mode, p.name);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>End process</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <p className="modal-sub">
          Choose how to terminate this process. <strong>End task</strong> asks it
          to close gracefully; <strong>Force kill</strong> terminates it
          immediately and may cause unsaved work to be lost.
        </p>

        <dl className="revoke-details">
          <div>
            <dt>Process</dt>
            <dd className="proc-modal-name">
              <ProcessIcon name={p.name} hasWindow={p.hasWindow} />
              {p.name}
            </dd>
          </div>
          <div>
            <dt>PID</dt>
            <dd className="mono">{p.pid}</dd>
          </div>
          <div>
            <dt>User</dt>
            <dd>{shortUser(p.user)}</dd>
          </div>
          <div>
            <dt>CPU / Memory</dt>
            <dd>
              {pct(p.cpuPercent)} · {formatBytes(p.memBytes)}
            </dd>
          </div>
        </dl>

        <div className="revoke-warn">
          <AlertTriangle size={15} strokeWidth={1.8} />
          Terminating a system process can make the machine unstable.
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => run("end")}
            disabled={busy !== null}
          >
            <Power size={15} strokeWidth={1.8} />
            {busy === "end" ? "Ending…" : "End task"}
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => run("kill")}
            disabled={busy !== null}
          >
            <X size={15} strokeWidth={1.8} />
            {busy === "kill" ? "Killing…" : "Force kill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsageCell({
  value,
  text,
  title,
}: {
  value: number;
  text: string;
  title?: string;
}) {
  const t = intensity(value);
  return (
    <span
      className="usage"
      title={title}
      data-idle={value > 0 ? undefined : ""}
      style={
        t > 0.03
          ? {
              background: `color-mix(in srgb, ${usageColor(value)} ${Math.round(
                t * 100
              )}%, transparent)`,
            }
          : undefined
      }
    >
      {text}
    </span>
  );
}

function shortUser(user: string): string {
  if (!user) return "—";
  const parts = user.split("\\");
  return parts[parts.length - 1];
}
