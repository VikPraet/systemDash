import styled from "styled-components";
import { procTableBase } from "../ui/styles";
import { mobile } from "../../theme/media";

export const ProcRoot = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  overflow: hidden;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

export const ProcToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-wrap: wrap;
  flex-shrink: 0;
`;

export const ProcSearch = styled.input`
  flex: 1;
  min-width: 220px;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: 0;
  padding: 9px 2px;
  color: ${({ theme }) => theme.color.text};
  font-size: 14px;
  outline: none;

  @media ${mobile} {
    min-width: 0;
    width: 100%;
    flex-basis: 100%;
  }

  &:focus {
    border-color: ${({ theme }) => theme.color.accent};
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }

  &::placeholder {
    color: rgba(230, 237, 246, 0.35);
  }
`;

export const Segmented = styled.div`
  display: flex;
  gap: 2px;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: 3px;

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: ${({ theme }) => theme.color.muted};
    padding: 6px 12px;
    border-radius: ${({ theme }) => theme.radius.sm};
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    transition: all 0.15s ease;
  }

  button:hover {
    color: ${({ theme }) => theme.color.text};
  }

  button.active {
    background: ${({ theme }) => theme.color.panel2};
    color: ${({ theme }) => theme.color.text};
  }

  .seg-count {
    font-size: 11px;
    background: ${({ theme }) => theme.color.track};
    color: ${({ theme }) => theme.color.muted};
    padding: 1px 7px;
    border-radius: ${({ theme }) => theme.radius.sm};
    font-variant-numeric: tabular-nums;
  }

  button.active .seg-count {
    background: ${({ theme }) => theme.color.accent};
    color: #fff;
  }
`;

export const ProcSummary = styled.div`
  display: flex;
  gap: 16px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
`;

export const ProcTableWrap = styled.div`
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;

  @media ${mobile} {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
`;

export const ProcTable = styled.table`
  ${procTableBase}

  @media ${mobile} {
    min-width: 640px;
  }

  .proc-group td {
    position: sticky;
    top: 37px;
    background: ${({ theme }) => theme.color.bg};
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: ${({ theme }) => theme.color.muted};
    font-weight: 600;
    padding: 8px 14px !important;
  }

  .sort-arrow {
    font-size: 9px;
    margin-left: 5px;
    vertical-align: middle;
  }

  .proc-name {
    font-weight: 500;
    max-width: 320px;
    overflow: hidden;
  }

  .proc-name-cell {
    display: flex;
    align-items: center;
    gap: 9px;
    max-width: 100%;
  }

  .proc-name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proc-user {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proc-empty {
    text-align: center;
    padding: 28px;
  }

  .proc-actions-th {
    width: 1%;
  }

  .proc-actions {
    white-space: nowrap;
  }

  .proc-end-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.sm};
    background: transparent;
    color: ${({ theme }) => theme.color.muted};
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s, border-color 0.12s, background 0.12s;
  }

  tbody tr:hover .proc-end-btn,
  .proc-end-btn:focus-visible {
    opacity: 1;
  }

  .proc-end-btn:hover {
    color: ${({ theme }) => theme.color.bad};
    border-color: color-mix(
      in srgb,
      ${({ theme }) => theme.color.bad} 55%,
      ${({ theme }) => theme.color.border}
    );
    background: color-mix(
      in srgb,
      ${({ theme }) => theme.color.bad} 12%,
      transparent
    );
  }

  .usage {
    display: inline-block;
    min-width: 62px;
    padding: 3px 9px;
    border-radius: 6px;
    font-variant-numeric: tabular-nums;
    transition: background 0.5s ease;
  }

  .usage[data-idle] {
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const ProcModalName = styled.dd`
  display: flex;
  align-items: center;
  gap: 8px;
`;
