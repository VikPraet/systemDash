import styled from "styled-components";
import { procTableBase } from "../ui/styles";
import { mobile } from "../../theme/media";

export const NetRoot = styled.div`
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg};
`;

export const MapPanel = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg};
`;

export const MapStage = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
`;

export const MapSvg = styled.svg<{ $dragging?: boolean }>`
  display: block;
  width: 100%;
  height: 100%;
  cursor: ${({ $dragging }) => ($dragging ? "grabbing" : "grab")};
  touch-action: none;
  user-select: none;

  .map-ocean {
    fill: color-mix(
      in srgb,
      ${({ theme }) => theme.color.bg} 82%,
      ${({ theme }) => theme.color.track}
    );
  }

  .map-land {
    fill: ${({ theme }) => theme.color.track};
    fill-rule: nonzero;
    stroke: none;
  }

  .map-arc {
    fill: none;
    stroke-linecap: round;
    stroke-dasharray: 1.2 2.2;
    stroke-width: 0.7;
    pointer-events: stroke;
    cursor: pointer;
    transition: opacity 0.25s ease, stroke 0.25s ease;
  }

  .map-arc-hit {
    fill: none;
    stroke: transparent;
    stroke-linecap: round;
    pointer-events: stroke;
    cursor: pointer;
  }

  .map-arc.active {
    stroke-dasharray: 1.4 1.8;
  }

  .map-arc-lane.enter .map-arc {
    transition: none;
    animation: map-arc-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .map-arc-lane.exit {
    pointer-events: none;
  }

  .map-arc-lane.exit .map-arc {
    transition: none;
    animation: map-arc-out 0.38s ease-in both;
  }

  .map-dest {
    cursor: pointer;
  }

  .map-dest.exit {
    pointer-events: none;
  }

  .map-dest-hit {
    fill: transparent;
  }

  .map-dest-mark {
    transform-box: fill-box;
    transform-origin: center;
  }

  .map-dest.enter .map-dest-mark {
    animation: map-dest-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .map-dest.exit .map-dest-mark {
    animation: map-dest-out 0.38s ease-in both;
  }

  .map-dest.enter .map-dest-dot,
  .map-dest.enter .map-dest-halo,
  .map-dest.exit .map-dest-dot,
  .map-dest.exit .map-dest-halo {
    transition: none;
  }

  .map-dest-halo {
    stroke: none;
    pointer-events: none;
    transition: opacity 0.35s ease;
  }

  .map-dest-dot {
    stroke: none;
    transition: r 0.35s ease, opacity 0.35s ease;
  }

  .map-dest.active .map-dest-dot {
    filter: brightness(1.15);
  }

  @keyframes map-dest-in {
    from {
      opacity: 0;
      transform: scale(0.15);
    }
    70% {
      opacity: 1;
      transform: scale(1.12);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes map-dest-out {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.2);
    }
  }

  @keyframes map-arc-in {
    from {
      opacity: 0;
      stroke-dashoffset: 18;
    }
    to {
      opacity: 0.72;
      stroke-dashoffset: 0;
    }
  }

  @keyframes map-arc-out {
    from {
      opacity: 0.72;
    }
    to {
      opacity: 0;
      stroke-dashoffset: -10;
    }
  }

  .map-origin {
    cursor: pointer;
  }

  .map-origin-hit {
    fill: transparent;
  }

  .map-origin-dot {
    fill: ${({ theme }) => theme.color.good};
    stroke: none;
    transition: filter 0.2s ease, r 0.2s ease;
  }

  .map-origin.hover .map-origin-dot,
  .map-origin.active .map-origin-dot {
    filter: brightness(1.2);
  }

  .map-origin.active .map-origin-dot {
    stroke: color-mix(in srgb, ${({ theme }) => theme.color.good} 55%, white);
    stroke-width: 1.1;
  }

  .map-origin-pulse {
    fill: ${({ theme }) => theme.color.good};
  }

  .map-origin-pulse-wrap {
    transform-box: fill-box;
    transform-origin: center;
    animation: map-pulse 2.8s ease-out infinite;
    pointer-events: none;
  }

  @keyframes map-pulse {
    0% {
      transform: scale(1);
      opacity: 0.28;
    }
    100% {
      transform: scale(2.8);
      opacity: 0;
    }
  }
`;

export const MapEmpty = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
`;

export const MapLoading = styled.div`
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg};

  .load-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .load-ocean {
    fill: color-mix(
      in srgb,
      ${({ theme }) => theme.color.bg} 82%,
      ${({ theme }) => theme.color.track}
    );
  }

  .load-land {
    fill: ${({ theme }) => theme.color.track};
    opacity: 0.7;
  }

  .load-origin-dot {
    fill: ${({ theme }) => theme.color.good};
  }

  .load-origin-pulse {
    fill: ${({ theme }) => theme.color.good};
  }

  .load-origin-pulse-wrap {
    transform-box: fill-box;
    transform-origin: center;
    animation: load-origin-pulse 2.8s ease-out infinite;
  }

  .load-card {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 2;
    width: min(240px, calc(100% - 32px));
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: color-mix(
      in srgb,
      ${({ theme }) => theme.color.panel} 90%,
      transparent
    );
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.base};
    backdrop-filter: blur(12px);
  }

  .load-bone {
    height: 10px;
    border-radius: 4px;
    background: ${({ theme }) => theme.color.track};
    animation: load-shimmer 1.4s ease-in-out infinite;
  }

  .load-bone.wide {
    width: 72%;
  }
  .load-bone.mid {
    width: 48%;
  }
  .load-bone.tall {
    height: 18px;
    width: 58%;
  }

  .load-caption {
    position: absolute;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 2;
    font-size: 12px;
    color: ${({ theme }) => theme.color.muted};
    letter-spacing: 0.4px;
  }

  @keyframes load-origin-pulse {
    0% {
      transform: scale(1);
      opacity: 0.28;
    }
    100% {
      transform: scale(2.8);
      opacity: 0;
    }
  }

  @keyframes load-shimmer {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 0.85;
    }
  }
`;

export const MapTooltip = styled.div`
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: color-mix(
    in srgb,
    ${({ theme }) => theme.color.panel} 90%,
    transparent
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  backdrop-filter: blur(10px);
  box-shadow: ${({ theme }) => theme.elev};
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  pointer-events: none;
  max-width: 240px;

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }
`;

export const MapZoomControls = styled.div`
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: color-mix(
    in srgb,
    ${({ theme }) => theme.color.panel} 90%,
    transparent
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  backdrop-filter: blur(10px);
  box-shadow: ${({ theme }) => theme.elev};

  @media ${mobile} {
    left: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
`;

export const MapZoomBtn = styled.button`
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: calc(${({ theme }) => theme.radius.base} - 2px);
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      ${({ theme }) => theme.color.accent} 14%,
      transparent
    );
    color: ${({ theme }) => theme.color.accent};
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`;

export const OverlayCard = styled.div`
  background: color-mix(
    in srgb,
    ${({ theme }) => theme.color.panel} 90%,
    transparent
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  backdrop-filter: blur(12px);
  box-shadow: ${({ theme }) => theme.elev};
`;

export const StatsOverlay = styled(OverlayCard)`
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  min-width: 200px;
  max-width: min(280px, calc(100% - 32px));
  pointer-events: none;

  @media ${mobile} {
    top: 12px;
    left: 12px;
    padding: 12px 14px;
    max-width: calc(100% - 24px);
  }
`;

export const StatBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  .stat-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.muted};
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.color.text};
    line-height: 1.2;
  }

  .stat-sub {
    font-size: 12px;
    color: ${({ theme }) => theme.color.muted};
    font-variant-numeric: tabular-nums;
  }

  .stat-rx {
    color: ${({ theme }) => theme.color.accent};
  }

  .stat-tx {
    color: ${({ theme }) => theme.color.warn};
  }

  .stat-process {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .stat-process-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
    font-size: 14px;
  }
`;

export const StatsDivider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.color.border};
`;

export const SidePanel = styled(OverlayCard)<{ $open: boolean }>`
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 4;
  width: min(560px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: translateX(${({ $open }) => ($open ? "0" : "calc(100% + 24px)")});
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
  transition: transform 0.22s ease, opacity 0.18s ease;

  @media ${mobile} {
    top: auto;
    left: 10px;
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-height: 55%;
    transform: translateY(${({ $open }) => ($open ? "0" : "calc(100% + 24px)")});
  }
`;

export const PanelHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
`;

export const PanelHeadText = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  .panel-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .panel-sub {
    font-size: 12px;
    color: ${({ theme }) => theme.color.muted};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const PanelClose = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
  }
`;

export const PanelBody = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
`;

export const NetToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-wrap: wrap;
  flex-shrink: 0;
`;

export const NetSearch = styled.input`
  flex: 1;
  min-width: 120px;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: 0;
  padding: 7px 2px;
  color: ${({ theme }) => theme.color.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.color.accent};
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.placeholder};
  }
`;

export const NetTableWrap = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
`;

export const NetTable = styled.table`
  ${procTableBase}

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.color.panel};
  }

  tbody tr.net-row {
    cursor: pointer;
  }

  tbody tr.net-row td:first-child {
    box-shadow: inset 2px 0 0 transparent;
  }

  tbody tr.net-row-outbound td:first-child {
    box-shadow: inset 2px 0 0
      color-mix(in srgb, ${({ theme }) => theme.color.warn} 70%, transparent);
  }

  tbody tr.net-row-inbound td:first-child {
    box-shadow: inset 2px 0 0
      color-mix(in srgb, ${({ theme }) => theme.color.good} 70%, transparent);
  }

  tbody tr.net-row:hover td {
    background: ${({ theme }) => theme.color.hover};
  }

  tbody tr.net-row.selected td {
    background: color-mix(
      in srgb,
      ${({ theme }) => theme.color.accent} 14%,
      transparent
    );
  }

  .sort-arrow {
    font-size: 9px;
    margin-left: 5px;
    vertical-align: middle;
  }

  .net-process {
    font-weight: 500;
    max-width: 160px;
    overflow: hidden;
  }

  .net-process-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
  }

  .net-process-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .net-addr {
    font-variant-numeric: tabular-nums;
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 11px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .net-proto {
    text-transform: uppercase;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.6px;
  }

  .net-state {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .net-empty {
    text-align: center;
    padding: 28px;
  }
`;

export const LocLine = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  min-width: 0;
  max-width: 100%;
  color: ${({ theme }) => theme.color.muted};

  > svg {
    flex: none;
  }
`;

export const LocText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const LocFlag = styled.span`
  font-size: 13px;
  line-height: 1;
  flex: none;
`;

export const ServiceTag = styled.span`
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.accent};
  background: color-mix(
    in srgb,
    ${({ theme }) => theme.color.accent} 14%,
    transparent
  );
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 2px 6px;
  white-space: nowrap;
`;

export const DirTag = styled.span<{ $dir: "outbound" | "inbound" | "peer" }>`
  display: inline-block;
  margin-top: 3px;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${({ theme, $dir }) =>
    $dir === "outbound"
      ? theme.color.warn
      : $dir === "inbound"
        ? theme.color.good
        : theme.color.muted};
  background: color-mix(
    in srgb,
    ${({ theme, $dir }) =>
        $dir === "outbound"
          ? theme.color.warn
          : $dir === "inbound"
            ? theme.color.good
            : theme.color.muted}
      14%,
    transparent
  );
`;

export const TrafficCell = styled.span`
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-family: ${({ theme }) => theme.font.mono};
  line-height: 1.25;

  .rx {
    color: ${({ theme }) => theme.color.accent};
  }
  .tx {
    color: ${({ theme }) => theme.color.warn};
  }
  .muted {
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const PeerHost = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
`;

export const DetailNote = styled.p`
  margin: 10px 0 0;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.45;

  .rx {
    color: ${({ theme }) => theme.color.accent};
  }
  .tx {
    color: ${({ theme }) => theme.color.warn};
  }
`;

export const DetailProcess = styled.dd`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const UsageOverlay = styled(OverlayCard)<{ $open: boolean }>`
  position: absolute;
  left: 50%;
  bottom: 16px;
  z-index: 3;
  transform: translateX(-50%);
  width: min(920px, calc(100% - 120px));
  padding: ${({ $open }) => ($open ? "12px 14px 14px" : "6px 10px")};
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;

  @media ${mobile} {
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: auto;
    transform: none;
  }
`;

export const UsageHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;

  .usage-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.color.text};
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 2px 0;

    &:hover {
      color: ${({ theme }) => theme.color.accent};
    }
  }
`;

export const UsageControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

export const UsageChipGroup = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: color-mix(
    in srgb,
    ${({ theme }) => theme.color.track} 70%,
    transparent
  );
`;

export const UsageChip = styled.button<{ $active?: boolean }>`
  border: none;
  border-radius: calc(${({ theme }) => theme.radius.sm} - 1px);
  padding: 3px 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 560;
  cursor: pointer;
  color: ${({ theme, $active }) =>
    $active ? theme.color.text : theme.color.muted};
  background: ${({ theme, $active }) =>
    $active
      ? `color-mix(in srgb, ${theme.color.panel} 88%, transparent)`
      : "transparent"};

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

export const UsageBody = styled.div`
  min-height: 196px;
`;

export const UsageEmpty = styled.div`
  min-height: 168px;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  text-align: center;
  padding: 8px;
`;
