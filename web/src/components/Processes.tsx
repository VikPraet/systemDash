import { useEffect, useMemo, useRef, useState } from "react";
import { fetchProcesses, formatBytes } from "../api";
import type { ProcessInfo, ProcessList } from "../types";
import { ProcessIcon } from "./ProcessIcon";

const POLL_MS = 2000;

type SortKey = "name" | "pid" | "cpuPercent" | "memBytes" | "user";

export function Processes() {
  const [data, setData] = useState<ProcessList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpuPercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "apps" | "background">("all");
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetchProcesses(ctrl.signal);
        if (!cancelled) {
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
            </tr>
          </thead>
          <tbody>
            {filter !== "background" && apps.length > 0 && (
              <>
                <GroupRow label="Apps" count={apps.length} />
                {apps.map((p) => (
                  <Row key={p.pid} p={p} />
                ))}
              </>
            )}
            {filter !== "apps" && background.length > 0 && (
              <>
                <GroupRow label="Background processes" count={background.length} />
                {background.map((p) => (
                  <Row key={p.pid} p={p} />
                ))}
              </>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted proc-empty">
                  No matching processes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRow({ label, count }: { label: string; count: number }) {
  return (
    <tr className="proc-group">
      <td colSpan={5}>
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

function Row({ p }: { p: ProcessInfo }) {
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
    </tr>
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
