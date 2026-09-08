import styled from "styled-components";
import { procTableBase } from "../ui/styles";
import { mobile } from "../../theme/media";

export const Root = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
  overflow: hidden;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-wrap: wrap;
  flex-shrink: 0;

  @media ${mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 12px;
  }
`;

/* On desktop these wrappers are layout-transparent so the toolbar matches the
   original single flex row (search, summary, buttons). Mobile uses them to stack. */
export const ToolbarTop = styled.div`
  @media not ${mobile} {
    display: contents;
  }

  @media ${mobile} {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    width: 100%;
  }
`;

export const ToolbarActions = styled.div`
  @media not ${mobile} {
    display: contents;
  }

  @media ${mobile} {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;

    & > * {
      display: flex;
      min-width: 0;
    }

    button {
      width: 100%;
      justify-content: center;
      text-align: center;
      padding: 10px 8px;
      font-size: 10px;
      letter-spacing: 0.6px;
      line-height: 1.2;
      white-space: normal;
    }

    & > *:last-child:nth-child(odd):not(:only-child) {
      grid-column: 1 / -1;
    }
  }
`;

export const Search = styled.input`
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
  }

  &:focus {
    border-color: ${({ theme }) => theme.color.accent};
  }

  &::placeholder {
    color: ${({ theme }) => theme.color.placeholder};
  }
`;

export const Summary = styled.div`
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
  flex-shrink: 0;

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }

  @media ${mobile} {
    justify-content: space-between;
    width: 100%;
    font-size: 12px;
  }
`;

export const Banner = styled.div<{ $bad?: boolean }>`
  padding: 12px 16px;
  border-bottom: 1px solid
    ${({ $bad, theme }) =>
      $bad
        ? `color-mix(in srgb, ${theme.color.bad} 45%, transparent)`
        : theme.color.border};
  background: ${({ $bad, theme }) =>
    $bad
      ? `color-mix(in srgb, ${theme.color.bad} 10%, transparent)`
      : `color-mix(in srgb, ${theme.color.accent} 8%, transparent)`};
  color: ${({ theme }) => theme.color.text};
  font-size: 13px;
  line-height: 1.5;
  flex-shrink: 0;
`;

export const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
`;

export const Table = styled.table`
  ${procTableBase}
  width: 100%;

  @media ${mobile} {
    min-width: 520px;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.color.panel};
  }

  td.desc {
    max-width: 360px;
    white-space: normal;
    line-height: 1.4;
  }

  td.status {
    color: ${({ theme }) => theme.color.good};
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  td.mono {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 12px;
  }
`;

export const ProgressWrap = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
`;

export const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  margin-bottom: 8px;
`;

export const ProgressTrack = styled.div`
  height: 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.track};
  overflow: hidden;
`;

export const ProgressFill = styled.div<{ $value: number }>`
  height: 100%;
  width: ${({ $value }) => `${Math.max(0, Math.min(100, $value))}%`};
  background: ${({ theme }) => theme.color.accent};
  transition: width 0.3s ease;
`;

export const LogPanel = styled.pre`
  margin: 0;
  padding: 12px 16px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.panel2};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  flex-shrink: 0;
`;

export const Empty = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
  font-size: 14px;
`;

export const OverviewTeaser = styled.button<{ $accent?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 16px;
  padding: 12px 14px;
  text-align: left;
  background: ${({ $accent, theme }) =>
    $accent
      ? `color-mix(in srgb, ${theme.color.good} 10%, ${theme.color.panel})`
      : theme.color.panel2};
  border: 1px solid
    ${({ $accent, theme }) =>
      $accent
        ? `color-mix(in srgb, ${theme.color.good} 35%, transparent)`
        : theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.accent};
    background: ${({ theme }) =>
      `color-mix(in srgb, ${theme.color.accent} 8%, transparent)`};
  }

  &:disabled {
    cursor: default;
    opacity: 0.85;
  }

  .chevron {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.muted};
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const OverviewIcon = styled.span<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ $accent, theme }) =>
    $accent
      ? `color-mix(in srgb, ${theme.color.good} 18%, transparent)`
      : `color-mix(in srgb, ${theme.color.accent} 12%, transparent)`};
  color: ${({ $accent, theme }) => ($accent ? theme.color.good : theme.color.accent)};
  flex-shrink: 0;
`;

export const OverviewBody = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const OverviewTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
`;

export const OverviewMeta = styled.span<{ $good?: boolean; $muted?: boolean }>`
  font-size: 12px;
  line-height: 1.4;
  color: ${({ $good, $muted, theme }) =>
    $good ? theme.color.good : $muted ? theme.color.muted : theme.color.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const AppPanel = styled.section`
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
`;

export const AppPanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  flex-wrap: wrap;

  @media ${mobile} {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 12px 8px;
  }
`;

export const AppPanelTitle = styled.h2`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
`;

export const AppPanelActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  @media ${mobile} {
    width: 100%;

    button {
      flex: 1;
      justify-content: center;
    }
  }
`;

export const AppPanelMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 0 16px 12px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: ${({ theme }) => theme.color.accent};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

export const AppPanelSelect = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: min(100%, 280px);
  padding: 0 16px 14px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const SectionHead = styled.h3`
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

export const BackupList = styled.div`
  max-height: 280px;
  overflow: auto;
  flex-shrink: 0;
`;

export const BackupTable = styled.table`
  ${procTableBase}

  thead th {
    cursor: default;
  }

  th,
  td {
    padding: 8px 16px;
  }
`;

export const BackupEmpty = styled.div`
  padding: 16px 16px 18px;
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
`;

export const ConfirmField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 0;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};

  input {
    padding: 8px 10px;
    background: ${({ theme }) => theme.color.bg};
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.sm};
    color: ${({ theme }) => theme.color.text};
    font: inherit;
  }
`;



