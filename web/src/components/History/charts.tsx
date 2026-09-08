import { useMemo, useState, type ReactNode } from "react";
import type { HistorySeries, SystemSnapshot } from "../../types";
import { formatBytes } from "../../api";
import {
  ChartCard,
  TimeSeriesChart,
  type ChartSeries,
} from "../widgets";
import * as S from "./styles";

export const CHART_COLORS = {
  blue: "#4f8cff",
  green: "#33c98e",
  amber: "var(--warn)",
  red: "#e86a6f",
  purple: "#a78bfa",
  cyan: "#22d3ee",
};

export const FS_HEIGHT = 460;

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
          height={fullscreen ? FS_HEIGHT : undefined}
          formatTime={timeFmt}
        />
      )}
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
        height={fs ? FS_HEIGHT : undefined}
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
          height={fs ? FS_HEIGHT : undefined}
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
        height={fs ? FS_HEIGHT : undefined}
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
        height={fs ? FS_HEIGHT : undefined}
        {...fsProps("memory", fs)}
        series={[
          { label: "RAM", color: CHART_COLORS.green, data: data?.memUsedPct ?? [] },
          { label: "Swap", color: CHART_COLORS.amber, data: data?.swapUsedPct ?? [] },
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
          height={fs ? FS_HEIGHT : undefined}
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
