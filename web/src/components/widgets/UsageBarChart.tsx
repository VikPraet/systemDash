import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "../../api";
import type { ByteUnit, NetUsageSeries } from "../../types";
import styled, { css } from "styled-components";
import * as S from "./styles";

export const USAGE_RX_COLOR = "#33c98e";
export const USAGE_TX_COLOR = "#4f8cff";

function useElementSize<T extends HTMLElement>(active = true) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const apply = (width: number, height: number) => {
      const w = Math.max(0, Math.round(width));
      const h = Math.max(0, Math.round(height));
      setSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
    };
    apply(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = e.borderBoxSize?.[0];
        if (box) apply(box.inlineSize, box.blockSize);
        else apply(e.contentRect.width, e.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  return [ref, size] as const;
}

export function UsageBarChart({
  data,
  unit = "auto",
  height,
  formatTime,
  emptyLabel = "No usage recorded yet",
}: {
  data: NetUsageSeries | null;
  unit?: ByteUnit;
  /** Lock plot height in px. Omit to fill the parent. */
  height?: number;
  formatTime: (ms: number, bucketMs: number) => string;
  emptyLabel?: string;
}) {
  const fillParent = height == null;
  const [hover, setHover] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState<CSSProperties | null>(null);

  const bars = useMemo(() => {
    if (!data || data.t.length === 0) return [];
    return data.t.map((t, i) => ({
      t,
      rx: data.rxBytes[i] ?? 0,
      tx: data.txBytes[i] ?? 0,
      total: data.totalBytes[i] ?? 0,
    }));
  }, [data]);

  const totals = useMemo(() => {
    let rx = 0;
    let tx = 0;
    for (const b of bars) {
      rx += b.rx;
      tx += b.tx;
    }
    return { rx, tx, total: rx + tx };
  }, [bars]);

  const maxTotal = Math.max(1, ...bars.map((b) => b.total));
  const hasTraffic = totals.total > 0;
  const [surfaceRef, size] = useElementSize<HTMLDivElement>(
    bars.length > 0 && hasTraffic
  );

  const padL = 52;
  const padR = 8;
  const padT = 8;
  const padB = 28;
  const resolvedH = height ?? (size.height > 0 ? size.height : 160);
  const resolvedW = size.width > 0 ? size.width : 320;
  const plotH = Math.max(40, resolvedH - padT - padB);
  const plotW = Math.max(10, resolvedW - padL - padR);
  const n = Math.max(1, bars.length);
  const bucketMs = data?.bucketMs ?? 3_600_000;
  const slot = plotW / n;

  function barLayout(i: number) {
    const gap = Math.min(6, slot * 0.2);
    const bw = Math.max(2, slot - gap);
    const x = padL + i * slot + gap / 2;
    return { gap, bw, x, slotX: padL + i * slot };
  }

  function placeTip(surface: HTMLElement, index: number) {
    const rect = surface.getBoundingClientRect();
    const { x, bw, slotX } = barLayout(index);
    const tipW = 188;
    const tipH = 86;
    const gap = 12;
    const mid = rect.left + x + bw / 2;
    const slotLeft = rect.left + slotX;
    const slotRight = slotLeft + slot;

    // Prefer above the chart so the tip never covers the hovered bar.
    let top = rect.top - tipH - gap;
    let left: number | undefined;
    let right: number | undefined;

    if (top >= 8) {
      left = Math.min(
        window.innerWidth - tipW - 8,
        Math.max(8, mid - tipW / 2)
      );
    } else {
      // Not enough room above — park beside the slot, outside the bar column.
      top = Math.max(8, rect.top + padT);
      const preferRight = mid < window.innerWidth / 2;
      if (preferRight && slotRight + gap + tipW < window.innerWidth - 8) {
        left = slotRight + gap;
      } else if (slotLeft - gap - tipW > 8) {
        right = window.innerWidth - slotLeft + gap;
      } else {
        left = Math.min(
          window.innerWidth - tipW - 8,
          Math.max(8, mid + gap)
        );
      }
    }

    setTipPos({
      top,
      ...(left != null ? { left } : {}),
      ...(right != null ? { right } : {}),
      maxHeight: window.innerHeight - top - 8,
    });
  }

  function onMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (!hasTraffic || bars.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // Ignore moves over the y-axis gutter.
    if (x < padL) {
      setHover(null);
      setTipPos(null);
      return;
    }
    const idx = Math.max(
      0,
      Math.min(n - 1, Math.floor((x - padL) / slot))
    );
    setHover(idx);
    placeTip(e.currentTarget, idx);
  }

  if (bars.length === 0 || !hasTraffic) {
    return (
      <Root $fill={fillParent}>
        <Empty>{emptyLabel}</Empty>
      </Root>
    );
  }

  const active = hover != null ? bars[hover] : null;
  const surfaceStyle =
    height != null ? ({ height: resolvedH } as CSSProperties) : undefined;

  return (
    <Root $fill={fillParent}>
      <Surface
        ref={surfaceRef}
        style={surfaceStyle}
        $fixed={height != null}
        onMouseMove={onMove}
        onMouseLeave={() => {
          setHover(null);
          setTipPos(null);
        }}
      >
        {resolvedW > 0 && (
          <svg
            width={resolvedW}
            height={resolvedH}
            viewBox={`0 0 ${resolvedW} ${resolvedH}`}
            role="img"
            aria-label="Network data usage over time"
          >
            {[0.25, 0.5, 0.75, 1].map((f) => {
              const y = padT + plotH * (1 - f);
              return (
                <line
                  key={f}
                  className="grid"
                  x1={padL}
                  x2={resolvedW - padR}
                  y1={y}
                  y2={y}
                />
              );
            })}
            <text className="axis" x={padL - 6} y={padT + 4} textAnchor="end">
              {formatBytes(maxTotal, unit)}
            </text>
            {/* Skip drawing "0 B" on the baseline — it collides with x labels / legend. */}

            {hover != null && (
              <rect
                className="hover-band"
                x={barLayout(hover).slotX}
                y={padT}
                width={slot}
                height={plotH}
              />
            )}

            {bars.map((b, i) => {
              const { bw, x } = barLayout(i);
              const rxH = (b.rx / maxTotal) * plotH;
              const txH = (b.tx / maxTotal) * plotH;
              const totalH = Math.max(0, rxH) + Math.max(0, txH);
              const base = padT + plotH;
              const isActive = hover === i;
              const dimmed = hover != null && !isActive;
              const labelEvery = n <= 12 ? 1 : Math.ceil(n / 6);
              const showLabel = i === 0 || i === n - 1 || i % labelEvery === 0;
              const isFirst = i === 0;
              const isLast = i === n - 1;
              return (
                <g
                  key={b.t}
                  className={`bar-group${isActive ? " active" : ""}${
                    dimmed ? " dimmed" : ""
                  }`}
                >
                  {txH > 0 && (
                    <rect
                      className="bar tx"
                      x={x}
                      y={base - totalH}
                      width={bw}
                      height={Math.max(0.5, txH)}
                      rx={1.5}
                    />
                  )}
                  {rxH > 0 && (
                    <rect
                      className="bar rx"
                      x={x}
                      y={base - rxH}
                      width={bw}
                      height={Math.max(0.5, rxH)}
                      rx={1.5}
                    />
                  )}
                  {showLabel && (
                    <text
                      className="axis x"
                      x={x + bw / 2}
                      y={resolvedH - 8}
                      textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                    >
                      {formatTime(b.t, bucketMs)}
                    </text>
                  )}
                </g>
              );
            })}

            {hover != null && active && active.total > 0 && (
              <line
                className="cursor"
                x1={barLayout(hover).x + barLayout(hover).bw / 2}
                x2={barLayout(hover).x + barLayout(hover).bw / 2}
                y1={padT}
                y2={padT + plotH}
              />
            )}
          </svg>
        )}

        {active &&
          tipPos &&
          createPortal(
            <S.ChartTooltip style={tipPos}>
              <S.ChartTooltipTime>
                {formatTime(active.t, bucketMs)}
              </S.ChartTooltipTime>
              <S.ChartTooltipRow>
                <S.ChartTooltipSwatch style={{ background: USAGE_RX_COLOR }} />
                <S.ChartTooltipLabel>Receive</S.ChartTooltipLabel>
                <S.ChartTooltipValue>
                  {formatBytes(active.rx, unit)}
                </S.ChartTooltipValue>
              </S.ChartTooltipRow>
              <S.ChartTooltipRow>
                <S.ChartTooltipSwatch style={{ background: USAGE_TX_COLOR }} />
                <S.ChartTooltipLabel>Send</S.ChartTooltipLabel>
                <S.ChartTooltipValue>
                  {formatBytes(active.tx, unit)}
                </S.ChartTooltipValue>
              </S.ChartTooltipRow>
              <S.ChartTooltipRow>
                <S.ChartTooltipSwatch
                  style={{
                    background:
                      "color-mix(in srgb, var(--text) 45%, transparent)",
                  }}
                />
                <S.ChartTooltipLabel>Total</S.ChartTooltipLabel>
                <S.ChartTooltipValue>
                  {formatBytes(active.total, unit)}
                </S.ChartTooltipValue>
              </S.ChartTooltipRow>
            </S.ChartTooltip>,
            document.body
          )}
      </Surface>

      <Legend aria-hidden>
        <span className="rx">↓ {formatBytes(totals.rx, unit)}</span>
        <span className="tx">↑ {formatBytes(totals.tx, unit)}</span>
        <span className="sum">{formatBytes(totals.total, unit)}</span>
      </Legend>
    </Root>
  );
}

const Root = styled.div<{ $fill?: boolean }>`
  position: relative;
  width: 100%;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: visible;
  ${({ $fill }) =>
    $fill
      ? css`
          flex: 1 1 0;
          min-height: 140px;
        `
      : css`
          min-height: 140px;
        `}
`;

const Surface = styled.div<{ $fixed?: boolean }>`
  position: relative;
  flex: ${({ $fixed }) => ($fixed ? "0 0 auto" : "1 1 auto")};
  min-height: ${({ $fixed }) => ($fixed ? "0" : "120px")};
  width: 100%;
  overflow: hidden;
  cursor: crosshair;

  svg {
    display: block;
    ${({ $fixed }) =>
      $fixed
        ? css`
            position: relative;
          `
        : css`
            position: absolute;
            top: 0;
            left: 0;
          `}
  }

  .grid {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
    stroke-dasharray: 3 4;
    opacity: 0.7;
  }

  .axis {
    fill: ${({ theme }) => theme.color.muted};
    font-size: 10px;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
  }

  .axis.x {
    font-size: 9px;
    opacity: 0.8;
  }

  .hover-band {
    fill: ${({ theme }) => theme.color.accent};
    opacity: 0.06;
    pointer-events: none;
  }

  .cursor {
    stroke: ${({ theme }) => theme.color.muted};
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.7;
    pointer-events: none;
  }

  .bar {
    transition: opacity 0.12s ease, filter 0.12s ease;
  }

  .bar.rx {
    fill: ${USAGE_RX_COLOR};
    opacity: 0.88;
  }

  .bar.tx {
    fill: ${USAGE_TX_COLOR};
    opacity: 0.88;
  }

  .bar-group.dimmed .bar {
    opacity: 0.28;
  }

  .bar-group.active .bar {
    opacity: 1;
    filter: brightness(1.12);
  }
`;

const Empty = styled.div`
  flex: 1;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
`;

const Legend = styled.div`
  display: flex;
  gap: 12px;
  flex-shrink: 0;
  margin-top: 2px;
  padding-top: 2px;
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};

  .rx {
    color: ${USAGE_RX_COLOR};
  }
  .tx {
    color: ${USAGE_TX_COLOR};
  }
  .sum {
    margin-left: auto;
    color: ${({ theme }) => theme.color.text};
    font-weight: 560;
  }
`;
