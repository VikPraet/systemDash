import styled, { css } from "styled-components";
import { CardRoot } from "../widgets/styles";

/* ----------------------------------------------------------------------------
   History view: page shell, range/segment controls, chart show/hide toggles,
   the per-core split grid, the fullscreen chart overlay, and the storage +
   recording settings panel. Chart visuals themselves live in `../widgets`.

   Values reflect the *final* cascade from the old global stylesheet, including
   the trailing "EDITORIAL THEME" overrides (notably `.seg` / `.seg button`).
   ------------------------------------------------------------------------- */

/* ---- Page shell ---------------------------------------------------------- */
export const HistoryRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const HistoryToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
`;

export const HistoryMeta = styled.span`
  font-size: 12px;
`;

// Range picker. Base radius/padding plus the editorial overrides that squared
// the corners and made the labels small uppercase.
export const Seg = styled.div`
  display: inline-flex;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 3px;
  gap: 2px;

  button {
    border: none;
    background: none;
    color: ${({ theme }) => theme.color.muted};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 6px 12px;
    border-radius: ${({ theme }) => theme.radius.sm};
    cursor: pointer;
    transition: all 0.15s ease;
  }

  button:hover {
    color: ${({ theme }) => theme.color.text};
  }

  button.active {
    background: ${({ theme }) => theme.color.accent};
    color: #fff;
  }
`;

export const HistoryError = styled.div`
  background: rgba(232, 106, 111, 0.12);
  border: 1px solid ${({ theme }) => theme.color.bad};
  color: ${({ theme }) => theme.color.bad};
  border-radius: ${({ theme }) => theme.radius.base};
  padding: 12px 16px;
  font-size: 13px;
`;

export const HistoryNotice = styled.div`
  background: rgba(214, 162, 63, 0.1);
  border: 1px solid ${({ theme }) => theme.color.warn};
  color: ${({ theme }) => theme.color.text};
  border-radius: ${({ theme }) => theme.radius.base};
  padding: 12px 16px;
  font-size: 13px;
`;

/* ---- Chart grid + show/hide toggles -------------------------------------- */
export const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;

    & > * {
      grid-column: span 1 !important;
    }
  }
`;

export const ChartToggles = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

export const ChartToggle = styled.button<{ $active?: boolean }>`
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.muted};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 5px 11px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
  }

  ${({ $active, theme }) =>
    $active
      ? css`
          color: ${theme.color.text};
          border-color: ${theme.color.accent};
          background: color-mix(in srgb, ${theme.color.accent} 14%, transparent);
        `
      : css`
          opacity: 0.55;
        `}
`;

/* ---- Fullscreen chart overlay -------------------------------------------- */
export const ChartFsOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(6, 9, 18, 0.72);
  backdrop-filter: blur(6px);
`;

export const ChartFsBody = styled.div`
  width: min(1400px, 96vw);
  max-height: 92vh;
  overflow: auto;

  /* The migrated ChartCard renders with className="chart-card". */
  .chart-card {
    grid-column: auto !important;
    margin: 0;
  }
`;

/* ---- CPU per-core combined/split switch + split grid --------------------- */
export const ChartViewSeg = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  overflow: hidden;

  button {
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.color.muted};
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 5px 11px;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;
  }

  button + button {
    border-left: 1px solid ${({ theme }) => theme.color.hairline};
  }

  button.active {
    background: ${({ theme }) => theme.color.accent};
    color: #fff;
  }

  button:not(.active):hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

export const CoreGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 4px;
`;

export const CoreCell = styled.div`
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 8px 10px 4px;
  background: ${({ theme }) => theme.color.panel2};
`;

export const CoreCellHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.color.muted};
  margin-bottom: 2px;
`;

export const CoreCellName = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

export const CoreCellDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 2px;
`;

export const CoreCellVal = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-variant-numeric: tabular-nums;
`;

/* ---- Storage & recording panel ------------------------------------------- */
export const StoragePanel = styled(CardRoot)`
  grid-column: span 2;
`;

export const StorageGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

export const StorageStats = styled.div``;

// `.kv.tight`: single-column key/value stack that fills the grid cell.
export const KvTight = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  flex: 1;
`;

export const StorageBar = styled.div`
  margin-top: 14px;
`;

export const StorageBarFoot = styled.div`
  font-size: 12px;
  margin-top: 6px;
`;

export const StorageForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const ToggleRow = styled.button`
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: 10px;
  padding: 11px 10px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.color.bg};
  }
`;

export const ToggleText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
`;

export const ToggleLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.color.text};
`;

export const ToggleDesc = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
`;

export const SwitchKnob = styled.span`
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
`;

export const Switch = styled.span<{ $on?: boolean }>`
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: ${({ $on, theme }) =>
    $on ? theme.color.accent : theme.color.border};
  position: relative;
  transition: background 0.15s ease;

  ${({ $on }) =>
    $on &&
    css`
      ${SwitchKnob} {
        transform: translateX(16px);
      }
    `}
`;

export const NumField = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
`;

export const NumFieldLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.color.text};
`;

export const NumFieldInput = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: ${({ theme }) => theme.radius.sm};

  input {
    width: 84px;
    background: ${({ theme }) => theme.color.bg};
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: 8px;
    color: ${({ theme }) => theme.color.text};
    padding: 7px 9px;
    font-size: 13px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    margin: 0;
    -webkit-appearance: none;
  }

  input:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.accent};
  }
`;

export const NumFieldUnit = styled.span`
  font-size: 11px;
  width: 120px;
`;

export const StorageActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
`;

export const StorageActionsRight = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 12px;
`;

export const StorageMsg = styled.span`
  font-size: 12px;
`;

export const StorageConfirm = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding: 12px 14px;
  background: rgba(232, 106, 111, 0.1);
  border: 1px solid ${({ theme }) => theme.color.bad};
  border-radius: ${({ theme }) => theme.radius.base};
  font-size: 13px;
`;

export const StorageConfirmActions = styled.div`
  display: inline-flex;
  gap: 10px;
`;
