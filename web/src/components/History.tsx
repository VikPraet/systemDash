import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearHistory,
  fetchHistory,
  fetchHistoryStats,
  fetchSettings,
  fetchSnapshot,
  formatBytes,
  formatDate,
  saveSettings,
} from "../api";
import { cache } from "../cache";
import type {
  HistorySeries,
  HistorySettings,
  HistoryStats,
  Settings,
  SystemSnapshot,
} from "../types";
import {
  Bar,
  ChartCard,
  TimeSeriesChart,
  type ChartSeries,
} from "./widgets";
import { useAuth, hasRole } from "../auth/AuthContext";

interface RangePreset {
  id: string;
  label: string;
  ms: number;
  points: number;
  refreshMs: number;
}

// `points` is sized so the chart bucket can reach the finest sample interval for
// short, "live" ranges (e.g. 5 min / 300 pts => 1s buckets), while longer ranges
// stay coarser to keep the payload small. `refreshMs` controls live polling.
const RANGES: RangePreset[] = [
  { id: "live", label: "Live", ms: 5 * 60_000, points: 300, refreshMs: 1_500 },
  { id: "15m", label: "15 min", ms: 15 * 60_000, points: 900, refreshMs: 2_000 },
  { id: "1h", label: "1 hour", ms: 60 * 60_000, points: 720, refreshMs: 5_000 },
  { id: "6h", label: "6 hours", ms: 6 * 3_600_000, points: 480, refreshMs: 15_000 },
  { id: "24h", label: "24 hours", ms: 24 * 3_600_000, points: 480, refreshMs: 30_000 },
  { id: "7d", label: "7 days", ms: 7 * 86_400_000, points: 500, refreshMs: 60_000 },
  { id: "30d", label: "30 days", ms: 30 * 86_400_000, points: 500, refreshMs: 120_000 },
];

const COLORS = {
  blue: "#4f8cff",
  green: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  purple: "#a78bfa",
  cyan: "#22d3ee",
};

function makeTimeFmt(spanMs: number) {
  if (spanMs <= 36 * 3_600_000) {
    return (ms: number) =>
      new Date(ms).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
  }
  return (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function hasAny(arr: (number | null)[]): boolean {
  return arr.some((v) => v != null);
}

/** Human-friendly chart bucket size, e.g. 1s / 5s / 2m / 1h. */
function formatResolution(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s resolution`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m resolution`;
  return `${Math.round(m / 60)}h resolution`;
}

function lastValue(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

/** A titled chart card with a device subtitle and live current-value legend. */
function MetricChart({
  title,
  subtitle,
  t,
  series,
  unit = "",
  yMin,
  yMax,
  formatValue,
  formatTime,
}: {
  title: string;
  subtitle?: string | null;
  t: number[];
  series: ChartSeries[];
  unit?: string;
  yMin?: number;
  yMax?: number;
  formatValue?: (n: number) => string;
  formatTime: (ms: number) => string;
}) {
  const fmt =
    formatValue ?? ((v: number) => `${Math.round(v * 10) / 10}${unit}`);
  const legend = series.map((s) => {
    const v = lastValue(s.data);
    return { label: s.label, color: s.color, value: v == null ? "—" : fmt(v) };
  });
  return (
    <ChartCard title={title} subtitle={subtitle} legend={legend}>
      <TimeSeriesChart
        t={t}
        series={series}
        unit={unit}
        yMin={yMin}
        yMax={yMax}
        formatValue={formatValue}
        formatTime={formatTime}
      />
    </ChartCard>
  );
}

export function History() {
  const { user } = useAuth();
  const canWrite = hasRole(user, "user");
  const [rangeId, setRangeId] = useState<string>(() => cache.history.rangeId);
  const [data, setData] = useState<HistorySeries | null>(() => cache.history.data);
  const [stats, setStats] = useState<HistoryStats | null>(
    () => cache.history.stats
  );
  const [snap, setSnap] = useState<SystemSnapshot | null>(() => cache.snapshot);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function selectRange(id: string) {
    cache.history.rangeId = id;
    setRangeId(id);
  }

  // Snapshot is only needed for hardware names (CPU/GPU model, RAM total), which
  // don't change while running — fetch it once.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchSnapshot(ctrl.signal)
      .then((s) => {
        cache.snapshot = s;
        setSnap(s);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const range = useMemo(
    () => RANGES.find((r) => r.id === rangeId) ?? RANGES[0],
    [rangeId]
  );
  const timeFmt = useMemo(() => makeTimeFmt(range.ms), [range.ms]);

  // The chart should never resolve finer than the configured sample interval,
  // otherwise buckets sit empty. Use it to cap chart points and to pace the live
  // poll so everything follows whatever interval is set in settings.
  const intervalSeconds = stats?.intervalSeconds ?? 5;

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const intervalMs = Math.max(1000, intervalSeconds * 1000);
    // Cap points so the bucket size is at least the sample interval.
    const points = Math.min(
      range.points,
      Math.max(2, Math.floor(range.ms / intervalMs))
    );
    // For the live view, poll at the sample cadence (clamped) instead of faster.
    const refreshMs =
      range.id === "live"
        ? Math.min(10_000, Math.max(1000, intervalMs))
        : range.refreshMs;

    async function load() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const now = Date.now();
        const [series, st] = await Promise.all([
          fetchHistory(now - range.ms, now, points, ctrl.signal),
          fetchHistoryStats(ctrl.signal),
        ]);
        if (!cancelled) {
          cache.history.data = series;
          cache.history.stats = st;
          setData(series);
          setStats(st);
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

    load();
    const id = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(id);
    };
  }, [range, intervalSeconds]);

  function refreshStats() {
    fetchHistoryStats()
      .then((st) => {
        cache.history.stats = st;
        setStats(st);
      })
      .catch(() => {});
  }

  const t = data?.t ?? [];

  const cpuName = snap ? `${snap.cpu.manufacturer} ${snap.cpu.brand}`.trim() : null;
  const memTotal = data?.memTotalBytes ?? snap?.memory.totalBytes ?? null;
  const memSubtitle = memTotal ? `${formatBytes(memTotal)} total` : null;
  const procSubtitle = snap?.host.hostname ?? null;

  function gpuName(index: number): string {
    const g = snap?.gpus[index];
    if (!g) return `GPU ${index}`;
    // systeminformation often repeats the vendor (e.g. "NVIDIA NVIDIA GeForce…"),
    // so collapse consecutive duplicate words.
    const name =
      `${g.vendor ?? ""} ${g.model ?? ""}`
        .trim()
        .split(/\s+/)
        .filter((w, i, a) => i === 0 || w.toLowerCase() !== a[i - 1].toLowerCase())
        .join(" ") || `GPU ${index}`;
    return g.vramMb ? `${name} · ${formatBytes(g.vramMb * 1024 * 1024)}` : name;
  }

  return (
    <div className="history">
      <div className="history-toolbar">
        <div className="seg">
          {RANGES.map((r) => (
            <button
              key={r.id}
              className={r.id === rangeId ? "active" : ""}
              onClick={() => selectRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {(stats || (data && t.length > 0)) && (
          <span className="history-meta muted">
            {stats && (
              <>
                Recording every {stats.intervalSeconds}s
                {!stats.enabled && " (paused)"}
              </>
            )}
            {data && t.length > 0 && (
              <>
                {stats ? " · " : ""}chart {formatResolution(data.bucketMs)} · {t.length}{" "}
                pts
              </>
            )}
          </span>
        )}
      </div>

      {error && <div className="history-error">Could not load history: {error}</div>}

      {stats && !stats.enabled && (
        <div className="history-notice">
          Recording is currently <strong>off</strong>. Enable it below to start
          collecting metrics.
        </div>
      )}

      <div className="grid">
        <MetricChart
          title="CPU Load"
          subtitle={cpuName}
          t={t}
          yMin={0}
          yMax={100}
          unit="%"
          formatTime={timeFmt}
          series={[{ label: "Load", color: COLORS.blue, data: data?.cpuLoad ?? [] }]}
        />

        {data && hasAny(data.cpuTemp) && (
          <MetricChart
            title="CPU Temperature"
            subtitle={cpuName}
            t={t}
            unit="°C"
            formatTime={timeFmt}
            series={[{ label: "Temp", color: COLORS.red, data: data.cpuTemp }]}
          />
        )}

        <MetricChart
          title="CPU Clock"
          subtitle={cpuName}
          t={t}
          formatTime={timeFmt}
          formatValue={(v) => `${v.toFixed(2)} GHz`}
          series={[
            { label: "Clock", color: COLORS.purple, data: data?.cpuClock ?? [] },
          ]}
        />

        <MetricChart
          title="Memory"
          subtitle={memSubtitle}
          t={t}
          yMin={0}
          yMax={100}
          unit="%"
          formatTime={timeFmt}
          series={[
            { label: "RAM", color: COLORS.green, data: data?.memUsedPct ?? [] },
            { label: "Swap", color: COLORS.amber, data: data?.swapUsedPct ?? [] },
          ]}
        />

        <MetricChart
          title="Processes"
          subtitle={procSubtitle}
          t={t}
          formatTime={timeFmt}
          formatValue={(v) => `${Math.round(v)}`}
          series={[
            { label: "Total", color: COLORS.cyan, data: data?.procCount ?? [] },
            { label: "Running", color: COLORS.blue, data: data?.procRunning ?? [] },
          ]}
        />

        {data?.gpus.map((g) => (
          <GpuCharts
            key={g.index}
            gpu={g}
            name={gpuName(g.index)}
            t={t}
            timeFmt={timeFmt}
          />
        ))}
      </div>

      <StoragePanel stats={stats} canWrite={canWrite} onChanged={refreshStats} />
    </div>
  );
}

function GpuCharts({
  gpu,
  name,
  t,
  timeFmt,
}: {
  gpu: HistorySeries["gpus"][number];
  name: string;
  t: number[];
  timeFmt: (ms: number) => string;
}) {
  const tag = `GPU ${gpu.index}`;
  return (
    <>
      {hasAny(gpu.util) && (
        <MetricChart
          title={`${tag} · Utilization`}
          subtitle={name}
          t={t}
          yMin={0}
          yMax={100}
          unit="%"
          formatTime={timeFmt}
          series={[{ label: "Util", color: COLORS.blue, data: gpu.util }]}
        />
      )}
      {hasAny(gpu.memUsedPct) && (
        <MetricChart
          title={`${tag} · Memory`}
          subtitle={name}
          t={t}
          yMin={0}
          yMax={100}
          unit="%"
          formatTime={timeFmt}
          series={[{ label: "VRAM", color: COLORS.green, data: gpu.memUsedPct }]}
        />
      )}
      {hasAny(gpu.temp) && (
        <MetricChart
          title={`${tag} · Temperature`}
          subtitle={name}
          t={t}
          unit="°C"
          formatTime={timeFmt}
          series={[{ label: "Temp", color: COLORS.red, data: gpu.temp }]}
        />
      )}
      {hasAny(gpu.clockCore) && (
        <MetricChart
          title={`${tag} · Clock`}
          subtitle={name}
          t={t}
          formatTime={timeFmt}
          formatValue={(v) => `${Math.round(v)} MHz`}
          series={[{ label: "Core", color: COLORS.purple, data: gpu.clockCore }]}
        />
      )}
      {hasAny(gpu.power) && (
        <MetricChart
          title={`${tag} · Power`}
          subtitle={name}
          t={t}
          formatTime={timeFmt}
          formatValue={(v) => `${Math.round(v)} W`}
          series={[{ label: "Power", color: COLORS.amber, data: gpu.power }]}
        />
      )}
    </>
  );
}

function StoragePanel({
  stats,
  canWrite,
  onChanged,
}: {
  stats: HistoryStats | null;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<HistorySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Seed the editable form from saved settings (cached first for instant paint).
  useEffect(() => {
    setDraft(cache.settings.history);
    fetchSettings()
      .then((s) => {
        cache.settings = s;
        setDraft(s.history);
      })
      .catch(() => {});
  }, []);

  if (!draft) return null;

  const dirty =
    !!stats &&
    (draft.enabled !== stats.enabled ||
      draft.intervalSeconds !== stats.intervalSeconds ||
      draft.retentionDays !== stats.retentionDays ||
      draft.maxSizeMb !== stats.maxSizeMb);

  async function save() {
    if (busy || !draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const next: Settings = { files: cache.settings.files, history: draft };
      const saved = await saveSettings(next);
      cache.settings = saved;
      setDraft(saved.history);
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
      await clearHistory();
      onChanged();
      setConfirmClear(false);
      setMsg("History cleared.");
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
    <section className="card storage-panel">
      <h2 className="card-title">Storage &amp; recording</h2>

      <div className="storage-grid">
        <div className="storage-stats">
          {stats ? (
            <>
              <div className="kv tight">
                <div className="stat">
                  <span className="stat-label">On disk</span>
                  <span className="stat-value">{formatBytes(stats.dbBytes)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Samples stored</span>
                  <span className="stat-value">
                    {stats.rowCount.toLocaleString()}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Per sample</span>
                  <span className="stat-value">
                    {stats.bytesPerSample > 0
                      ? formatBytes(stats.bytesPerSample)
                      : "—"}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Oldest record</span>
                  <span className="stat-value">{formatDate(stats.oldest)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Est. headroom</span>
                  <span className="stat-value">
                    {stats.estimatedDaysToFull != null
                      ? `~${stats.estimatedDaysToFull.toFixed(1)} days`
                      : "unlimited"}
                  </span>
                </div>
              </div>
              {stats.maxSizeMb > 0 && (
                <div className="storage-bar">
                  <Bar value={usedPct} />
                  <div className="muted storage-bar-foot">
                    {formatBytes(stats.dbBytes)} of {stats.maxSizeMb} MB cap (
                    {usedPct.toFixed(usedPct < 10 ? 1 : 0)}%)
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="muted">Loading storage stats…</div>
          )}
        </div>

        {canWrite && (
        <div className="storage-form">
          <button
            type="button"
            className="toggle-row"
            role="switch"
            aria-checked={draft.enabled}
            onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          >
            <span className="toggle-text">
              <span className="toggle-label">Record metrics</span>
              <span className="toggle-desc">
                Sample and store system stats in the background.
              </span>
            </span>
            <span className={`switch ${draft.enabled ? "on" : ""}`}>
              <span className="switch-knob" />
            </span>
          </button>

          <NumberField
            label="Sample interval"
            unit="seconds"
            min={1}
            max={3600}
            value={draft.intervalSeconds}
            onChange={(v) => setDraft({ ...draft, intervalSeconds: v })}
          />
          <NumberField
            label="Keep history for"
            unit="days (0 = no age limit)"
            min={0}
            max={3650}
            value={draft.retentionDays}
            onChange={(v) => setDraft({ ...draft, retentionDays: v })}
          />
          <NumberField
            label="Max database size"
            unit="MB (0 = no size limit)"
            min={0}
            max={1048576}
            value={draft.maxSizeMb}
            onChange={(v) => setDraft({ ...draft, maxSizeMb: v })}
          />

          <div className="storage-actions">
            <button
              type="button"
              className="modal-btn danger-ghost"
              onClick={() => setConfirmClear(true)}
              disabled={busy}
            >
              Clear history
            </button>
            <div className="storage-actions-right">
              {msg && <span className="storage-msg muted">{msg}</span>}
              <button
                type="button"
                className="modal-btn primary"
                onClick={save}
                disabled={busy || !dirty}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {confirmClear && (
        <div className="storage-confirm">
          <span>Permanently delete all recorded history?</span>
          <div className="storage-confirm-actions">
            <button
              type="button"
              className="modal-btn"
              onClick={() => setConfirmClear(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="modal-btn danger"
              onClick={doClear}
              disabled={busy}
            >
              Delete everything
            </button>
          </div>
        </div>
      )}
    </section>
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
    <label className="num-field">
      <span className="num-field-label">{label}</span>
      <span className="num-field-input">
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
        <span className="num-field-unit muted">{unit}</span>
      </span>
    </label>
  );
}
