import styled from "styled-components";

export const TerminalRoot = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  overflow: hidden;
  max-height: 100%;
  min-height: 0;
  height: calc(100vh - 80px);
  min-height: 420px;
  display: flex;
  flex-direction: column;
`;

export const TerminalBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
  flex-wrap: wrap;
`;

export const TerminalTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
`;

export const TerminalTabBtn = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 6px 10px;
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.color.accent : theme.color.border)};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ $active, theme }) =>
    $active ? `color-mix(in srgb, ${theme.color.accent} 10%, transparent)` : "transparent"};
  color: ${({ $active, theme }) => ($active ? theme.color.text : theme.color.muted)};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
  }
`;

export const TerminalTabTitle = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
`;

export const TerminalTabRenameInput = styled.input`
  width: 100px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;

  &::selection {
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 35%, transparent);
  }
`;

export const TerminalTabClose = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  margin: 0 -2px 0 0;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: inherit;
  opacity: 0.65;
  cursor: pointer;

  &:hover {
    opacity: 1;
    background: color-mix(in srgb, ${({ theme }) => theme.color.bad} 18%, transparent);
    color: ${({ theme }) => theme.color.bad};
  }
`;

export const TerminalBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

export const TerminalHint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  letter-spacing: 0.02em;
  white-space: nowrap;

  @media (max-width: 900px) {
    display: none;
  }
`;

export const TerminalBody = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.panel};
`;

export const TerminalPaneStack = styled.div<{
  $cell: "main" | "primary" | "secondary";
  $focused?: boolean;
}>`
  position: relative;
  min-width: 0;
  min-height: 0;
  grid-area: ${({ $cell }) => $cell};
  background: ${({ theme }) => theme.color.panel2};
  outline: ${({ $focused, theme }) =>
    $focused
      ? `2px solid color-mix(in srgb, ${theme.color.accent} 40%, transparent)`
      : "none"};
  outline-offset: -2px;
`;

export const TerminalPaneArea = styled.div<{ $split: "none" | "horizontal" | "vertical" }>`
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: ${({ $split }) => ($split === "horizontal" ? "1fr 1fr" : "1fr")};
  grid-template-rows: ${({ $split }) => ($split === "vertical" ? "1fr 1fr" : "1fr")};
  grid-template-areas: ${({ $split }) =>
    $split === "horizontal"
      ? `"primary secondary"`
      : $split === "vertical"
        ? `"primary" "secondary"`
        : `"main"`};
  gap: ${({ $split }) => ($split === "none" ? 0 : "1px")};
  background: ${({ $split, theme }) => ($split === "none" ? "transparent" : theme.color.border)};
`;

export const TerminalPane = styled.div<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  visibility: ${({ $visible }) => ($visible ? "visible" : "hidden")};
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
  z-index: ${({ $visible }) => ($visible ? 1 : 0)};
`;

export const TerminalHost = styled.div`
  flex: 1;
  min-height: 0;
  position: relative;
  padding: 8px 10px;

  .xterm {
    height: 100%;
    width: 100%;
  }

  .xterm-viewport {
    overflow-y: auto !important;
  }

  .xterm-char-measure-element,
  .xterm-width-cache-measure-container {
    position: absolute !important;
    left: -9999em !important;
    top: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
    overflow: hidden !important;
  }
`;
