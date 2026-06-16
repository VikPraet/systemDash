import styled, { css } from "styled-components";

/* ----------------------------------------------------------------------------
   Activity tab: active sessions + audit log.

   Styles reflect the *final* cascade from the old global stylesheet, including
   the trailing "EDITORIAL THEME" overrides (squared chips/search, large head).
   Shared modal/button/badge primitives live in `../ui/styles`.
   ------------------------------------------------------------------------- */

type Outcome = "ok" | "denied" | "failed";
type IconKind = "info" | "success" | "warn" | "danger" | "terminal" | "neutral";

// Pins to the viewport height so the audit log scrolls internally instead of
// growing the whole page.
export const ActivityTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
`;

export const ActivityHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    margin: 0;
    /* EDITORIAL override of the base 18px. */
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.4px;
  }
`;

// The `$log` card grows to fill leftover space; its list scrolls internally.
export const ActivityCard = styled.section<{ $log?: boolean }>`
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  background: ${({ theme }) => theme.color.panel};
  overflow: hidden;

  ${({ $log }) =>
    $log &&
    css`
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    `}
`;

export const ActivityCardHead = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.color.panel2};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};

  h3 {
    margin: 0;
    font-size: 14px;
    flex: 1;
  }
`;

export const ActivityEmpty = styled.div`
  padding: 18px 14px;
  font-size: 13px;
`;

/* ---- Active sessions table ---------------------------------------------- */
export const SessionsTable = styled.div`
  display: flex;
  flex-direction: column;
`;

export const SessionsRow = styled.div<{ $current?: boolean; $head?: boolean }>`
  display: grid;
  grid-template-columns: 1.3fr 1.5fr 1.1fr 1fr 1fr 0.5fr;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 13px;

  &:first-child {
    border-top: none;
  }

  ${({ $current }) =>
    $current &&
    css`
      background: rgba(79, 140, 255, 0.07);
    `}

  ${({ $head }) =>
    $head &&
    css`
      color: ${({ theme }) => theme.color.muted};
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    `}

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 4px;
    ${({ $head }) =>
      $head &&
      css`
        display: none;
      `}
  }
`;

export const SessUser = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
`;

export const SessActions = styled.span`
  display: flex;
  justify-content: flex-end;
`;

export const SessDevice = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: ${({ theme }) => theme.color.muted};

  > svg {
    flex: none;
    color: ${({ theme }) => theme.color.text};
  }
`;

export const SessDeviceText = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
`;

export const SessDeviceLabel = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const SessDeviceOs = styled.span`
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Stacked IP + location cell.
export const SessNet = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

// "you" pill (final cascade: editorial squared corners).
export const SelfBadge = styled.span`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.track};
  color: ${({ theme }) => theme.color.muted};
`;

/* ---- "Where from" line (Activity-owned): flag/icon + city, country ------- */
export const LocLine = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  min-width: 0;

  > svg {
    flex: none;
  }
`;

export const LocFlag = styled.span`
  font-size: 13px;
  line-height: 1;
`;

/* ---- Activity log: filters ---------------------------------------------- */
export const AuditFilters = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: rgba(255, 255, 255, 0.012);
`;

export const AuditChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const AuditFilterRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

// Count bubble nested inside a chip (final cascade: editorial squared corners).
export const AuditChipCount = styled.span`
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: rgba(255, 255, 255, 0.06);
  color: ${({ theme }) => theme.color.muted};
`;

export const AuditChip = styled.button<{ $active?: boolean; $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid ${({ theme }) => theme.color.border};
  /* EDITORIAL overrides: squared corners, uppercase, wider tracking. */
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel2};
  color: ${({ theme }) => theme.color.muted};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
  }

  ${({ $active }) =>
    $active &&
    css`
      background: rgba(79, 140, 255, 0.16);
      border-color: ${({ theme }) => theme.color.accent};
      color: ${({ theme }) => theme.color.text};

      ${AuditChipCount} {
        background: rgba(255, 255, 255, 0.12);
        color: ${({ theme }) => theme.color.text};
      }
    `}

  ${({ $active, $danger }) =>
    $active &&
    $danger &&
    css`
      background: rgba(232, 106, 111, 0.16);
      border-color: ${({ theme }) => theme.color.bad};
    `}
`;

export const AuditSearch = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  border: 1px solid ${({ theme }) => theme.color.border};
  /* EDITORIAL override of the base 9px radius. */
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel2};
  color: ${({ theme }) => theme.color.muted};

  &:focus-within {
    border-color: ${({ theme }) => theme.color.accent};
  }

  input {
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.color.text};
    font-size: 12.5px;
    outline: none;
    width: 200px;

    &::placeholder {
      color: ${({ theme }) => theme.color.muted};
    }

    @media (max-width: 720px) {
      width: 130px;
    }
  }
`;

export const AuditSearchClear = styled.button`
  display: inline-flex;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;
  padding: 0;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

/* ---- Activity log: rows ------------------------------------------------- */
export const AuditList = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

export const AuditMain = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;

  @media (max-width: 720px) {
    grid-area: main;
  }
`;

export const AuditAction = styled.span`
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const AuditCat = styled.span`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: 5px;
  color: ${({ theme }) => theme.color.muted};
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
`;

export const AuditStatusBadge = styled.span<{ $denied?: boolean }>`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 6px;
  border-radius: 5px;
  color: ${({ theme }) => theme.color.bad};
  background: rgba(232, 106, 111, 0.14);
  flex-shrink: 0;

  ${({ $denied }) =>
    $denied &&
    css`
      color: ${({ theme }) => theme.color.warn};
      background: rgba(214, 162, 63, 0.14);
    `}
`;

export const AuditUser = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: 500;

  @media (max-width: 720px) {
    grid-area: user;
  }
`;

export const AuditDetail = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11.5px;

  @media (max-width: 720px) {
    grid-area: detail;
  }
`;

export const AuditIp = styled.span`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;

  .mono,
  ${LocLine} {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  @media (max-width: 720px) {
    grid-area: ip;
  }
`;

export const AuditTime = styled.span`
  text-align: right;

  @media (max-width: 720px) {
    grid-area: time;
  }
`;

const iconKindStyles: Record<IconKind, ReturnType<typeof css>> = {
  info: css`
    color: ${({ theme }) => theme.color.accent};
    background: rgba(79, 140, 255, 0.15);
  `,
  success: css`
    color: ${({ theme }) => theme.color.good};
    background: rgba(51, 201, 142, 0.15);
  `,
  warn: css`
    color: ${({ theme }) => theme.color.warn};
    background: rgba(214, 162, 63, 0.15);
  `,
  danger: css`
    color: ${({ theme }) => theme.color.bad};
    background: rgba(232, 106, 111, 0.16);
  `,
  terminal: css`
    color: #c4a8ff;
    background: rgba(167, 139, 250, 0.16);
  `,
  neutral: css`
    color: ${({ theme }) => theme.color.muted};
    background: rgba(139, 151, 168, 0.14);
  `,
};

export const AuditIcon = styled.span<{ $kind: IconKind }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: ${({ theme }) => theme.color.muted};
  background: rgba(139, 151, 168, 0.14);

  ${({ $kind }) => iconKindStyles[$kind]}

  @media (max-width: 720px) {
    grid-area: icon;
  }
`;

export const AuditRow = styled.div<{ $outcome: Outcome }>`
  display: grid;
  grid-template-columns: 28px 1.4fr 0.9fr 2fr 1fr 0.9fr;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 12.5px;

  &:first-child {
    border-top: none;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.025);
  }

  /* Denied/failed attempts keep their tint (even on hover, matching the old
     equal-specificity cascade) and mute the headline. */
  ${({ $outcome }) =>
    $outcome === "failed"
      ? css`
          &,
          &:hover {
            background: rgba(232, 106, 111, 0.06);
          }

          ${AuditAction} {
            color: ${({ theme }) => theme.color.muted};
            font-weight: 600;
          }
        `
      : $outcome === "denied"
      ? css`
          &,
          &:hover {
            background: rgba(214, 162, 63, 0.05);
          }

          ${AuditAction} {
            color: ${({ theme }) => theme.color.muted};
            font-weight: 600;
          }
        `
      : ""}

  @media (max-width: 720px) {
    grid-template-columns: 28px 1fr auto;
    grid-template-areas:
      "icon main time"
      "icon user detail"
      "icon ip ip";
    row-gap: 2px;
  }
`;
