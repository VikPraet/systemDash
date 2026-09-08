import styled, { css } from "styled-components";
import { mobile } from "../../theme/media";

type Outcome = "ok" | "denied" | "failed";
type IconKind = "info" | "success" | "warn" | "danger" | "terminal" | "neutral";

export const ActivityTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
`;

export const ActivityHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.4px;
  }

  @media ${mobile} {
    h2 {
      font-size: 22px;
    }
  }
`;

export const ActivityCard = styled.section<{ $log?: boolean }>`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
  padding: 18px;
  min-width: 0;

  @media ${mobile} {
    padding: 14px;
  }

  ${({ $log }) =>
    $log &&
    css`
      overflow: visible;
    `}
`;

export const StorageWrap = styled.div`
  flex-shrink: 0;
`;

export const LogSticky = styled.div`
  position: sticky;
  top: 0;
  z-index: 6;
  background: ${({ theme }) => theme.color.panel};
  margin: -18px -18px 0;
  padding: 18px 18px 12px;

  @media ${mobile} {
    margin: -14px -14px 0;
    padding: 14px 14px 12px;
  }
`;

export const SectionTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 600;
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

  > span {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    text-transform: none;
    font-weight: 500;
  }
`;

export const ActivityEmpty = styled.div`
  padding: 8px 0 4px;
  font-size: 13px;
`;

/* ---- Active sessions ---------------------------------------------------- */
export const SessionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
`;

export const SessionCard = styled.div<{ $current?: boolean; $editing?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};

  ${({ $current, theme }) =>
    $current &&
    css`
      border-color: color-mix(in srgb, ${theme.color.accent} 50%, ${theme.color.border});
      background: color-mix(in srgb, ${theme.color.accent} 8%, ${theme.color.panel2});
    `}

  ${({ $editing, $current, theme }) =>
    $editing &&
    !$current &&
    css`
      border-color: color-mix(in srgb, ${theme.color.accent} 35%, ${theme.color.border});
    `}
`;

export const SessUser = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  flex-wrap: wrap;
`;

export const SessDevice = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;

  > svg {
    flex: none;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const SessNet = styled.span`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

export const SessIp = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SessFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
`;

export const SessTimes = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  font-variant-numeric: tabular-nums;
`;

export const SelfBadge = styled.span`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.track};
  color: ${({ theme }) => theme.color.muted};
`;

export const EditBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 18%, transparent);
  color: ${({ theme }) => theme.color.accent};

  > svg {
    flex: none;
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

/* ---- Activity log: toolbar ---------------------------------------------- */
export const LogToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
`;

export const LogToolbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
`;

export const Seg = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 3px;
  gap: 2px;

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    color: ${({ theme }) => theme.color.muted};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 6px 10px;
    border-radius: ${({ theme }) => theme.radius.sm};
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  button:hover {
    color: ${({ theme }) => theme.color.text};
  }

  button.active {
    background: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }

  button.active.danger {
    background: ${({ theme }) => theme.color.bad};
    color: ${({ theme }) => theme.color.onAccent};
  }

  .seg-count {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    padding: 1px 6px;
    border-radius: ${({ theme }) => theme.radius.sm};
    background: ${({ theme }) => theme.color.track};
    color: ${({ theme }) => theme.color.muted};
  }

  button.active .seg-count {
    background: color-mix(in srgb, ${({ theme }) => theme.color.onAccent} 18%, transparent);
    color: ${({ theme }) => theme.color.onAccent};
  }
`;

export const AuditSearch = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 160px;
  flex: 1;
  max-width: 280px;
  color: ${({ theme }) => theme.color.muted};

  input {
    flex: 1;
    min-width: 0;
    border: none;
    border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
    border-radius: 0;
    background: transparent;
    padding: 6px 2px;
    color: ${({ theme }) => theme.color.text};
    font-size: 13px;
    outline: none;

    &:focus {
      border-bottom-color: ${({ theme }) => theme.color.accent};
    }

    &::placeholder {
      color: ${({ theme }) => theme.color.placeholder};
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
  margin: 0 -6px;
`;

export const AuditBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

export const AuditTop = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
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
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  background: ${({ theme }) => theme.color.hover};
  border: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
`;

export const AuditStatusBadge = styled.span<{ $denied?: boolean }>`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.bad};
  background: color-mix(in srgb, ${({ theme }) => theme.color.bad} 14%, transparent);
  flex-shrink: 0;

  ${({ $denied, theme }) =>
    $denied &&
    css`
      color: ${theme.color.warn};
      background: color-mix(in srgb, ${theme.color.warn} 14%, transparent);
    `}
`;

export const AuditTime = styled.span`
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.muted};
`;

export const AuditMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};

  > * {
    min-width: 0;
  }

  > * + *::before {
    content: "·";
    margin: 0 8px;
    color: ${({ theme }) => theme.color.muted};
    opacity: 0.6;
  }
`;

export const AuditUser = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-weight: 500;
`;

export const AuditDetail = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11.5px;
  max-width: 280px;
`;

export const AuditIp = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
`;

const iconKindStyles: Record<IconKind, ReturnType<typeof css>> = {
  info: css`
    color: ${({ theme }) => theme.color.accent};
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 14%, transparent);
  `,
  success: css`
    color: ${({ theme }) => theme.color.good};
    background: color-mix(in srgb, ${({ theme }) => theme.color.good} 14%, transparent);
  `,
  warn: css`
    color: ${({ theme }) => theme.color.warn};
    background: color-mix(in srgb, ${({ theme }) => theme.color.warn} 14%, transparent);
  `,
  danger: css`
    color: ${({ theme }) => theme.color.bad};
    background: color-mix(in srgb, ${({ theme }) => theme.color.bad} 14%, transparent);
  `,
  terminal: css`
    color: ${({ theme }) => theme.color.accent};
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 14%, transparent);
  `,
  neutral: css`
    color: ${({ theme }) => theme.color.muted};
    background: color-mix(in srgb, ${({ theme }) => theme.color.muted} 14%, transparent);
  `,
};

export const AuditIcon = styled.span<{ $kind: IconKind }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  background: color-mix(in srgb, ${({ theme }) => theme.color.muted} 14%, transparent);

  ${({ $kind }) => iconKindStyles[$kind]}
`;

export const AuditRow = styled.div<{ $outcome: Outcome }>`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  gap: 10px 12px;
  padding: 10px 6px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  font-size: 13px;

  &:first-child {
    border-top: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.hover};
  }

  ${({ $outcome, theme }) =>
    $outcome === "failed"
      ? css`
          &,
          &:hover {
            background: color-mix(in srgb, ${theme.color.bad} 7%, transparent);
          }

          ${AuditAction} {
            color: ${theme.color.muted};
          }
        `
      : $outcome === "denied"
        ? css`
            &,
            &:hover {
              background: color-mix(in srgb, ${theme.color.warn} 7%, transparent);
            }

            ${AuditAction} {
              color: ${theme.color.muted};
            }
          `
        : ""}
`;
