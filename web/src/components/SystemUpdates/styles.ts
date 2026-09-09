import styled, { css, keyframes } from "styled-components";
import { mobile } from "../../theme/media";

type Tone = "good" | "warn" | "bad" | "accent" | "muted";

/* ---- Page shell --------------------------------------------------------- */
export const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
`;

export const Head = styled.div`
  display: flex;
  align-items: center;
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
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

export const HeadSub = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
`;

export const HeadActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

/* ---- Card --------------------------------------------------------------- */
export const Card = styled.section`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
  padding: 18px;
  min-width: 0;

  @media ${mobile} {
    padding: 14px;
  }
`;

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
`;

export const CardTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
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
`;

export const CardActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;

  @media ${mobile} {
    width: 100%;

    button {
      flex: 1;
      justify-content: center;
    }
  }
`;

/* Card content below the head. A flex column so every block (note, banner,
   toolbar, list, progress) is spaced by one rule instead of ad-hoc margins. */
export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
`;

export const CardNote = styled.p`
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.muted};
`;

export const Pill = styled.span<{ $tone?: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ $tone = "muted", theme }) => theme.color[$tone]};
  background: color-mix(
    in srgb,
    ${({ $tone = "muted", theme }) => theme.color[$tone]} 13%,
    transparent
  );

  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: currentColor;
  }
`;

/* ---- App update hero ---------------------------------------------------- */
export const Hero = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 24px;
  flex-wrap: wrap;
  padding: 14px 16px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const Versions = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;

  .arrow {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const VersionBlock = styled.div<{ $accent?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  ${({ $accent, theme }) =>
    $accent &&
    css`
      color: ${theme.color.accent};
    `}
`;

export const VersionLabel = styled.span`
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const VersionValue = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 20px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.4px;
  overflow-wrap: anywhere;
`;

export const HeroSide = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  min-width: 0;

  @media ${mobile} {
    width: 100%;
  }
`;

export const HeroField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: min(100%, 220px);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const HeroLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-bottom: 7px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.accent};
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

export const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
  }
`;

/* ---- Banners, notes, progress, log -------------------------------------- */
export const Banner = styled.div<{ $bad?: boolean }>`
  padding: 10px 12px;
  border: 1px solid
    ${({ $bad, theme }) =>
      $bad
        ? `color-mix(in srgb, ${theme.color.bad} 40%, transparent)`
        : `color-mix(in srgb, ${theme.color.accent} 32%, transparent)`};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ $bad, theme }) =>
    $bad
      ? `color-mix(in srgb, ${theme.color.bad} 9%, transparent)`
      : `color-mix(in srgb, ${theme.color.accent} 7%, transparent)`};
  color: ${({ theme }) => theme.color.text};
  font-size: 12.5px;
  line-height: 1.5;
`;

export const Disclosure = styled.button`
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.color.muted};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }

  svg {
    transition: transform 0.15s ease;
  }

  &[aria-expanded="true"] svg {
    transform: rotate(90deg);
  }
`;

export const Notes = styled.div`
  padding: 14px 16px;
  max-height: 320px;
  overflow: auto;
  overscroll-behavior: contain;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};

  article {
    font-size: 13px;
  }

  article > :last-child {
    margin-bottom: 0;
  }
`;

export const ProgressWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const ProgressLabel = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};

  span:last-child {
    font-variant-numeric: tabular-nums;
  }
`;

export const ProgressTrack = styled.div`
  height: 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.track};
  overflow: hidden;
`;

const drift = keyframes`
  to {
    background-position: 200% 0;
  }
`;

export const ProgressFill = styled.div<{ $value: number; $active?: boolean; $bad?: boolean }>`
  height: 100%;
  border-radius: 999px;
  width: ${({ $value }) => `${Math.max(0, Math.min(100, $value))}%`};
  transition: width 0.3s ease;
  background: ${({ $bad, theme }) => ($bad ? theme.color.bad : theme.color.accent)};

  ${({ $active, $bad, theme }) =>
    $active &&
    !$bad &&
    css`
      background-image: linear-gradient(
        90deg,
        ${theme.color.accent} 0%,
        color-mix(in srgb, ${theme.color.accent} 45%, ${theme.color.track}) 50%,
        ${theme.color.accent} 100%
      );
      background-size: 200% 100%;
      animation: ${drift} 1.4s linear infinite;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}
`;

export const LogPanel = styled.pre`
  margin: 0;
  padding: 12px 14px;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.muted};
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
`;

/* ---- OS packages -------------------------------------------------------- */
export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  flex-wrap: wrap;
`;

export const Search = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 180px;
  max-width: 320px;
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

  @media ${mobile} {
    max-width: none;
  }
`;

export const SearchClear = styled.button`
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

export const SelectAll = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;
  user-select: none;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

export const Check = styled.input.attrs({ type: "checkbox" })`
  appearance: none;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin: 0;
  display: inline-grid;
  place-content: center;
  background: ${({ theme }) => theme.color.bg};
  border: 1px solid ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &::after {
    content: "";
    width: 9px;
    height: 9px;
    transform: scale(0);
    transition: transform 0.12s ease;
    background: ${({ theme }) => theme.color.onAccent};
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
  }

  &:checked {
    background: ${({ theme }) => theme.color.accent};
    border-color: ${({ theme }) => theme.color.accent};
  }

  &:checked::after {
    transform: scale(1);
  }

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.color.accent};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

export const ActionBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const ActionBarInfo = styled.span`
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.muted};

  strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
`;

export const ActionBarButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  @media ${mobile} {
    width: 100%;

    button {
      flex: 1;
      justify-content: center;
      text-align: center;
    }
  }
`;

export const PkgList = styled.div`
  display: flex;
  flex-direction: column;
  max-height: min(56vh, 560px);
  overflow: auto;
  overscroll-behavior: contain;
  margin: 0 -6px;
`;

export const PkgRow = styled.label<{ $selected?: boolean }>`
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: 6px 12px;
  padding: 10px 6px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  cursor: pointer;

  &:first-child {
    border-top: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.hover};
  }

  ${({ $selected, theme }) =>
    $selected &&
    css`
      background: color-mix(in srgb, ${theme.color.accent} 5%, transparent);
    `}

  > input {
    margin-top: 2px;
  }
`;

export const PkgTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
`;

export const PkgName = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
`;

export const SourceChip = styled.span`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.hover};
  color: ${({ theme }) => theme.color.muted};
  white-space: nowrap;
`;

export const Delta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.good};
  white-space: nowrap;

  .from {
    color: ${({ theme }) => theme.color.muted};
    text-decoration: line-through;
  }

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const PkgDesc = styled.span`
  grid-column: 2;
  font-size: 12px;
  line-height: 1.45;
  color: ${({ theme }) => theme.color.muted};
`;

/* ---- Backups ------------------------------------------------------------ */
export const BackupList = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 340px;
  overflow: auto;
  overscroll-behavior: contain;
  margin: 0 -6px;
`;

export const BackupRow = styled.div`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 6px;
  border-top: 1px solid ${({ theme }) => theme.color.border};

  &:first-child {
    border-top: none;
  }

  &:hover {
    background: ${({ theme }) => theme.color.hover};
  }

  @media ${mobile} {
    grid-template-columns: 28px minmax(0, 1fr);

    > *:last-child {
      grid-column: 2;
      justify-content: flex-start;
    }
  }
`;

export const BackupIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.accent};
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 13%, transparent);
`;

export const BackupBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

export const BackupWhen = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  font-weight: 600;
`;

export const BackupMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.muted};
  font-variant-numeric: tabular-nums;

  > * + *::before {
    content: "·";
    margin: 0 8px;
    opacity: 0.6;
  }
`;

export const ReasonChip = styled.span<{ $tone?: Tone }>`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ $tone = "muted", theme }) => theme.color[$tone]};
  background: color-mix(
    in srgb,
    ${({ $tone = "muted", theme }) => theme.color[$tone]} 13%,
    transparent
  );
  white-space: nowrap;
`;

export const RowActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
`;

/* ---- Shared states ------------------------------------------------------ */
export const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 26px 16px;
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.color.hairline};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  font-size: 12.5px;
  line-height: 1.5;

  svg {
    color: ${({ theme }) => theme.color.muted};
    opacity: 0.75;
  }

  strong {
    color: ${({ theme }) => theme.color.text};
    font-size: 13.5px;
    font-weight: 600;
  }
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

/* ---- Overview teasers (rendered on the Overview page) -------------------- */
export const OverviewTeaser = styled.button<{ $accent?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 0;
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
    opacity: 1;
  }

  .chevron {
    flex-shrink: 0;
    color: ${({ theme }) => theme.color.muted};
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  & + &,
  & + [data-skel-teaser],
  [data-skel-teaser] + & {
    margin-top: 10px;
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
