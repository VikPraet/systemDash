import styled from "styled-components";

export const TerminalTab = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0b0e14;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  overflow: hidden;
`;

export const TerminalBar = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.panel2};
  flex-shrink: 0;
`;

export const TerminalTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

export const TerminalHint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
`;

export const TerminalHost = styled.div`
  flex: 1;
  min-height: 0;
  padding: 8px 10px;

  .xterm {
    height: 100%;
  }
`;
