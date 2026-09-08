import styled, { css } from "styled-components";
import { mobile } from "../../theme/media";

export const Grid = styled.div<{ $rowHeight: number; $gap: number; $editing?: boolean }>`
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-rows: ${({ $rowHeight }) => $rowHeight}px;
  gap: ${({ $gap }) => $gap}px;
  ${({ $editing }) =>
    $editing &&
    css`
      min-height: 40vh;
    `}

  @media ${mobile} {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
`;

export const Item = styled.div<{
  $x: number;
  $y: number;
  $w: number;
  $h: number;
  $editing?: boolean;
  $dragging?: boolean;
  $previewing?: boolean;
  $grouped?: boolean;
  $restricted?: boolean;
}>`
  position: relative;
  grid-column: ${({ $x, $w }) => `${$x + 1} / span ${$w}`};
  grid-row: ${({ $y, $h }) => `${$y + 1} / span ${$h}`};
  min-width: 0;
  min-height: 0;
  height: 100%;
  z-index: ${({ $dragging, $previewing }) => ($dragging || $previewing ? 4 : 1)};
  opacity: ${({ $dragging, $previewing, $restricted }) =>
    $previewing ? 0.5 : $dragging ? 0.92 : $restricted ? 0.45 : 1};

  ${({ $editing, $grouped, theme }) =>
    $editing &&
    !$grouped &&
    css`
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: ${theme.color.panel};
      border: 1px solid ${theme.color.border};
      border-radius: 0;
      box-shadow: ${theme.elev};
      outline: 1px dashed color-mix(in srgb, ${theme.color.accent} 55%, transparent);
      outline-offset: -1px;

      .chart-card {
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 0;
      }
    `}

  ${({ $grouped, $editing }) =>
    $grouped &&
    css`
      background: transparent;
      border: none;
      box-shadow: none;
      outline: none;
      ${$editing &&
      css`
        display: flex;
        flex-direction: column;
        overflow: hidden;
      `}

      .chart-card {
        background: transparent;
        border: none;
        box-shadow: none;
        padding: ${$editing ? "0" : "8px 12px"};
      }
    `}

  @media ${mobile} {
    grid-column: auto;
    grid-row: auto;
    height: auto;
    min-height: 0;
  }
`;

export const SizeGhost = styled.div<{
  $x: number;
  $y: number;
  $w: number;
  $h: number;
}>`
  grid-column: ${({ $x, $w }) => `${$x + 1} / span ${$w}`};
  grid-row: ${({ $y, $h }) => `${$y + 1} / span ${$h}`};
  pointer-events: none;
  z-index: 6;
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 22%, transparent);
  outline: 1px dashed ${({ theme }) => theme.color.accent};
  outline-offset: -1px;
  border-radius: 0;

  @media ${mobile} {
    display: none;
  }
`;

export const ItemBody = styled.div<{ $editing?: boolean; $grouped?: boolean }>`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  ${({ $grouped, $editing }) => $grouped && !$editing && "padding: 12px 14px 14px;"}
  ${({ $editing }) =>
    $editing &&
    css`
      flex: 1;
      height: auto;
      overflow: hidden;
    `}

  @media ${mobile} {
    height: auto;
  }
`;

export const EditHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-height: 32px;
  padding: 4px 6px 4px 18px;
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 14%, ${({ theme }) => theme.color.panel});
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  cursor: grab;
  user-select: none;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
`;

export const EditHeaderName = styled.span`
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.text};
`;

export const EditBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px 16px;
`;

export const TitleActions = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
`;

export const RestrictedMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: ${({ theme }) => theme.color.muted};
`;

export const CardShell = styled.section`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
  padding: 18px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;

  @media ${mobile} {
    padding: 14px;
    height: auto;
  }
`;

export const CardTitle = styled.h2<{ $editing?: boolean }>`
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 14px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: ${({ theme }) => theme.color.muted};
  ${({ $editing }) =>
    $editing &&
    css`
      cursor: grab;
      user-select: none;

      &:active {
        cursor: grabbing;
      }
    `}

  &::before {
    content: "";
    width: 16px;
    height: 2px;
    flex-shrink: 0;
    background: ${({ theme }) => theme.color.accent};
  }
`;

export const DragHandle = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel};
  color: ${({ theme }) => theme.color.text};
  cursor: grab;
  flex-shrink: 0;
  touch-action: none;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
  }

  &:active {
    cursor: grabbing;
  }
`;

export const ResizeHandle = styled.span<{ $edge: "e" | "s" | "se" | "nw" }>`
  display: none;
  position: absolute;
  z-index: 3;
  touch-action: none;

  html[data-layout-edit="true"] & {
    display: block;
  }

  ${({ $edge }) =>
    $edge === "e" &&
    css`
      top: 18px;
      right: -3px;
      width: 10px;
      bottom: 18px;
      cursor: ew-resize;
    `}

  ${({ $edge }) =>
    $edge === "s" &&
    css`
      left: 18px;
      right: 18px;
      bottom: -3px;
      height: 10px;
      cursor: ns-resize;
    `}

  ${({ $edge }) =>
    $edge === "se" &&
    css`
      right: 0;
      bottom: 0;
      width: 14px;
      height: 14px;
      z-index: 4;
      cursor: nwse-resize;
      background: color-mix(in srgb, var(--accent) 55%, transparent);
      border-radius: 0;
    `}

  ${({ $edge }) =>
    $edge === "nw" &&
    css`
      left: 0;
      top: 0;
      width: 14px;
      height: 14px;
      z-index: 4;
      cursor: nwse-resize;
      background: color-mix(in srgb, var(--accent) 55%, transparent);
      border-radius: 0;
    `}

  @media ${mobile} {
    display: none !important;
  }
`;

export const EditBar = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  flex: 0 0 auto;
  margin: 0 0 4px;
  padding: 8px;
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 12%, transparent);
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.color.accent} 35%, transparent);
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.text};

  .muted {
    font-size: 11px;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const EditBarHead = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  line-height: 1.2;
`;

export const EditBarTitle = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

export const EditHintBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  appearance: none;
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: help;
  flex-shrink: 0;

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.text};
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 12%, transparent);
  }
`;

export const EditActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  align-content: start;
`;

export const EditCell = styled.div`
  min-width: 0;
  display: flex;

  > * {
    flex: 1;
    width: 100%;
    min-width: 0;
    display: flex;
  }

  button {
    flex: 1;
    width: 100%;
    min-width: 0;
    margin: 0;
  }
`;

export const EditBarBtn = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  height: 28px;
  padding: 0 4px;
  background: ${({ $primary, theme }) => ($primary ? theme.color.accent : "transparent")};
  border: 1px solid
    ${({ $primary, theme }) => ($primary ? theme.color.accent : theme.color.hairline)};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ $primary, theme }) => ($primary ? theme.color.onAccent : theme.color.text)};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease,
    filter 0.15s ease;

  &:hover:not(:disabled) {
    ${({ $primary, theme }) =>
      $primary
        ? "filter: brightness(1.08);"
        : `
      background: ${theme.color.accent};
      border-color: ${theme.color.accent};
      color: ${theme.color.onAccent};
    `}
  }

  &:disabled {
    opacity: 0.55;
    cursor: default;
    pointer-events: none;
  }
`;

export const GroupShell = styled.div<{
  $x: number;
  $y: number;
  $w: number;
  $h: number;
  $editing?: boolean;
}>`
  display: grid;
  grid-template-columns: repeat(${({ $w }) => $w}, minmax(0, 1fr));
  grid-template-rows: repeat(${({ $h }) => $h}, minmax(0, 1fr));
  grid-column: ${({ $x, $w }) => `${$x + 1} / span ${$w}`};
  grid-row: ${({ $y, $h }) => `${$y + 1} / span ${$h}`};
  min-width: 0;
  min-height: 0;
  overflow: ${({ $editing }) => ($editing ? "visible" : "hidden")};
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ $editing, theme }) => ($editing ? "0" : theme.radius.base)};
  box-shadow: ${({ theme }) => theme.elev};
  z-index: 1;
  ${({ $editing, theme }) =>
    $editing &&
    css`
      outline: 1px dashed ${theme.color.accent};
      outline-offset: -1px;
    `}

  @media ${mobile} {
    display: contents;
  }
`;

export const PanelMenuBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  flex-shrink: 0;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const PanelMenuPop = styled.div`
  position: fixed;
  z-index: 5000;
  box-sizing: border-box;
  overflow: auto;
  overscroll-behavior: contain;
  max-width: calc(100vw - 16px);
  padding: 6px;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: 0 12px 32px ${({ theme }) => theme.color.shadow};
`;

export const PanelMenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  background: transparent;
  color: ${({ $danger, theme }) => ($danger ? theme.color.bad : theme.color.text)};
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};

  &:hover {
    background: ${({ $danger, theme }) =>
      $danger ? `color-mix(in srgb, ${theme.color.bad} 16%, transparent)` : theme.color.hover};
    color: ${({ $danger, theme }) => ($danger ? theme.color.bad : theme.color.text)};
  }
`;

export const PanelMenuSection = styled.div`
  &:not(:first-child) {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid ${({ theme }) => theme.color.hairline};
  }
`;

export const PanelMenuLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const PanelCheck = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  font-size: 13px;
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};

  input {
    accent-color: ${({ theme }) => theme.color.accent};
  }
`;

export const PanelCheckHint = styled.span`
  margin-left: auto;
  font-size: 10px;
  color: ${({ theme }) => theme.color.muted};
`;

export const AddMenu = styled.div`
  position: relative;
  min-width: 0;
  display: flex;

  > * {
    flex: 1;
    width: 100%;
    min-width: 0;
    display: flex;
  }

  button {
    flex: 1;
    width: 100%;
    min-width: 0;
    margin: 0;
  }
`;

export const AddMenuPop = styled.div`
  position: fixed;
  z-index: 5000;
  box-sizing: border-box;
  overflow: auto;
  overscroll-behavior: contain;
  max-width: calc(100vw - 16px);
  padding: 6px;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: 0 12px 32px ${({ theme }) => theme.color.shadow};
`;

export const AddMenuCat = styled.div`
  padding: 6px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const HiddenStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  background: color-mix(in srgb, ${({ theme }) => theme.color.muted} 8%, transparent);
  border: 1px dashed ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const HiddenStripLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const HiddenChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel};
  color: ${({ theme }) => theme.color.text};
  font-size: 12px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
  }
`;
