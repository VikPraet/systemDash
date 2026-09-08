import styled from "styled-components";
import { procTableBase } from "../ui/styles";
import { mobile } from "../../theme/media";

export const FilesRoot = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
  overflow: hidden;
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;

  /* Inline SVG glyph utilities, scoped to the Files panel. */
  .act-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ficon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .ficon.folder path {
    fill: ${({ theme }) => theme.color.accent};
  }

  .ficon.file path {
    fill: none;
    stroke: ${({ theme }) => theme.color.muted};
    stroke-width: 1.5;
  }

  .ficon-ext {
    fill: ${({ theme }) => theme.color.muted};
    font-size: 6px;
    text-transform: uppercase;
  }

  .ficon-sm {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`;

export const FilesToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-wrap: wrap;
  flex-shrink: 0;
`;

export const FilesRoots = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: transparent;
    border: 1px solid ${({ theme }) => theme.color.hairline};
    color: ${({ theme }) => theme.color.text};
    padding: 7px 12px;
    border-radius: ${({ theme }) => theme.radius.sm};
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: background-color 0.18s ease, border-color 0.18s ease,
      color 0.18s ease;
  }

  button:hover {
    background: ${({ theme }) => theme.color.accent};
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }

  button.active {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const FilesSearch = styled.input`
  flex: 1;
  min-width: 200px;
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
    color: ${({ theme }) => theme.color.placeholder};
  }
`;

export const FilesSettingsBtn = styled.button`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.hairline};
  color: ${({ theme }) => theme.color.text};
  padding: 7px 12px;
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  transition: background-color 0.18s ease, border-color 0.18s ease,
    color 0.18s ease;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.color.accent};
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }
`;

export const FilesNav = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.panel2};
  flex-shrink: 0;
`;

export const FilesUp = styled.button`
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  font-size: 15px;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const Crumbs = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: 13px;
  overflow: hidden;
`;

export const Crumb = styled.span`
  display: inline-flex;
  align-items: center;

  .crumb-sep {
    color: ${({ theme }) => theme.color.muted};
    margin: 0 2px;
  }

  button {
    background: none;
    border: none;
    color: ${({ theme }) => theme.color.muted};
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 6px;
    font-size: 13px;
  }

  button:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bg};
  }

  &:last-child button {
    color: ${({ theme }) => theme.color.text};
    font-weight: 500;
  }
`;

export const FilesActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
  flex-wrap: wrap;

  > button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid ${({ theme }) => theme.color.hairline};
    color: ${({ theme }) => theme.color.text};
    padding: 7px 12px;
    border-radius: ${({ theme }) => theme.radius.sm};
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    transition: background-color 0.18s ease, border-color 0.18s ease,
      color 0.18s ease;
  }

  > button:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.accent};
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }

  > button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  > button.paste {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: normal;
    text-transform: none;
    font-size: 13px;
    font-weight: 500;
  }

  > button.paste span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const FilesActionsStatus = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  min-width: 0;

  .bad {
    color: ${({ theme }) => theme.color.bad};
  }
`;

export const FilesBody = styled.div`
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;

  @media ${mobile} {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
`;

export const FilesMessage = styled.div<{ $bad?: boolean }>`
  padding: 40px;
  text-align: center;
  ${({ $bad, theme }) => $bad && `color: ${theme.color.bad};`}
`;

export const FilesTable = styled.table`
  ${procTableBase}

  @media ${mobile} {
    min-width: 560px;
  }

  thead th {
    background: ${({ theme }) => theme.color.panel};
  }

  .proc-empty {
    text-align: center;
    padding: 28px;
  }

  .file-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: none;
    color: ${({ theme }) => theme.color.text};
    cursor: pointer;
    font-size: 13px;
    text-align: left;
    max-width: 520px;
  }

  .file-name:disabled {
    cursor: default;
  }

  .file-name:hover .file-label {
    color: ${({ theme }) => theme.color.accent};
  }

  .file-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-cut {
    opacity: 0.5;
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    justify-content: flex-end;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  tbody tr:hover .row-actions {
    opacity: 1;
  }

  .row-act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: 1px solid transparent;
    border-radius: ${({ theme }) => theme.radius.sm};
    color: ${({ theme }) => theme.color.muted};
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .row-act:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.border};
    background: ${({ theme }) => theme.color.bg};
  }

  .row-act.danger:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.bad};
    border-color: ${({ theme }) => theme.color.bad};
  }

  .row-act:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .size-loading {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid ${({ theme }) => theme.color.track};
    border-top-color: ${({ theme }) => theme.color.muted};
    border-radius: 50%;
    vertical-align: middle;
    animation: spin 0.7s linear infinite;
  }
`;

/* ---- This PC / drive cards ---------------------------------------------- */
export const DriveSection = styled.div`
  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }
`;

export const DriveSectionTitle = styled.h3`
  margin: 0;
  padding: 16px 18px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const Drives = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 18px;

  @media ${mobile} {
    grid-template-columns: 1fr;
    padding: 12px;
    gap: 10px;
  }
`;

export const DriveCard = styled.button<{ $offline?: boolean }>`
  position: relative;
  text-align: left;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
  ${({ $offline }) => $offline && "opacity: 0.72;"}

  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
    background: ${({ theme }) => theme.color.panel2};
  }
`;

export const DriveCardRemove = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;
  font-size: 16px;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.color.bad};
    border-color: ${({ theme }) => theme.color.bad};
  }
`;

export const AddDriveCard = styled.button`
  text-align: left;
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  padding: 16px;
  min-height: 108px;
  cursor: pointer;
  color: ${({ theme }) => theme.color.muted};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;

  .ficon-sm {
    width: 22px;
    height: 22px;
  }

  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.accent};
    background: ${({ theme }) => theme.color.panel2};
  }
`;

export const DriveCardHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  color: ${({ theme }) => theme.color.text};
  padding-right: 22px;

  .ficon-sm {
    width: 22px;
    height: 22px;
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const DriveName = styled.span`
  font-size: 15px;
  font-weight: 600;

  .drive-label {
    font-weight: 400;
    font-size: 13px;
  }
`;

export const DriveMeta = styled.div`
  margin-top: 8px;
  font-size: 12px;
`;

/* ---- Settings dialog ----------------------------------------------------- */
export const SettingsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
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

export const Switch = styled.span<{ $on?: boolean }>`
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: ${({ $on, theme }) =>
    $on ? theme.color.accent : theme.color.border};
  position: relative;
  transition: background 0.15s ease;
`;

export const SwitchKnob = styled.span<{ $on?: boolean }>`
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.knob};
  transition: transform 0.15s ease;
  ${({ $on }) => $on && "transform: translateX(16px);"}
`;

export const ShareForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
`;

export const ProtocolRow = styled.div`
  display: flex;
  gap: 6px;
`;

export const ProtocolBtn = styled.button<{ $on?: boolean }>`
  flex: 1;
  background: transparent;
  border: 1px solid
    ${({ $on, theme }) => ($on ? theme.color.accent : theme.color.hairline)};
  color: ${({ $on, theme }) => ($on ? theme.color.accent : theme.color.text)};
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
`;

export const ShareHint = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
`;

export const ShareCreds = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg};
`;

export const ShareCredsTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

export const GuestToggle = styled.button`
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  color: ${({ theme }) => theme.color.accent};
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
`;
