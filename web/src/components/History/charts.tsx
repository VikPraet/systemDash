import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ByteUnit, HistorySeries, NetUsageSeries, SystemSnapshot } from "../../types";
import { fetchNetUsage, formatBytes } from "../../api";
import {
  ChartCard,
  TimeSeriesChart,
  type ChartSeries,
} from "../widgets";
import { UsageBarChart } from "../widgets/UsageBarChart";
import * as S from "./styles";

export const CHART_COLORS = {
  blue: "#4f8cff",
  green: "#33c98e",
  amber: "var(--warn)",
  red: "#e86a6f",
  purple: "#a78bfa",
  cyan: "#22d3ee",
};

export interface ChartDescriptor {
  id: string;
  label: string;
  render: (fullscreen: boolean) => ReactNode;
}

export function makeTimeFmt(spanMs: number) {
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

export function hasAny(arr: (number | null)[]): boolean {
  return arr.some((v) => v != null);
}

export function formatResolution(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s resolution`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m resolution`;
  return `${Math.round(m / 60)}h resolution`;
}

export function lastValue(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return null;
}

function coreColor(index: number, total: number): string {
  const hue = (212 + (index * 360) / Math.max(1, total)) % 360;
  return `hsl(${hue}, 68%, 62%)`;
}

export function gpuName(snap: SystemSnapshot | null, index: number): string {
  const g = snap?.gpus[index];
  if (!g) return `GPU ${index}`;
  const name =
    `${g.vendor ?? ""} ${g.model ?? ""}`
      .trim()
      .split(/\s+/)
      .filter((w, i, a) => i === 0 || w.toLowerCase() !== a[i - 1].toLowerCase())
      .join(" ") || `GPU ${index}`;
  return g.vramMb ? `${name} · ${formatBytes(g.vramMb * 1024 * 1024)}` : name;
}

export function MetricChart({
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
  const fmt = formatValue ?? ((v: number) => `${Math.round(v * 10) / 10}${unit}`);
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

export function CpuCoresChart({
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
  const subtitle = name ? `${cores.length} cores · ${name}` : `${cores.length} cores`;
  const actions = fullscreen ? (
    <S.ChartViewSeg>
      <button type="button" className={view === "combined" ? "active" : ""} onClick={() => setView("combined")}>
        Combined
      </button>
      <button type="button" className={view === "split" ? "active" : ""} onClick={() => setView("split")}>
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
                  <S.CoreCellVal>{last == null ? "—" : `${Math.round(last)}%`}</S.CoreCellVal>
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
          formatTime={timeFmt}
        />
      )}
    </ChartCard>
  );
}

type DiskPlot = {
  id: string;
  label: string;
  readBps: (number | null)[];
  writeBps: (number | null)[];
};

export function DiskIoChart({
  disks,
  totalRead,
  totalWrite,
  t,
  timeFmt,
  onFullscreen,
  onExitFullscreen,
}: {
  disks: DiskPlot[];
  totalRead: (number | null)[];
  totalWrite: (number | null)[];
  t: number[];
  timeFmt: (ms: number) => string;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
}) {
  const rate = (v: number) => `${formatBytes(Math.round(Math.max(0, v)))}/s`;
  const plots: DiskPlot[] =
    disks.length > 0
      ? disks
      : hasAny(totalRead) || hasAny(totalWrite)
        ? [{ id: "total", label: "Total", readBps: totalRead, writeBps: totalWrite }]
        : [];
  if (plots.length === 0) return null;

  const subtitle =
    plots.length > 1
      ? plots.map((d) => d.label).join(" · ")
      : plots[0]?.label ?? "Read and write";

  return (
    <ChartCard
      title="Disk"
      subtitle={subtitle}
      onFullscreen={onFullscreen}
      onExitFullscreen={onExitFullscreen}
    >
      <S.DiskStack>
        {plots.map((disk) => {
          const read = lastValue(disk.readBps);
          const write = lastValue(disk.writeBps);
          return (
            <S.DiskCell key={disk.id}>
              <S.DiskCellHead>
                <S.DiskCellName>{disk.label}</S.DiskCellName>
                <S.DiskCellRates>
                  <span>
                    <em>R</em>
                    {read == null ? "—" : rate(read)}
                  </span>
                  <span>
                    <em>W</em>
                    {write == null ? "—" : rate(write)}
                  </span>
                </S.DiskCellRates>
              </S.DiskCellHead>
              <TimeSeriesChart
                t={t}
                yMin={0}
                formatTime={timeFmt}
                formatValue={rate}
                series={[
                  { label: "Read", color: CHART_COLORS.cyan, data: disk.readBps },
                  { label: "Write", color: CHART_COLORS.amber, data: disk.writeBps },
                ]}
              />
            </S.DiskCell>
          );
        })}
      </S.DiskStack>
    </ChartCard>
  );
}

export function buildHistoryCharts({
  data,
  snap,
  timeFmt,
  fsProps,
}: {
  data: HistorySeries | null;
  snap: SystemSnapshot | null;
  timeFmt: (ms: number) => string;
  fsProps: (id: string, fs: boolean) => { onFullscreen?: () => void; onExitFullscreen?: () => void };
}): ChartDescriptor[] {
  const t = data?.t ?? [];
  const cpuName = snap ? `${snap.cpu.manufacturer} ${snap.cpu.brand}`.trim() : null;
  const memTotal = data?.memTotalBytes ?? snap?.memory.totalBytes ?? null;
  const memSubtitle = memTotal ? `${formatBytes(memTotal)} total` : null;
  const procSubtitle = snap?.host.hostname ?? null;
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
        {...fsProps("cpu-load", fs)}
        series={[{ label: "Load", color: CHART_COLORS.blue, data: data?.cpuLoad ?? [] }]}
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
          {...fsProps("cpu-temp", fs)}
          series={[{ label: "Temp", color: CHART_COLORS.red, data: cpuTemp }]}
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
        {...fsProps("cpu-clock", fs)}
        series={[{ label: "Clock", color: CHART_COLORS.purple, data: data?.cpuClock ?? [] }]}
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
        {...fsProps("memory", fs)}
        series={[
          { label: "RAM", color: CHART_COLORS.green, data: data?.memUsedPct ?? [] },
          { label: "Swap", color: CHART_COLORS.amber, data: data?.swapUsedPct ?? [] },
        ]}
      />
    ),
  });

  const rate = (v: number) => `${formatBytes(Math.round(Math.max(0, v)))}/s`;
  const diskRows: DiskPlot[] =
    data?.disks && data.disks.length > 0
      ? data.disks
      : hasAny(data?.diskReadBps ?? []) || hasAny(data?.diskWriteBps ?? [])
        ? [
            {
              id: "total",
              label: "Total",
              readBps: data?.diskReadBps ?? [],
              writeBps: data?.diskWriteBps ?? [],
            },
          ]
        : [];

  if (diskRows.length > 0) {
    charts.push({
      id: "disk-io",
      label: "Disk",
      render: (fs) => (
        <DiskIoChart
          disks={diskRows}
          totalRead={data?.diskReadBps ?? []}
          totalWrite={data?.diskWriteBps ?? []}
          t={t}
          timeFmt={timeFmt}
          fullscreen={fs}
          {...fsProps("disk-io", fs)}
        />
      ),
    });
  }

  charts.push({
    id: "network",
    label: "Network",
    render: (fs) => (
      <MetricChart
        title="Network"
        subtitle="Physical adapters"
        t={t}
        yMin={0}
        formatTime={timeFmt}
        formatValue={rate}
        {...fsProps("network", fs)}
        series={[
          { label: "Receive", color: CHART_COLORS.green, data: data?.netRxBps ?? [] },
          { label: "Send", color: CHART_COLORS.blue, data: data?.netTxBps ?? [] },
        ]}
      />
    ),
  });

  const usageFrom = data?.from ?? Date.now() - 3_600_000;
  const usageTo = data?.to ?? Date.now();
  charts.push({
    id: "net-usage",
    label: "Data transferred",
    render: (fs) => (
      <NetUsageHistoryCard
        from={usageFrom}
        to={usageTo}
        {...fsProps("net-usage", fs)}
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
        {...fsProps("processes", fs)}
        series={[
          { label: "Total", color: CHART_COLORS.cyan, data: data?.procCount ?? [] },
          { label: "Running", color: CHART_COLORS.blue, data: data?.procRunning ?? [] },
        ]}
      />
    ),
  });

  for (const g of data?.gpus ?? []) {
    charts.push(...gpuDescriptors(g, gpuName(snap, g.index), t, timeFmt, fsProps));
  }

  return charts;
}

function gpuDescriptors(
  gpu: HistorySeries["gpus"][number],
  name: string,
  t: number[],
  timeFmt: (ms: number) => string,
  fsProps: (id: string, fs: boolean) => { onFullscreen?: () => void; onExitFullscreen?: () => void }
): ChartDescriptor[] {
  const tag = `GPU ${gpu.index}`;
  const out: ChartDescriptor[] = [];
  const add = (
    key: string,
    label: string,
    title: string,
    series: ChartSeries[],
    extra: { unit?: string; yMin?: number; yMax?: number; formatValue?: (v: number) => string }
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
          {...fsProps(id, fs)}
          {...extra}
          series={series}
        />
      ),
    });
  };

  if (hasAny(gpu.util)) {
    add("util", "Util", `${tag} · Utilization`, [{ label: "Util", color: CHART_COLORS.blue, data: gpu.util }], {
      unit: "%",
      yMin: 0,
      yMax: 100,
    });
  }
  if (hasAny(gpu.memUsedPct)) {
    add("mem", "Memory", `${tag} · Memory`, [{ label: "VRAM", color: CHART_COLORS.green, data: gpu.memUsedPct }], {
      unit: "%",
      yMin: 0,
      yMax: 100,
    });
  }
  if (hasAny(gpu.temp)) {
    add("temp", "Temp", `${tag} · Temperature`, [{ label: "Temp", color: CHART_COLORS.red, data: gpu.temp }], {
      unit: "°C",
    });
  }
  if (hasAny(gpu.clockCore)) {
    add("clock", "Clock", `${tag} · Clock`, [{ label: "Core", color: CHART_COLORS.purple, data: gpu.clockCore }], {
      formatValue: (v) => `${Math.round(v)} MHz`,
    });
  }
  if (hasAny(gpu.power)) {
    add("power", "Power", `${tag} · Power`, [{ label: "Power", color: CHART_COLORS.amber, data: gpu.power }], {
      formatValue: (v) => `${Math.round(v)} W`,
    });
  }
  return out;
}

const UNIT_KEY = "beacon.netUsageUnit";
const UNIT_OPTS: ByteUnit[] = ["auto", "KB", "MB", "GB"];

function readUnit(): ByteUnit {
  try {
    const v = localStorage.getItem(UNIT_KEY);
    if (v && (UNIT_OPTS as string[]).includes(v)) return v as ByteUnit;
  } catch {
    /* ignore */
  }
  return "auto";
}

function formatUsageTime(ms: number, bucketMs: number): string {
  const d = new Date(ms);
  if (bucketMs >= 86_400_000) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NetUsageHistoryCard({
  from,
  to,
  onFullscreen,
  onExitFullscreen,
}: {
  from: number;
  to: number;
  height?: number;
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
}) {
  const [unit, setUnit] = useState<ByteUnit>(() => readUnit());
  const [series, setSeries] = useState<NetUsageSeries | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bucket = useMemo(
    () => (to - from > 48 * 3_600_000 ? "day" : "hour"),
    [from, to]
  );

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    fetchNetUsage(from, to, bucket, ctrl.signal)
      .then((next) => {
        if (!cancelled) {
          setSeries(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled && (err as Error)?.name !== "AbortError") {
          setError((err as Error)?.message || "Failed to load");
        }
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [from, to, bucket]);

  function pickUnit(u: ByteUnit) {
    setUnit(u);
    try {
      localStorage.setItem(UNIT_KEY, u);
    } catch {
      /* ignore */
    }
  }

  const subtitle =
    bucket === "day" ? "Daily totals · physical adapters" : "Hourly totals · physical adapters";

  return (
    <ChartCard
      title="Data transferred"
      subtitle={subtitle}
      onFullscreen={onFullscreen}
      onExitFullscreen={onExitFullscreen}
    >
      <S.UsageUnitRow>
        {UNIT_OPTS.map((u) => (
          <S.UsageUnitChip
            key={u}
            type="button"
            $active={unit === u}
            onClick={() => pickUnit(u)}
          >
            {u === "auto" ? "Auto" : u}
          </S.UsageUnitChip>
        ))}
      </S.UsageUnitRow>
      {error ? (
        <S.ChartNote>Could not load usage: {error}</S.ChartNote>
      ) : (
        <UsageBarChart
          data={series}
          unit={unit}
          formatTime={formatUsageTime}
          emptyLabel="Usage appears after the history recorder has run"
        />
      )}
    </ChartCard>
  );
}

