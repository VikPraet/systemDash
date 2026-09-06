import styled, { css } from "styled-components";
import { GhostBtn, ModalOverlay } from "../ui/styles";
import { mobile } from "../../theme/media";

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
`;

export const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

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

export const HeadLeft = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;

  .muted {
    color: ${({ theme }) => theme.color.muted};
    font-size: 13px;
  }
`;

export const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

export const Btn = styled(GhostBtn)`
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }
`;

export const Accounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const AccountWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px 4px 10px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel};
`;

export const AccountChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 2px 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  text-align: left;

  strong {
    font-weight: 600;
  }

  span {
    color: ${({ theme }) => theme.color.muted};
  }

  &:hover strong {
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const ProfileHead = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  img {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid ${({ theme }) => theme.color.border};
  }
`;

export const ProfileName = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 15px;
  }

  a {
    color: ${({ theme }) => theme.color.accent};
    font-size: 12px;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a:hover {
    text-decoration: underline;
  }
`;

export const ScopeList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  span {
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.sm};
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const ChipBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.bad};
  }
`;

export const Banner = styled.div<{ $bad?: boolean }>`
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.base};
  border: 1px solid
    ${({ $bad, theme }) =>
      $bad
        ? `color-mix(in srgb, ${theme.color.bad} 45%, transparent)`
        : theme.color.border};
  background: ${({ $bad, theme }) =>
    $bad
      ? `color-mix(in srgb, ${theme.color.bad} 10%, transparent)`
      : theme.color.panel};
  color: ${({ theme }) => theme.color.text};
  font-size: 13px;
  line-height: 1.45;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`;

export const Card = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  text-align: left;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
  }
`;

export const CardTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
`;

export const CardMeta = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  word-break: break-all;
  line-height: 1.45;
`;

export const BranchLine = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  word-break: break-all;

  svg {
    flex-shrink: 0;
  }
`;

export const Empty = styled.div`
  padding: 40px 16px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  font-size: 14px;
  line-height: 1.5;

  strong {
    color: ${({ theme }) => theme.color.text};
  }
`;

export const Back = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: none;
  border: none;
  color: ${({ theme }) => theme.color.muted};
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

export const Detail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
`;

export const DetailPanel = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  overflow: hidden;
`;

export const DetailHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  flex-wrap: wrap;
`;

export const DetailTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
`;

export const StatusLine = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.45;

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }

  code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 12px;
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const SectionLabel = styled.h3`
  margin: 0;
  padding: 12px 16px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const SiteForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
`;

export const SiteLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.color.accent};
  text-decoration: none;
  font-size: 12px;

  &:hover {
    text-decoration: underline;
  }

  svg {
    flex-shrink: 0;
  }
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
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
  ${({ $on }) => $on && "transform: translateX(16px);"}
`;

export const CheckRow = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  user-select: none;

  input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
  }

  input:focus-visible + ${Switch} {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.bg},
      0 0 0 4px ${({ theme }) => theme.color.accent};
  }

  &:hover ${Switch} {
    filter: brightness(1.12);
  }
`;

export const ActionCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 16px;
  padding: 14px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.panel2};
`;

export const ActionTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

export const ActionName = styled.div`
  font-weight: 600;
  font-size: 14px;
`;

export const ActionBtns = styled.div`
  display: flex;
  gap: 8px;
`;

export const Steps = styled.ol`
  margin: 0;
  padding: 0 0 0 18px;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.5;

  li + li {
    margin-top: 2px;
  }

  code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 12px;
    color: ${({ theme }) => theme.color.text};
  }
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
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
`;

export const ProgressWrap = styled.div`
  padding: 0 16px 12px;
`;

export const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
`;

export const ProgressTrack = styled.div`
  height: 6px;
  border-radius: 99px;
  background: ${({ theme }) => theme.color.track};
  overflow: hidden;
`;

export const ProgressFill = styled.div<{ $value: number }>`
  height: 100%;
  width: ${({ $value }) => Math.max(0, Math.min(100, $value))}%;
  background: ${({ theme }) => theme.color.accent};
  transition: width 0.2s ease;
`;

export const RunPill = styled.span<{ $status?: "ok" | "error" | "running" }>`
  font-size: 11px;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.muted};

  ${({ $status, theme }) =>
    $status === "ok"
      ? css`
          color: ${theme.color.good};
          border-color: ${theme.color.good};
          background: rgba(51, 201, 142, 0.1);
        `
      : $status === "error"
      ? css`
          color: ${theme.color.bad};
          border-color: ${theme.color.bad};
          background: rgba(232, 106, 111, 0.1);
        `
      : $status === "running"
      ? css`
          color: ${theme.color.accent};
          border-color: ${theme.color.accent};
          background: rgba(79, 140, 255, 0.1);
        `
      : null}
`;

export const FormStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};

  input,
  textarea {
    padding: 11px 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: 15px;
    font-weight: 400;
    letter-spacing: 0.2px;
    text-transform: none;
    outline: none;
    font-family: inherit;
  }

  textarea {
    min-height: 64px;
    resize: vertical;
  }

  input::placeholder,
  textarea::placeholder {
    color: rgba(230, 237, 246, 0.35);
  }

  input:focus,
  textarea:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;

export const FieldHint = styled.span`
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme }) => theme.color.muted};
  word-break: break-all;
  line-height: 1.4;

  code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 11px;
    color: ${({ theme }) => theme.color.accent};
  }
`;

export const WideModal = styled.div`
  width: 100%;
  max-width: 560px;
  max-height: min(86vh, 820px);
  overflow: auto;
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

  > * {
    flex-shrink: 0;
  }
`;

export const RepoSearch = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 9px 2px;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
  color: ${({ theme }) => theme.color.text};
  font-size: 14px;
  outline: none;

  &:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }

  &::placeholder {
    color: rgba(230, 237, 246, 0.35);
  }
`;

export const RepoList = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const RepoRow = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  background: ${({ $active, theme }) =>
    $active ? `color-mix(in srgb, ${theme.color.accent} 12%, transparent)` : "transparent"};
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};
  text-align: left;
  cursor: pointer;
  font-size: 13px;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.panel2};
  }

  span {
    color: ${({ theme }) => theme.color.muted};
    font-size: 11px;
  }
`;

export const StepList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const StepRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg};
`;

export const StepTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const StepIndex = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
  min-width: 18px;
`;

export const StepMove = styled.div`
  display: flex;
  gap: 4px;
  margin-left: auto;
`;

export const IconBtn = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;

  &:hover:not(:disabled) {
    color: ${({ $danger, theme }) => ($danger ? theme.color.bad : theme.color.text)};
    border-color: ${({ $danger, theme }) =>
      $danger ? theme.color.bad : theme.color.accent};
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`;

export const PathRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  input {
    flex: 1;
    min-width: 0;
    width: auto;
  }

  ${Btn} {
    flex-shrink: 0;
    padding: 8px 10px;
    letter-spacing: 1px;
  }
`;

export const PickerOverlay = styled(ModalOverlay)`
  z-index: 110;
`;

export const PickerNav = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const PickerPath = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.muted};
  word-break: break-all;
`;

export const PickerList = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 360px;
  min-height: 180px;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const PickerRow = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.text};
  text-align: left;
  cursor: pointer;
  font-size: 13px;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.panel2};
  }

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.accent};
  }

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .muted {
    margin-left: auto;
    color: ${({ theme }) => theme.color.muted};
    font-size: 11px;
    flex-shrink: 0;
  }
`;

export const PickerEmpty = styled.div`
  padding: 28px 12px;
  text-align: center;
  color: ${({ theme }) => theme.color.muted};
  font-size: 13px;
`;
