import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Maximize2, X } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import * as S from "./styles";

export function Card({
  title,
  span = 1,
  children,
}: {
  title: string;
  span?: number;
  children: ReactNode;
}) {
  return (
    <S.CardRoot style={{ gridColumn: `span ${span}` }}>
      <S.CardTitle>{title}</S.CardTitle>
      {children}
    </S.CardRoot>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <S.StatRoot>
      <S.StatLabel>{label}</S.StatLabel>
      <S.StatValue>{value}</S.StatValue>
    </S.StatRoot>
  );
}

function colorFor(value: number): string {
  if (value >= 85) return "var(--bad)";
  if (value >= 60) return "var(--warn)";
  return "var(--good)";
}

export function Gauge({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = colorFor(clamped);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <S.GaugeRoot>
      <svg className="gauge-svg" viewBox="0 0 120 120">
        <circle className="gauge-track" cx="60" cy="60" r={radius} />
        <circle
          className="gauge-arc"
          cx="60"
          cy="60"
          r={radius}
          style={{
            stroke: color,
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <S.GaugeInner>
        <S.GaugeValue>{Math.round(clamped)}%</S.GaugeValue>
        <S.GaugeLabel>{label}</S.GaugeLabel>
      </S.GaugeInner>
    </S.GaugeRoot>
  );
}

export function Bar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <S.BarTrack>
      <S.BarFill style={{ width: `${clamped}%`, background: colorFor(clamped) }} />
    </S.BarTrack>
  );
}

export interface ChartSeries {
  label: string;
  color: string;
  data: (number | null)[];
}

/** Tracks the rendered width of an element so the SVG chart stays crisp. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function defaultTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Lightweight multi-series line chart drawn with plain SVG (no chart library).
 * Handles gaps (null values break the line), an auto/fixed y-range, horizontal
 * gridlines, and a hover tooltip that snaps to the nearest sample.
 */
export function TimeSeriesChart({
  t,
  series,
  height = 180,
  unit = "",
  yMin,
  yMax,
  fill = true,
  formatValue,
  formatTime = defaultTime,
}: {
  t: number[];
  series: ChartSeries[];
  height?: number;
  unit?: string;
  yMin?: number;
  yMax?: number;
  fill?: boolean;
  formatValue?: (n: number) => string;
  formatTime?: (ms: number) => string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  const padR = 12;
  const padT = 10;
  const padB = 22;
  const plotH = height - padT - padB;

  const hasData = t.length > 0 && series.some((s) => s.data.some((v) => v != null));

  const [lo, hi] = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const s of series) {
      for (const v of s.data) {
        if (v == null) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    if (!Number.isFinite(mn)) {
      mn = 0;
      mx = 1;
    }
    let lo = yMin != null ? yMin : mn;
    let hi = yMax != null ? yMax : mx;
    if (lo === hi) hi = lo + 1;
    if (yMin == null && yMax == null) {
      // Give a little vertical breathing room when auto-scaling.
      const pad = (hi - lo) * 0.08;
      lo -= pad;
      hi += pad;
      if (mn >= 0 && lo < 0) lo = 0;
    }
    return [lo, hi];
  }, [series, yMin, yMax]);

  const t0 = t[0] ?? 0;
  const tN = t[t.length - 1] ?? 1;
  const yFor = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;

  const ticks = useMemo(() => {
    const n = 4;
    const out: number[] = [];
    for (let i = 0; i <= n; i++) out.push(lo + ((hi - lo) * i) / n);
    return out;
  }, [lo, hi]);

  const fmt = (v: number) =>
    formatValue ? formatValue(v) : `${Math.round(v * 10) / 10}${unit}`;

  // Reserve room on the left for the widest y-axis label so longer ticks (e.g.
  // "3.97 GHz") aren't clipped — important now charts can be half-width.
  const maxTickChars = ticks.reduce((m, tk) => Math.max(m, fmt(tk).length), 0);
  const padL = Math.min(96, Math.max(40, Math.round(maxTickChars * 6.2) + 12));
  const w = Math.max(width, padL + padR + 10);
  const plotW = w - padL - padR;
  const xFor = (i: number) =>
    tN === t0 ? padL + plotW / 2 : padL + ((t[i] - t0) / (tN - t0)) * plotW;

  const baseline = padT + plotH;
  const fillOpacity = series.length > 1 ? 0.1 : 0.2;

  // Build line + area paths per series, breaking wherever data is missing so
  // gaps don't get bridged by a straight line.
  function buildPaths(data: (number | null)[]): {
    lines: string[];
    areas: string[];
    dots: Array<{ x: number; y: number }>;
  } {
    const lines: string[] = [];
    const areas: string[] = [];
    const dots: Array<{ x: number; y: number }> = [];
    let seg: Array<{ x: number; y: number }> = [];

    const flush = () => {
      if (seg.length === 0) return;
      if (seg.length === 1) {
        // A lone point can't form a line; mark it so it's still visible.
        dots.push(seg[0]);
        seg = [];
        return;
      }
      let line = `M${seg[0].x.toFixed(1)} ${seg[0].y.toFixed(1)}`;
      for (let i = 1; i < seg.length; i++) {
        line += ` L${seg[i].x.toFixed(1)} ${seg[i].y.toFixed(1)}`;
      }
      lines.push(line);
      let area = `M${seg[0].x.toFixed(1)} ${baseline.toFixed(1)} L${seg[0].x.toFixed(
        1
      )} ${seg[0].y.toFixed(1)}`;
      for (let i = 1; i < seg.length; i++) {
        area += ` L${seg[i].x.toFixed(1)} ${seg[i].y.toFixed(1)}`;
      }
      area += ` L${seg[seg.length - 1].x.toFixed(1)} ${baseline.toFixed(1)} Z`;
      areas.push(area);
      seg = [];
    };

    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v == null) {
        flush();
        continue;
      }
      seg.push({ x: xFor(i), y: yFor(v) });
    }
    flush();
    return { lines, areas, dots };
  }

  function onMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (!hasData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (tN === t0) {
      setHover(0);
      return;
    }
    const frac = Math.max(0, Math.min(1, (x - padL) / plotW));
    const targetT = t0 + frac * (tN - t0);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < t.length; i++) {
      const d = Math.abs(t[i] - targetT);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  }

  const hoverX = hover != null ? xFor(hover) : 0;
  const tooltipRight = hover != null && hoverX > padL + plotW * 0.6;

  return (
    <S.ChartRoot ref={ref} style={{ height }}>
      {!hasData && <div className="chart-empty muted">No data yet</div>}
      {hasData && width > 0 && (
        <div
          className="chart-surface"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg width={w} height={height} role="img">
            <defs>
              {series.map((s, i) => (
                <linearGradient
                  key={i}
                  id={`${uid}-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={s.color} stopOpacity={fillOpacity} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((tk, i) => (
              <g key={i}>
                <line
                  className="chart-grid"
                  x1={padL}
                  x2={w - padR}
                  y1={yFor(tk)}
                  y2={yFor(tk)}
                />
                <text className="chart-axis" x={padL - 6} y={yFor(tk) + 3}>
                  {fmt(tk)}
                </text>
              </g>
            ))}
            <text className="chart-axis chart-axis-x" x={padL} y={height - 6}>
              {formatTime(t0)}
            </text>
            <text
              className="chart-axis chart-axis-x"
              x={w - padR}
              y={height - 6}
              textAnchor="end"
            >
              {formatTime(tN)}
            </text>

            {series.map((s, i) => {
              const { lines, areas, dots } = buildPaths(s.data);
              return (
                <g key={s.label}>
                  {fill &&
                    areas.map((d, j) => (
                      <path key={`a${j}`} d={d} fill={`url(#${uid}-${i})`} />
                    ))}
                  {lines.map((d, j) => (
                    <path
                      key={`l${j}`}
                      className="chart-line"
                      d={d}
                      style={{ stroke: s.color }}
                    />
                  ))}
                  {dots.map((p, j) => (
                    <circle
                      key={`d${j}`}
                      className="chart-dot"
                      cx={p.x}
                      cy={p.y}
                      r={2.5}
                      style={{ fill: s.color }}
                    />
                  ))}
                </g>
              );
            })}

            {hover != null && (
              <>
                <line
                  className="chart-cursor"
                  x1={hoverX}
                  x2={hoverX}
                  y1={padT}
                  y2={padT + plotH}
                />
                {series.map((s) => {
                  const v = s.data[hover];
                  if (v == null) return null;
                  return (
                    <g key={s.label}>
                      <circle
                        className="chart-dot-halo"
                        cx={hoverX}
                        cy={yFor(v)}
                        r={6}
                        style={{ fill: s.color }}
                      />
                      <circle
                        className="chart-dot"
                        cx={hoverX}
                        cy={yFor(v)}
                        r={3.5}
                        style={{ fill: s.color }}
                      />
                    </g>
                  );
                })}
              </>
            )}
          </svg>

          {hover != null && (
            <div
              className="chart-tooltip"
              style={
                tooltipRight ? { right: w - hoverX + 8 } : { left: hoverX + 8 }
              }
            >
              <div className="chart-tooltip-time">{formatTime(t[hover])}</div>
              {series.map((s) => {
                const v = s.data[hover];
                return (
                  <div key={s.label} className="chart-tooltip-row">
                    <span
                      className="chart-tooltip-swatch"
                      style={{ background: s.color }}
                    />
                    <span className="chart-tooltip-label">{s.label}</span>
                    <span className="chart-tooltip-value">
                      {v == null ? "—" : fmt(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </S.ChartRoot>
  );
}

export interface ChartLegendItem {
  label: string;
  color: string;
  value?: string;
}

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  span = 1,
  onFullscreen,
  onExitFullscreen,
  headerActions,
}: {
  title: string;
  subtitle?: string | null;
  legend?: ChartLegendItem[];
  children: ReactNode;
  span?: number;
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
  headerActions?: ReactNode;
}) {
  return (
    <S.ChartCardRoot
      className="chart-card"
      style={{ gridColumn: `span ${span}` }}
    >
      <S.ChartCardHead>
        <S.ChartCardTitles>
          <S.CardTitle as="h2">{title}</S.CardTitle>
          {subtitle && (
            <S.ChartCardSubtitle title={subtitle}>{subtitle}</S.ChartCardSubtitle>
          )}
        </S.ChartCardTitles>
        <S.ChartCardRight>
          {legend && legend.length > 0 && (
            <S.ChartLegend>
              {legend.map((s) => (
                <S.ChartLegendItemEl key={s.label}>
                  <S.ChartLegendSwatch style={{ background: s.color }} />
                  <S.ChartLegendLabel>{s.label}</S.ChartLegendLabel>
                  {s.value != null && (
                    <S.ChartLegendValue>{s.value}</S.ChartLegendValue>
                  )}
                </S.ChartLegendItemEl>
              ))}
            </S.ChartLegend>
          )}
          {(headerActions || onFullscreen || onExitFullscreen) && (
            <S.ChartCardActions>
              {headerActions}
              {onFullscreen && (
                <Tooltip label="Fullscreen">
                  <S.ChartIconBtn
                    type="button"
                    onClick={onFullscreen}
                    aria-label="Fullscreen"
                  >
                    <Maximize2 size={15} />
                  </S.ChartIconBtn>
                </Tooltip>
              )}
              {onExitFullscreen && (
                <Tooltip label="Close">
                  <S.ChartIconBtn
                    type="button"
                    onClick={onExitFullscreen}
                    aria-label="Close fullscreen"
                  >
                    <X size={16} />
                  </S.ChartIconBtn>
                </Tooltip>
              )}
            </S.ChartCardActions>
          )}
        </S.ChartCardRight>
      </S.ChartCardHead>
      {children}
    </S.ChartCardRoot>
  );
}

export function LabeledBar({
  label,
  value,
  max,
  valueText,
}: {
  label: string;
  value: number;
  max: number;
  valueText: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <S.LBarRoot>
      <S.LBarHead>
        <S.LBarLabel>{label}</S.LBarLabel>
        <S.LBarValue>{valueText}</S.LBarValue>
      </S.LBarHead>
      <S.BarTrack>
        <S.BarFill style={{ width: `${percent}%`, background: colorFor(percent) }} />
      </S.BarTrack>
    </S.LBarRoot>
  );
}

function temperatureColor(celsius: number): string {
  if (celsius >= 90) return "var(--bad)";
  if (celsius >= 75) return "var(--warn)";
  if (celsius >= 55) return "var(--accent)";
  return "var(--good)";
}

export function TemperatureReading({
  label = "Temperature",
  value,
}: {
  label?: string;
  value: number;
}) {
  const color = temperatureColor(value);
  return (
    <S.LBarRoot>
      <S.LBarHead>
        <S.LBarLabel>{label}</S.LBarLabel>
        <S.LBarValue style={{ color, fontWeight: 600 }}>{value} °C</S.LBarValue>
      </S.LBarHead>
    </S.LBarRoot>
  );
}
