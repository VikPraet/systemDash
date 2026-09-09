import styled from "styled-components";
import { mobile } from "../../theme/media";
import type { GaugeStyle } from "../../theme/schema";

/* ---- Card ---------------------------------------------------------------- */
export const CardRoot = styled.section`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
  padding: 18px;

  @media ${mobile} {
    padding: 14px;
  }
`;

export const CardTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 14px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${({ theme }) => theme.color.muted};

  &::before {
    content: "";
    width: 16px;
    height: 2px;
    flex-shrink: 0;
    background: ${({ theme }) => theme.color.accent};
  }
`;

/* ---- Stat ---------------------------------------------------------------- */
export const StatRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const StatLabel = styled.span`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.color.muted};
`;

export const StatValue = styled.span`
  font-size: 14px;
  font-variant-numeric: tabular-nums;
`;

/* ---- Gauge --------------------------------------------------------------- */
export const GaugeRoot = styled.div<{ $shape?: GaugeStyle }>`
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
  margin: 0 auto 12px;

  .gauge-svg {
    width: 100%;
    height: 100%;
    transform: ${({ $shape }) => ($shape && $shape !== "circle" ? "none" : "rotate(-90deg)")};
  }

  .gauge-track {
    fill: none;
    stroke: ${({ theme }) => theme.color.track};
    stroke-width: 12;
  }

  .gauge-arc {
    fill: none;
    stroke-width: 12;
    stroke-linecap: round;
    stroke-linejoin: ${({ $shape }) => ($shape === "square" ? "miter" : "round")};
    transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1),
      stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.8s ease;
  }
`;

export const GaugeInner = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
`;

export const GaugeValue = styled.span`
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

export const GaugeLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

/* ---- Bar ----------------------------------------------------------------- */
export const BarTrack = styled.div`
  height: 10px;
  background: ${({ theme }) => theme.color.track};
  border-radius: var(--bar-radius);
  overflow: hidden;
`;

export const BarFill = styled.div`
  height: 100%;
  border-radius: var(--bar-radius);
  transition: width 0.4s ease;
`;

/* ---- LabeledBar ---------------------------------------------------------- */
export const LBarRoot = styled.div``;

export const LBarHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
`;

export const LBarLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const LBarValue = styled.span`
  font-size: 13px;
  font-variant-numeric: tabular-nums;
`;

/* ---- TimeSeriesChart ----------------------------------------------------- */
// SVG internals keep their semantic class names but are scoped under this root,
// so nothing leaks to a global stylesheet.
export const ChartRoot = styled.div`
  position: relative;
  width: 100%;

  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 13px;
  }

  .chart-surface {
    position: relative;
    width: 100%;
  }

  .chart-grid {
    stroke: ${({ theme }) => theme.color.border};
    stroke-width: 1;
    stroke-dasharray: 2 4;
    opacity: 0.45;
  }

  .chart-axis {
    fill: ${({ theme }) => theme.color.muted};
    font-size: 10px;
    text-anchor: end;
    font-variant-numeric: tabular-nums;
  }

  .chart-axis-x {
    text-anchor: start;
    opacity: 0.8;
  }

  .chart-line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .chart-cursor {
    stroke: ${({ theme }) => theme.color.muted};
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.7;
  }

  .chart-dot {
    stroke: ${({ theme }) => theme.color.panel};
    stroke-width: 1.5;
  }

  .chart-dot-halo {
    opacity: 0.22;
  }
`;

// Portaled to document.body with position:fixed so parent overflow (chart
// cards, dashboard tiles) can't clip it.
export const ChartTooltip = styled.div`
  position: fixed;
  pointer-events: none;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
  box-shadow: 0 6px 20px ${({ theme }) => theme.color.shadow};
  z-index: 10000;
  min-width: 120px;
  max-width: min(320px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  overflow-y: auto;
`;

export const ChartTooltipTime = styled.div`
  color: ${({ theme }) => theme.color.muted};
  font-size: 11px;
  margin-bottom: 5px;
`;

export const ChartTooltipRow = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;

  & + & {
    margin-top: 2px;
  }
`;

export const ChartTooltipSwatch = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
`;

export const ChartTooltipLabel = styled.span`
  color: ${({ theme }) => theme.color.muted};
  margin-right: auto;
`;

export const ChartTooltipValue = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
`;

/* ---- ChartCard ----------------------------------------------------------- */
export const ChartCardRoot = styled(CardRoot)`
  height: 100%;
  min-height: 0;
  overflow: auto;

  ${CardTitle} {
    margin: 0;
  }
`;

/* ---- Empty chart card ---------------------------------------------------- */
// Same frame as a real chart so a metric with no samples still reads as a
// panel instead of a bare line of text.
export const ChartEmptyRoot = styled(ChartCardRoot)`
  display: flex;
  flex-direction: column;
`;

export const ChartEmptyBody = styled.div`
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 18px 14px;
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: color-mix(in srgb, ${({ theme }) => theme.color.panel2} 55%, transparent);
`;

export const ChartEmptyIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: ${({ theme }) => theme.color.accent};
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 12%, transparent);
`;

export const ChartEmptyText = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.color.text};
`;

export const ChartEmptyHint = styled.span`
  max-width: 42ch;
  font-size: 11.5px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
`;

export const ChartCardHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  @media ${mobile} {
    flex-direction: column;
    align-items: stretch;
  }
`;

export const ChartCardTitles = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

export const ChartCardSubtitle = styled.span`
  font-size: 11.5px;
  color: ${({ theme }) => theme.color.muted};
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;

  @media ${mobile} {
    max-width: none;
    white-space: normal;
  }
`;

export const ChartCardRight = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;

  @media ${mobile} {
    margin-left: 0;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
`;

export const ChartLegend = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;

export const ChartLegendItemEl = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
`;

export const ChartLegendSwatch = styled.span`
  width: 9px;
  height: 9px;
  border-radius: 3px;
`;

export const ChartLegendLabel = styled.span`
  color: ${({ theme }) => theme.color.muted};
`;

export const ChartLegendValue = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`;

export const ChartCardActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

export const ChartIconBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
    background: ${({ theme }) => theme.color.panel2};
  }
`;
