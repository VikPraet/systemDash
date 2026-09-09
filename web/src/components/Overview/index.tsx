import { useEffect, useMemo, useState } from "react";
import { formatBytes, formatUptime } from "../../api";
import type { DashRole, SystemSnapshot } from "../../types";
import { Bar, ChartEmptyCard, Gauge, LabeledBar, Stat, TemperatureReading } from "../widgets";
import { PublicAccess } from "../PublicAccess";
import { PowerControl } from "../PowerControl";
import { UsersActivityOverview } from "../Users";
import { UpdatesOverview } from "../SystemUpdates/UpdatesOverview";
import { AppUpdatesOverview } from "../SystemUpdates/AppUpdatesOverview";
import { DashboardGrid, type DashboardItem } from "../dashboard/DashboardGrid";
import {
  chartKey,
  EXTRA_OVERVIEW_WIDGETS,
  humanizePanelId,
  OVERVIEW_WIDGETS,
  widgetById,
} from "../dashboard/catalog";
import { useDashboardLayout } from "../../theme/DashboardContext";
import { useHistoryFeed } from "../History/useHistoryFeed";
import { buildHistoryCharts, makeTimeFmt } from "../History/charts";
import { Loading } from "../ui/styles";
import { WidgetSkeleton } from "../ui/Skeleton";
import * as S from "../../App.styles";
import * as HS from "../History/styles";

const ADMIN_ONLY: DashRole[] = ["admin"];

export function Overview({
  snap,
  error,
}: {
  snap: SystemSnapshot | null;
  error: string | null;
  showUpdates?: boolean;
}) {
  const { layouts, editMode } = useDashboardLayout();
  const extraIds = (layouts.overview ?? [])
    .map((i) => i.id)
    .filter((id) => !OVERVIEW_WIDGETS.some((w) => w.id === id));
  const needFeed = editMode || extraIds.some((id) => id.startsWith("chart:"));
  const feed = useHistoryFeed(needFeed);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullscreenId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenId]);

  const timeFmt = useMemo(() => makeTimeFmt(feed.range.ms), [feed.range.ms]);
  const chartsLoading = needFeed && !feed.data && !feed.error;

  if (!snap) {
    if (error) {
      return <Loading>Could not reach the backend: {error}</Loading>;
    }
    return <OverviewSkeleton extraIds={extraIds} />;
  }

  const { host, cpu, memory, disks, gpus } = snap;
  const fsProps = (id: string, fs: boolean) => ({
    onFullscreen: fs ? undefined : () => setFullscreenId(id),
    onExitFullscreen: fs ? () => setFullscreenId(null) : undefined,
  });
  const charts = buildHistoryCharts({
    data: feed.data,
    snap: feed.snap ?? snap,
    timeFmt,
    fsProps,
  });
  const fullscreenChart = fullscreenId
    ? charts.find((c) => c.id === fullscreenId || `chart:${c.id}` === fullscreenId)
    : null;

  const items: DashboardItem[] = [
    {
      id: "system",
      title: "System",
      minW: 4,
      minH: 2,
      default: { x: 0, y: 0, w: 12, h: 3 },
      node: (
        <S.Kv>
          <Stat label="Host" value={host.hostname} />
          <Stat label="OS" value={`${host.distro} ${host.release}`.trim()} />
          <Stat label="Kernel" value={host.kernel || "—"} />
          <Stat label="Architecture" value={host.arch} />
          <Stat label="Platform" value={host.platform} />
          <Stat
            label="Machine"
            value={
              [host.systemManufacturer, host.systemModel]
                .filter(Boolean)
                .join(" ") || "—"
            }
          />
          <Stat label="Uptime" value={formatUptime(host.uptimeSeconds)} />
        </S.Kv>
      ),
    },
  ];

  items.push(
    {
      id: "updates",
      title: "Updates",
      minW: 3,
      minH: 2,
      defaultRoles: ADMIN_ONLY,
      default: { x: 0, y: 3, w: 4, h: 3 },
      node: (
        <>
          <AppUpdatesOverview />
          <UpdatesOverview />
        </>
      ),
    },
    {
      id: "access",
      title: "Access",
      minW: 3,
      minH: 3,
      defaultRoles: ADMIN_ONLY,
      default: { x: 4, y: 3, w: 4, h: 5 },
      node: <PublicAccess />,
    },
    {
      id: "power",
      title: "Power",
      minW: 3,
      minH: 2,
      defaultRoles: ADMIN_ONLY,
      default: { x: 8, y: 3, w: 4, h: 4 },
      node: <PowerControl />,
    }
  );

  const row = 8;
  items.push(
    {
      id: "cpu",
      title: "CPU",
      minW: 3,
      minH: 4,
      default: { x: 0, y: row, w: 6, h: 6 },
      node: (
        <>
          <S.CardSplit>
            <Gauge value={cpu.loadPercent} label="load" />
            <S.Readouts>
              <S.Readout>
                <S.ReadoutValue>
                  {cpu.currentSpeedGHz.toFixed(2)}
                  <S.ReadoutUnit>GHz</S.ReadoutUnit>
                </S.ReadoutValue>
                <S.ReadoutLabel>current clock</S.ReadoutLabel>
              </S.Readout>
              <S.Readout>
                <S.ReadoutValue $sm>
                  {cpu.baseSpeedGHz.toFixed(2)}
                  <S.ReadoutUnit>GHz</S.ReadoutUnit>
                </S.ReadoutValue>
                <S.ReadoutLabel>base clock</S.ReadoutLabel>
              </S.Readout>
            </S.Readouts>
          </S.CardSplit>
          <S.Kv $tight>
            <Stat label="Model" value={`${cpu.manufacturer} ${cpu.brand}`} />
            <Stat
              label="Cores"
              value={`${cpu.physicalCores} physical / ${cpu.cores} logical`}
            />
          </S.Kv>
          {cpu.temperatureC !== null && (
            <S.Bars>
              <TemperatureReading value={cpu.temperatureC} />
            </S.Bars>
          )}
          {cpu.perCoreLoad.length > 0 && (
            <>
              <S.Subhead>Per-core load</S.Subhead>
              <S.Cores>
                {cpu.perCoreLoad.map((load, i) => (
                  <S.Core
                    key={i}
                    title={`Core ${i}: ${load}%${
                      cpu.perCoreSpeed[i]
                        ? ` · ${cpu.perCoreSpeed[i].toFixed(2)} GHz`
                        : ""
                    }`}
                  >
                    <S.CoreFill style={{ height: `${load}%` }} />
                  </S.Core>
                ))}
              </S.Cores>
            </>
          )}
        </>
      ),
    },
    {
      id: "memory",
      title: "Memory",
      minW: 3,
      minH: 3,
      default: { x: 6, y: row, w: 6, h: 6 },
      node: (
        <>
          <S.CardSplit>
            <Gauge value={memory.usedPercent} label="used" />
            <S.Readouts>
              <S.Readout>
                <S.ReadoutValue>{formatBytes(memory.usedBytes)}</S.ReadoutValue>
                <S.ReadoutLabel>of {formatBytes(memory.totalBytes)}</S.ReadoutLabel>
              </S.Readout>
            </S.Readouts>
          </S.CardSplit>
          <S.Bars>
            <LabeledBar
              label="RAM usage"
              value={memory.usedBytes}
              max={memory.totalBytes}
              valueText={`${formatBytes(memory.usedBytes)} / ${formatBytes(
                memory.totalBytes
              )}`}
            />
            {memory.swapTotalBytes > 0 && (
              <LabeledBar
                label="Swap usage"
                value={memory.swapUsedBytes}
                max={memory.swapTotalBytes}
                valueText={`${formatBytes(memory.swapUsedBytes)} / ${formatBytes(
                  memory.swapTotalBytes
                )}`}
              />
            )}
          </S.Bars>
          <S.Kv $tight>
            <Stat label="Available" value={formatBytes(memory.availableBytes)} />
          </S.Kv>
        </>
      ),
    },
    {
      id: "storage",
      title: "Storage",
      minW: 4,
      minH: 2,
      default: { x: 0, y: row + 6, w: 12, h: 4 },
      node: (
        <S.Disks>
          {disks.length === 0 && <div className="muted">No volumes reported.</div>}
          {disks.map((d) => (
            <S.Disk key={`${d.fs}-${d.mount}`}>
              <S.DiskHead>
                <S.DiskMount>{d.mount || d.fs}</S.DiskMount>
                <span className="muted">{d.type}</span>
              </S.DiskHead>
              <Bar value={d.usedPercent} />
              <S.DiskFoot className="muted">
                {formatBytes(d.usedBytes)} used · {formatBytes(d.availableBytes)} free
                · {formatBytes(d.sizeBytes)} total
              </S.DiskFoot>
            </S.Disk>
          ))}
        </S.Disks>
      ),
    },
    {
      id: "gpu",
      title: "GPU",
      minW: 4,
      minH: 3,
      default: { x: 0, y: row + 10, w: 12, h: 5 },
      node: (
        <S.Gpus>
          {gpus.length === 0 && <div className="muted">No GPU reported.</div>}
          {gpus.map((g, i) => {
            const hasBars =
              g.utilizationPercent !== null ||
              g.memoryTotalMb !== null ||
              g.temperatureC !== null;
            return (
              <S.Gpu key={i}>
                <S.GpuName>
                  {g.vendor} {g.model}
                </S.GpuName>
                {hasBars && (
                  <S.Bars>
                    {g.utilizationPercent !== null && (
                      <LabeledBar
                        label="Utilization"
                        value={g.utilizationPercent}
                        max={100}
                        valueText={`${g.utilizationPercent}%`}
                      />
                    )}
                    {g.memoryTotalMb !== null && (
                      <LabeledBar
                        label="Memory"
                        value={g.memoryUsedMb ?? 0}
                        max={g.memoryTotalMb}
                        valueText={`${g.memoryUsedMb ?? 0} / ${g.memoryTotalMb} MB`}
                      />
                    )}
                    {g.temperatureC !== null && (
                      <TemperatureReading value={g.temperatureC} />
                    )}
                  </S.Bars>
                )}
                <S.GpuMeta $tight>
                  {g.vramMb ? <Stat label="VRAM" value={`${g.vramMb} MB`} /> : null}
                  {g.clockCoreMhz !== null && (
                    <Stat label="Core clock" value={`${g.clockCoreMhz} MHz`} />
                  )}
                  {g.clockMemoryMhz !== null && (
                    <Stat label="Memory clock" value={`${g.clockMemoryMhz} MHz`} />
                  )}
                  {g.powerDrawW !== null && (
                    <Stat
                      label="Power"
                      value={
                        g.powerLimitW !== null
                          ? `${g.powerDrawW} / ${g.powerLimitW} W`
                          : `${g.powerDrawW} W`
                      }
                    />
                  )}
                  {g.fanPercent !== null && (
                    <Stat label="Fan" value={`${g.fanPercent}%`} />
                  )}
                </S.GpuMeta>
              </S.Gpu>
            );
          })}
        </S.Gpus>
      ),
    }
  );

  for (const id of extraIds) {
    const extra = EXTRA_OVERVIEW_WIDGETS.find((w) => w.id === id);
    if (extra?.id === "users") {
      items.push({
        id,
        title: extra.label,
        minW: extra.minW,
        minH: extra.minH,
        defaultRoles: extra.defaultRoles,
        default: extra.default,
        node: <UsersActivityOverview />,
      });
      continue;
    }
    const chart = charts.find((c) => c.id === chartKey(id));
    items.push({
      id,
      minW: 4,
      minH: 3,
      default: { x: 0, y: 0, w: 6, h: 4 },
      node: chart ? chart.render(false) : chartFallback(id, chartsLoading, feed.error),
    });
  }

  return (
    <>
      <DashboardGrid pageId="overview" items={items} />
      {fullscreenChart && (
        <HS.ChartFsOverlay
          role="dialog"
          aria-modal="true"
          onClick={() => setFullscreenId(null)}
        >
          <HS.ChartFsBody onClick={(e) => e.stopPropagation()}>
            {fullscreenChart.render(true)}
          </HS.ChartFsBody>
        </HS.ChartFsOverlay>
      )}
    </>
  );
}

/** What a chart panel shows before its first samples arrive, or when a metric
 *  never reports on this machine. Always framed as a card, never bare text. */
function chartFallback(id: string, loading: boolean, error: string | null) {
  const label = widgetById("overview", id)?.label ?? humanizePanelId(id);
  if (loading) return <WidgetSkeleton kind="chart" label={label} />;
  if (error) {
    return (
      <ChartEmptyCard title={label} message="History unavailable" hint={error} />
    );
  }
  return (
    <ChartEmptyCard
      title={label}
      hint="Either recording is off, or this machine doesn't report this metric."
    />
  );
}

function OverviewSkeleton({ extraIds }: { extraIds: string[] }) {
  const items: DashboardItem[] = OVERVIEW_WIDGETS.map((w) => ({
    id: w.id,
    title: w.label,
    minW: w.minW,
    minH: w.minH,
    defaultRoles: w.defaultRoles,
    default: w.default,
    node: <WidgetSkeleton kind={w.id} label={w.label} />,
  }));
  for (const id of extraIds) {
    const extra = EXTRA_OVERVIEW_WIDGETS.find((w) => w.id === id);
    if (extra) {
      items.push({
        id,
        title: extra.label,
        minW: extra.minW,
        minH: extra.minH,
        defaultRoles: extra.defaultRoles,
        default: extra.default,
        node: <WidgetSkeleton kind={extra.id} label={extra.label} />,
      });
      continue;
    }
    const label = widgetById("overview", id)?.label;
    items.push({
      id,
      minW: 4,
      minH: 3,
      default: { x: 0, y: 0, w: 6, h: 4 },
      node: <WidgetSkeleton kind="chart" label={label} />,
    });
  }
  return (
    <div role="status" aria-busy="true" aria-label="Loading system stats">
      <DashboardGrid pageId="overview" items={items} />
    </div>
  );
}
