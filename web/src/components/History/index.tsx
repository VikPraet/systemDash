import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearHistory,
  fetchHistory,
  fetchHistoryStats,
  fetchSettings,
  fetchSnapshot,
  formatBytes,
  formatDate,
  saveSettings,
} from "../../api";
import { cache } from "../../cache";
import type {
  HistorySeries,
  HistorySettings,
  HistoryStats,
  Settings,
  SystemSnapshot,
} from "../../types";
import {
  Bar,
  ChartCard,
  Stat,
  TimeSeriesChart,
  type ChartSeries,
} from "../widgets";
import { useAuth, hasRole } from "../../auth/AuthContext";
import { ModalBtn } from "../ui/styles";
import { CardTitle } from "../widgets/styles";
import * as S from "./styles";

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
  green: "#33c98e",
  amber: "#d6a23f",
  red: "#e86a6f",
  purple: "#a78bfa",
  cyan: "#22d3ee",
};

// Taller chart height used inside the fullscreen overlay.
const FS_HEIGHT = 460;

// A chart that can be toggled in the grid and blown up to fullscreen. `render`
// receives whether it's being drawn inside the fullscreen overlay so it can
// grow taller (and the CPU cores chart can offer its per-core split view).
interface ChartDescriptor {
  id: string;
  label: string;
  render: (fullscreen: boolean) => ReactNode;
}

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
  height,
  onFullscreen,
  onExitFullscreen,
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
  height?: number;
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
}) {
  const fmt =
    formatValue ?? ((v: number) => `${Math.round(v * 10) / 10}${unit}`);
  const legend = series.map((s) => {
    const v = lastValue(s.data);
    return { label: s.label, color: s.color, value: v == null ? "—" : fmt(v) };
  });
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      legend={legend}
      onFullscreen={onFullscreen}
      onExitFullscreen={onExitFullscreen}
    >
      <TimeSeriesChart
        t={t}
        series={series}
        unit={unit}
        yMin={yMin}
        yMax={yMax}
        height={height}
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
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(cache.history.hiddenCharts)
  );
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const inFlight = useRef(false);

  function selectRange(id: string) {
    cache.history.rangeId = id;
    setRangeId(id);
  }

  function toggleChart(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      cache.history.hiddenCharts = [...next];
      return next;
    });
  }

  // Allow Esc to leave the fullscreen overlay.
  useEffect(() => {
    if (!fullscreenId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenId]);

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

  // Standard fullscreen wiring: a maximize button in the grid, an X button while
  // already fullscreen. Centralized so every chart behaves identically.
  const fsProps = (id: string, fs: boolean) => ({
    onFullscreen: fs ? undefined : () => setFullscreenId(id),
    onExitFullscreen: fs ? () => setFullscreenId(null) : undefined,
  });

  const charts: ChartDescriptor[] = [];

  charts.push({
    id: "cpu-load",
    label: "CPU Load",
    render: (fs) => (
      <MetricChart
        title="CPU Load"
        subtitle={cpuName}
        t={t}
        yMin={0}
        yMax={100}
        unit="%"
        formatTime={timeFmt}
        height={fs ? FS_HEIGHT : undefined}
        {...fsProps("cpu-load", fs)}
        series={[{ label: "Load", color: COLORS.blue, data: data?.cpuLoad ?? [] }]}
      />
    ),
  });

  if (data?.cpuCores && data.cpuCores.length > 0) {
    const cores = data.cpuCores;
    charts.push({
      id: "cpu-cores",
      label: "CPU Cores",
      render: (fs) => (
        <CpuCoresChart
          cores={cores}
          name={cpuName}
          t={t}
          timeFmt={timeFmt}
          fullscreen={fs}
          {...fsProps("cpu-cores", fs)}
        />
      ),
    });
  }

  if (data && hasAny(data.cpuTemp)) {
    const cpuTemp = data.cpuTemp;
    charts.push({
      id: "cpu-temp",
      label: "CPU Temp",
      render: (fs) => (
        <MetricChart
          title="CPU Temperature"
          subtitle={cpuName}
          t={t}
          unit="°C"
          formatTime={timeFmt}
          height={fs ? FS_HEIGHT : undefined}
          {...fsProps("cpu-temp", fs)}
          series={[{ label: "Temp", color: COLORS.red, data: cpuTemp }]}
        />
      ),
    });
  }

  charts.push({
    id: "cpu-clock",
    label: "CPU Clock",
    render: (fs) => (
      <MetricChart
        title="CPU Clock"
        subtitle={cpuName}
        t={t}
        formatTime={timeFmt}
        formatValue={(v) => `${v.toFixed(2)} GHz`}
        height={fs ? FS_HEIGHT : undefined}
        {...fsProps("cpu-clock", fs)}
        series={[
          { label: "Clock", color: COLORS.purple, data: data?.cpuClock ?? [] },
        ]}
      />
    ),
  });

  charts.push({
    id: "memory",
    label: "Memory",
    render: (fs) => (
      <MetricChart
        title="Memory"
        subtitle={memSubtitle}
        t={t}
        yMin={0}
        yMax={100}
        unit="%"
        formatTime={timeFmt}
        height={fs ? FS_HEIGHT : undefined}
        {...fsProps("memory", fs)}
        series={[
          { label: "RAM", color: COLORS.green, data: data?.memUsedPct ?? [] },
          { label: "Swap", color: COLORS.amber, data: data?.swapUsedPct ?? [] },
        ]}
      />
    ),
  });

  charts.push({
    id: "processes",
    label: "Processes",
    render: (fs) => (
      <MetricChart
        title="Processes"
        subtitle={procSubtitle}
        t={t}
        formatTime={timeFmt}
        formatValue={(v) => `${Math.round(v)}`}
        height={fs ? FS_HEIGHT : undefined}
        {...fsProps("processes", fs)}
        series={[
          { label: "Total", color: COLORS.cyan, data: data?.procCount ?? [] },
          { label: "Running", color: COLORS.blue, data: data?.procRunning ?? [] },
        ]}
      />
    ),
  });

  for (const g of data?.gpus ?? []) {
    charts.push(...gpuDescriptors(g, gpuName(g.index), t, timeFmt, fsProps));
  }

  const visibleCharts = charts.filter((c) => !hidden.has(c.id));
  const fullscreenChart = fullscreenId
    ? charts.find((c) => c.id === fullscreenId)
    : null;

  return (
    <S.HistoryRoot>
      <S.HistoryToolbar>
        <S.Seg>
          {RANGES.map((r) => (
            <button
              key={r.id}
              className={r.id === rangeId ? "active" : ""}
              onClick={() => selectRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </S.Seg>
        {(stats || (data && t.length > 0)) && (
          <S.HistoryMeta className="muted">
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
          </S.HistoryMeta>
        )}
      </S.HistoryToolbar>

      {error && <S.HistoryError>Could not load history: {error}</S.HistoryError>}

      {stats && !stats.enabled && (
        <S.HistoryNotice>
          Recording is currently <strong>off</strong>. Enable it below to start
          collecting metrics.
        </S.HistoryNotice>
      )}

      {charts.length > 0 && (
        <S.ChartToggles>
          {charts.map((c) => {
            const on = !hidden.has(c.id);
            return (
              <S.ChartToggle
                key={c.id}
                type="button"
                $active={on}
                aria-pressed={on}
                onClick={() => toggleChart(c.id)}
              >
                {c.label}
              </S.ChartToggle>
            );
          })}
        </S.ChartToggles>
      )}

      <S.ChartGrid>
        {visibleCharts.map((c) => (
          <Fragment key={c.id}>{c.render(false)}</Fragment>
        ))}
      </S.ChartGrid>

      {visibleCharts.length === 0 && (
        <S.HistoryNotice>
          All charts are hidden. Use the toggles above to show them.
        </S.HistoryNotice>
      )}

      <StoragePanel stats={stats} canWrite={canWrite} onChanged={refreshStats} />

      {fullscreenChart && (
        <S.ChartFsOverlay
          role="dialog"
          aria-modal="true"
          onClick={() => setFullscreenId(null)}
        >
          <S.ChartFsBody onClick={(e) => e.stopPropagation()}>
            {fullscreenChart.render(true)}
          </S.ChartFsBody>
        </S.ChartFsOverlay>
      )}
    </S.HistoryRoot>
  );
}

// Spread hues starting near the brand blue so each core line stays distinct
// while keeping the overall chart in a cool, on-theme range.
function coreColor(index: number, total: number): string {
  const hue = (212 + (index * 360) / Math.max(1, total)) % 360;
  return `hsl(${hue}, 68%, 62%)`;
}

/**
 * CPU per-core history. In the grid it's a single multi-line chart; when
 * fullscreen the user can switch to a "Per core" grid that gives each core its
 * own mini chart, à la the Windows Task Manager logical-processor view.
 */
function CpuCoresChart({
  cores,
  name,
  t,
  timeFmt,
  fullscreen = false,
  onFullscreen,
  onExitFullscreen,
}: {
  cores: HistorySeries["cpuCores"];
  name: string | null;
  t: number[];
  timeFmt: (ms: number) => string;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
}) {
  const [view, setView] = useState<"combined" | "split">("combined");
  const series = useMemo<ChartSeries[]>(
    () =>
      cores.map((c) => ({
        label: `Core ${c.index}`,
        color: coreColor(c.index, cores.length),
        data: c.load,
      })),
    [cores]
  );
  if (cores.length === 0) return null;
  const subtitle = name
    ? `${cores.length} cores · ${name}`
    : `${cores.length} cores`;

  // The combined/per-core switch only makes sense with the extra room fullscreen
  // provides, so it's hidden in the compact grid view.
  const actions = fullscreen ? (
    <S.ChartViewSeg>
      <button
        type="button"
        className={view === "combined" ? "active" : ""}
        onClick={() => setView("combined")}
      >
        Combined
      </button>
      <button
        type="button"
        className={view === "split" ? "active" : ""}
        onClick={() => setView("split")}
      >
        Per core
      </button>
    </S.ChartViewSeg>
  ) : undefined;

  const showSplit = fullscreen && view === "split";

  return (
    <ChartCard
      title="CPU Cores"
      subtitle={subtitle}
      onFullscreen={onFullscreen}
      onExitFullscreen={onExitFullscreen}
      headerActions={actions}
    >
      {showSplit ? (
        <S.CoreGrid>
          {cores.map((c) => {
            const last = lastValue(c.load);
            const color = coreColor(c.index, cores.length);
            return (
              <S.CoreCell key={c.index}>
                <S.CoreCellHead>
                  <S.CoreCellName>
                    <S.CoreCellDot style={{ background: color }} />
                    Core {c.index}
                  </S.CoreCellName>
                  <S.CoreCellVal>
                    {last == null ? "—" : `${Math.round(last)}%`}
                  </S.CoreCellVal>
                </S.CoreCellHead>
                <TimeSeriesChart
                  t={t}
                  series={[{ label: `Core ${c.index}`, color, data: c.load }]}
                  unit="%"
                  yMin={0}
                  yMax={100}
                  height={104}
                  formatTime={timeFmt}
                />
              </S.CoreCell>
            );
          })}
        </S.CoreGrid>
      ) : (
        <TimeSeriesChart
          t={t}
          series={series}
          unit="%"
          yMin={0}
          yMax={100}
          fill={false}
          height={fullscreen ? FS_HEIGHT : undefined}
          formatTime={timeFmt}
        />
      )}
    </ChartCard>
  );
}

/** Build a toggleable/fullscreen descriptor per available GPU metric. */
function gpuDescriptors(
  gpu: HistorySeries["gpus"][number],
  name: string,
  t: number[],
  timeFmt: (ms: number) => string,
  fsProps: (
    id: string,
    fs: boolean
  ) => { onFullscreen?: () => void; onExitFullscreen?: () => void }
): ChartDescriptor[] {
  const tag = `GPU ${gpu.index}`;
  const out: ChartDescriptor[] = [];

  const add = (
    key: string,
    label: string,
    title: string,
    series: ChartSeries[],
    extra: {
      unit?: string;
      yMin?: number;
      yMax?: number;
      formatValue?: (v: number) => string;
    }
  ) => {
    const id = `gpu-${gpu.index}-${key}`;
    out.push({
      id,
      label: `${tag} · ${label}`,
      render: (fs) => (
        <MetricChart
          title={title}
          subtitle={name}
          t={t}
          formatTime={timeFmt}
          height={fs ? FS_HEIGHT : undefined}
          {...fsProps(id, fs)}
          {...extra}
          series={series}
        />
      ),
    });
  };

  if (hasAny(gpu.util)) {
    add("util", "Util", `${tag} · Utilization`, [
      { label: "Util", color: COLORS.blue, data: gpu.util },
    ], { unit: "%", yMin: 0, yMax: 100 });
  }
  if (hasAny(gpu.memUsedPct)) {
    add("mem", "Memory", `${tag} · Memory`, [
      { label: "VRAM", color: COLORS.green, data: gpu.memUsedPct },
    ], { unit: "%", yMin: 0, yMax: 100 });
  }
  if (hasAny(gpu.temp)) {
    add("temp", "Temp", `${tag} · Temperature`, [
      { label: "Temp", color: COLORS.red, data: gpu.temp },
    ], { unit: "°C" });
  }
  if (hasAny(gpu.clockCore)) {
    add("clock", "Clock", `${tag} · Clock`, [
      { label: "Core", color: COLORS.purple, data: gpu.clockCore },
    ], { formatValue: (v) => `${Math.round(v)} MHz` });
  }
  if (hasAny(gpu.power)) {
    add("power", "Power", `${tag} · Power`, [
      { label: "Power", color: COLORS.amber, data: gpu.power },
    ], { formatValue: (v) => `${Math.round(v)} W` });
  }

  return out;
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
      const next: Settings = { ...cache.settings, history: draft };
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
    <S.StoragePanel>
      <CardTitle as="h2">Storage &amp; recording</CardTitle>

      <S.StorageGrid>
        <S.StorageStats>
          {stats ? (
            <>
              <S.KvTight>
                <Stat label="On disk" value={formatBytes(stats.dbBytes)} />
                <Stat
                  label="Samples stored"
                  value={stats.rowCount.toLocaleString()}
                />
                <Stat
                  label="Per sample"
                  value={
                    stats.bytesPerSample > 0
                      ? formatBytes(stats.bytesPerSample)
                      : "—"
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
              </S.KvTight>
              {stats.maxSizeMb > 0 && (
                <S.StorageBar>
                  <Bar value={usedPct} />
                  <S.StorageBarFoot className="muted">
                    {formatBytes(stats.dbBytes)} of {stats.maxSizeMb} MB cap (
                    {usedPct.toFixed(usedPct < 10 ? 1 : 0)}%)
                  </S.StorageBarFoot>
                </S.StorageBar>
              )}
            </>
          ) : (
            <div className="muted">Loading storage stats…</div>
          )}
        </S.StorageStats>

        {canWrite && (
          <S.StorageForm>
            <S.ToggleRow
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
            >
              <S.ToggleText>
                <S.ToggleLabel>Record metrics</S.ToggleLabel>
                <S.ToggleDesc>
                  Sample and store system stats in the background.
                </S.ToggleDesc>
              </S.ToggleText>
              <S.Switch $on={draft.enabled}>
                <S.SwitchKnob />
              </S.Switch>
            </S.ToggleRow>

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

            <S.StorageActions>
              <ModalBtn
                type="button"
                $variant="danger-ghost"
                onClick={() => setConfirmClear(true)}
                disabled={busy}
              >
                Clear history
              </ModalBtn>
              <S.StorageActionsRight>
                {msg && <S.StorageMsg className="muted">{msg}</S.StorageMsg>}
                <ModalBtn
                  type="button"
                  $variant="primary"
                  onClick={save}
                  disabled={busy || !dirty}
                >
                  {busy ? "Saving…" : "Save"}
                </ModalBtn>
              </S.StorageActionsRight>
            </S.StorageActions>
          </S.StorageForm>
        )}
      </S.StorageGrid>

      {confirmClear && (
        <S.StorageConfirm>
          <span>Permanently delete all recorded history?</span>
          <S.StorageConfirmActions>
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
              onClick={doClear}
              disabled={busy}
            >
              Delete everything
            </ModalBtn>
          </S.StorageConfirmActions>
        </S.StorageConfirm>
      )}
    </S.StoragePanel>
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
    <S.NumField>
      <S.NumFieldLabel>{label}</S.NumFieldLabel>
      <S.NumFieldInput>
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
        <S.NumFieldUnit className="muted">{unit}</S.NumFieldUnit>
      </S.NumFieldInput>
    </S.NumField>
  );
}
