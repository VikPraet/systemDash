import styled from "styled-components";
import { procTableBase } from "../../ui/styles";
import { mobile } from "../../../theme/media";

export const MapRoot = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
`;

export const MapStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
`;

export const MapStatusMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
`;

export const MapStatusTitle = styled.div`
  color: ${({ theme }) => theme.color.text};
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const MapProgressTrack = styled.div`
  height: 5px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.track};
  overflow: hidden;
`;

export const MapProgressBar = styled.div<{ $indeterminate?: boolean }>`
  height: 100%;
  background: ${({ theme }) => theme.color.accent};
  ${({ $indeterminate }) =>
    $indeterminate
      ? `
    width: 36%;
    animation: map-scan 1.1s ease-in-out infinite;
  `
      : "width: 100%;"}

  @keyframes map-scan {
    0% {
      transform: translateX(-120%);
    }
    100% {
      transform: translateX(320%);
    }
  }
`;

export const MapCapacity = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 0 1 230px;
  min-width: 170px;

  @media ${mobile} {
    flex: 1 1 100%;
  }
`;

export const MapCapacityHead = styled.div`
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 2px 8px;
  font-size: 11px;

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }
`;

export const MapActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid ${({ theme }) => theme.color.hairline};
    color: ${({ theme }) => theme.color.text};
    padding: 6px 10px;
    border-radius: ${({ theme }) => theme.radius.sm};
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }

  button:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const MapCrumbs = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 6px 16px 8px;
  flex-shrink: 0;
  font-size: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  button {
    background: none;
    border: none;
    color: ${({ theme }) => theme.color.muted};
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 6px;
    font-size: 12px;
  }

  button:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bg};
  }

  button.current {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }

  .sep {
    color: ${({ theme }) => theme.color.muted};
    opacity: 0.6;
  }
`;

export const MapSplit = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  @media ${mobile} {
    overflow: auto;
  }
`;

export const MapCanvasWrap = styled.div`
  position: relative;
  flex: 1 1 58%;
  min-height: 220px;
  background: ${({ theme }) => theme.color.bg};
`;

export const MapCanvas = styled.svg`
  display: block;
  width: 100%;
  height: 100%;
  cursor: pointer;
`;

export const MapTip = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  z-index: 40;
  pointer-events: none;
  max-width: min(360px, calc(100vw - 16px));
  padding: 8px 10px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: 0 8px 24px ${({ theme }) => theme.color.shadow};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const MapTipName = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  word-break: break-all;
`;

export const MapTipPath = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  word-break: break-all;
`;

export const MapTipMeta = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  font-variant-numeric: tabular-nums;
`;

export const MapTableWrap = styled.div`
  flex: 0 1 42%;
  min-height: 140px;
  max-height: 46%;
  overflow: auto;
  border-top: 1px solid ${({ theme }) => theme.color.border};

  @media ${mobile} {
    max-height: none;
    flex: none;
  }
`;

export const MapTabs = styled.div`
  display: flex;
  gap: 2px;
  padding: 8px 12px 0;
  position: sticky;
  top: 0;
  background: ${({ theme }) => theme.color.panel};
  z-index: 1;

  button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: ${({ theme }) => theme.color.muted};
    padding: 6px 10px 8px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  button.active {
    color: ${({ theme }) => theme.color.text};
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;

export const MapTable = styled.table`
  ${procTableBase}

  thead th {
    background: ${({ theme }) => theme.color.panel};
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr.hovered td {
    background: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent);
  }

  tbody tr.selected td {
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 12%, transparent);
  }

  .map-swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .map-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .map-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const MapEmpty = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
`;
