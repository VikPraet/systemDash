import styled from "styled-components";
import { procTableBase } from "../ui/styles";
import { mobile } from "../../theme/media";

export const DockerRoot = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  overflow: hidden;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

export const DockerToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-wrap: wrap;
  flex-shrink: 0;
`;

export const DockerSearch = styled.input`
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

export const DockerSummary = styled.div`
  display: flex;
  gap: 16px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.muted};
  flex-shrink: 0;

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }
`;

export const DockerBanner = styled.div<{ $bad?: boolean }>`
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

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    padding: 1px 5px;
    border-radius: ${({ theme }) => theme.radius.sm};
    background: ${({ theme }) => theme.color.panel2};
    border: 1px solid ${({ theme }) => theme.color.border};
  }
`;

export const DockerBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
`;

export const DockerTable = styled.table`
  ${procTableBase}
  width: 100%;

  @media ${mobile} {
    min-width: 720px;
  }

  .row-running td:first-child {
    box-shadow: inset 3px 0 0 ${({ theme }) => theme.color.good};
  }

  .state-pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    border-radius: ${({ theme }) => theme.radius.sm};
    border: 1px solid ${({ theme }) => theme.color.border};
    color: ${({ theme }) => theme.color.muted};
  }

  .state-pill.running {
    color: ${({ theme }) => theme.color.good};
    border-color: color-mix(in srgb, ${({ theme }) => theme.color.good} 45%, transparent);
    background: color-mix(in srgb, ${({ theme }) => theme.color.good} 10%, transparent);
  }

  .mono-sm {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }

  .row-actions {
    display: inline-flex;
    gap: 4px;
    justify-content: flex-end;
  }

  .row-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.sm};
    background: transparent;
    color: ${({ theme }) => theme.color.muted};
    cursor: pointer;
    transition: all 0.12s ease;

    &:hover:not(:disabled) {
      color: ${({ theme }) => theme.color.text};
      border-color: ${({ theme }) => theme.color.accent};
      background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 10%, transparent);
    }

    &.danger:hover:not(:disabled) {
      color: ${({ theme }) => theme.color.bad};
      border-color: ${({ theme }) => theme.color.bad};
      background: color-mix(in srgb, ${({ theme }) => theme.color.bad} 10%, transparent);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .proc-empty {
    text-align: center;
    padding: 28px;
  }
`;

export const LogsModalCard = styled.div`
  width: min(1100px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.color.panel2},
    ${({ theme }) => theme.color.panel}
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
`;

export const LogsBody = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

export const LogsPre = styled.pre`
  margin: 0;
  flex: 1;
  min-height: 320px;
  max-height: calc(88vh - 150px);
  overflow: auto;
  padding: 14px 16px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: ${({ theme }) => theme.color.text};
`;
