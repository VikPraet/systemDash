import { Link } from "react-router-dom";
import styled, { css } from "styled-components";
import { mobile } from "./theme/media";

/* ---- App shell ----------------------------------------------------------- */
export const AppShell = styled.div`
  --sidebar-width: 220px;
  --mobile-header-height: 52px;
  height: 100vh;
  height: 100dvh;
  display: flex;
  overflow: hidden;

  @media ${mobile} {
    flex-direction: column;
    min-height: 100dvh;
    height: auto;
    overflow: visible;
  }
`;

export const Sidebar = styled.aside`
  flex-shrink: 0;
  width: var(--sidebar-width);
  height: 100vh;
  height: 100dvh;
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 22px 14px 16px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.color.sidebar},
    ${({ theme }) => theme.color.panel} 240px
  );
  border-right: 1px solid ${({ theme }) => theme.color.border};

  @media ${mobile} {
    width: 100%;
    height: auto;
    min-height: var(--mobile-header-height);
    position: sticky;
    top: 0;
    z-index: 40;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border-right: none;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
    padding-top: env(safe-area-inset-top, 0px);
  }
`;

export const SidebarHeader = styled.div`
  @media not ${mobile} {
    display: contents;
  }

  @media ${mobile} {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--mobile-header-height);
    padding: 8px 12px 8px 10px;
    position: relative;
    z-index: 65;
    background: ${({ theme }) => theme.color.sidebar};
  }
`;

export const MenuBtn = styled.button`
  display: none;

  @media ${mobile} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    margin: 0;
    padding: 0;
    appearance: none;
    background: transparent;
    border: 1px solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.radius.icon};
    color: ${({ theme }) => theme.color.text};
    cursor: pointer;

    &:hover {
      border-color: ${({ theme }) => theme.color.accent};
      color: ${({ theme }) => theme.color.accent};
    }
  }
`;

export const MobileTopActions = styled.div`
  display: none;

  @media ${mobile} {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    flex-shrink: 0;
  }
`;

export const NavPanel = styled.div<{ $open?: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 24px;

  @media ${mobile} {
    position: fixed;
    top: calc(var(--mobile-header-height) + env(safe-area-inset-top, 0px));
    left: 0;
    bottom: 0;
    width: min(288px, 88vw);
    z-index: 60;
    flex: none;
    gap: 16px;
    padding: 16px 14px calc(env(safe-area-inset-bottom, 0px) + 16px);
    background: linear-gradient(
      180deg,
      ${({ theme }) => theme.color.sidebar},
      ${({ theme }) => theme.color.panel} 180px
    );
    border-right: 1px solid ${({ theme }) => theme.color.border};
    box-shadow: 12px 0 40px ${({ theme }) => theme.color.shadow};
    transform: translateX(${({ $open }) => ($open ? "0" : "-105%")});
    transition: transform 0.22s ease;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
`;

export const NavBackdrop = styled.button`
  display: none;

  @media ${mobile} {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 5;
    margin: 0;
    padding: 0;
    appearance: none;
    border: none;
    background: ${({ theme }) => theme.color.overlay};
    cursor: pointer;
    animation: modal-fade 0.15s ease;
  }
`;

export const Content = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;

  @media ${mobile} {
    flex: 1;
    min-height: 0;
    height: auto;
    position: relative;
    overscroll-behavior: auto;
  }
`;

/* Padding lives here instead of on `Content`. Padding on an overflow box
   leaves a gutter above `position: sticky` where scrolled rows still paint. */
export const ContentPad = styled.div`
  padding: 20px;

  @media ${mobile} {
    padding: 12px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
`;

export const ContentLayer = styled.div<{ $active?: boolean }>`
  display: ${({ $active }) => ($active ? "block" : "none")};
  max-width: 1200px;
  margin: 0 auto;
  min-height: 0;
`;

export const RecoveryNudge = styled.div`
  max-width: 1200px;
  margin: 0 auto 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 10%, transparent);
  border: 1px solid
    color-mix(in srgb, ${({ theme }) => theme.color.accent} 35%, transparent);
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 13px;
  color: ${({ theme }) => theme.color.text};
`;

export const RecoveryNudgeActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  button {
    flex-shrink: 0;
    padding: 7px 12px;
    background: transparent;
    border: 1px solid ${({ theme }) => theme.color.accent};
    border-radius: ${({ theme }) => theme.radius.sm};
    color: ${({ theme }) => theme.color.accent};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    cursor: pointer;
  }

  button:hover {
    background: ${({ theme }) => theme.color.accent};
    color: ${({ theme }) => theme.color.onAccent};
  }

  button.ghost {
    border-color: ${({ theme }) => theme.color.hairline};
    color: ${({ theme }) => theme.color.muted};
  }

  button.ghost:hover {
    background: transparent;
    border-color: ${({ theme }) => theme.color.text};
    color: ${({ theme }) => theme.color.text};
  }
`;

export const RecoverySnoozeChoices = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  button {
    flex: 1 1 auto;
    min-width: 88px;
    justify-content: center;
  }
`;

export const Brand = styled(Link)`
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 8px 0;
  min-width: 0;
  text-decoration: none;
  color: inherit;
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;

  @media ${mobile} {
    padding: 0;
    flex: 1;
    min-width: 0;
  }

  &:hover h1 {
    background: linear-gradient(
      120deg,
      ${({ theme }) => theme.color.accent},
      ${({ theme }) => theme.color.good}
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 3px;
  }

  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: linear-gradient(
      120deg,
      ${({ theme }) => theme.color.text},
      ${({ theme }) => theme.color.accent}
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

export const Version = styled.span<{ $available?: boolean }>`
  font-size: 11px;
  color: ${({ $available, theme }) => ($available ? theme.color.good : theme.color.muted)};
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid
    ${({ $available, theme }) =>
      $available
        ? `color-mix(in srgb, ${theme.color.good} 40%, transparent)`
        : theme.color.border};
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1.2;
`;

export const VersionButton = styled.button<{ $available?: boolean }>`
  appearance: none;
  margin: 0;
  font-family: inherit;
  font-size: 11px;
  font-weight: inherit;
  line-height: 1.2;
  color: ${({ $available, theme }) => ($available ? theme.color.good : theme.color.muted)};
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid
    ${({ $available, theme }) =>
      $available
        ? `color-mix(in srgb, ${theme.color.good} 40%, transparent)`
        : theme.color.border};
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

/* ---- Sidebar navigation -------------------------------------------------- */
export const Tabs = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;

  a {
    position: relative;
    display: flex;
    align-items: center;
    gap: 11px;
    text-align: left;
    text-decoration: none;
    background: transparent;
    border: 1px solid transparent;
    color: ${({ theme }) => theme.color.muted};
    padding: 10px 12px;
    border-radius: ${({ theme }) => theme.radius.sm};
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    transition: color 0.15s ease, background 0.15s ease;
  }

  a::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%) scaleY(0);
    width: 3px;
    height: 20px;
    border-radius: 999px;
    background: ${({ theme }) => theme.color.accent};
    transition: transform 0.18s ease;
  }

  a:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.panel2};
  }

  a.active {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.panel2};
    border-color: ${({ theme }) => theme.color.border};
  }

  a.active::before {
    transform: translateY(-50%) scaleY(1);
  }

  .nav-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  a.active .nav-icon {
    color: ${({ theme }) => theme.color.accent};
  }

  @media ${mobile} {
    a {
      padding: 12px 14px;
      font-size: 13px;
    }

    a::before {
      display: none;
    }
  }
`;

export const SidebarFooter = styled.div`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 12px 10px 4px;
  border-top: 1px solid ${({ theme }) => theme.color.border};

  @media ${mobile} {
    margin-top: auto;
    padding: 12px 4px 4px;
    border-top: 1px solid ${({ theme }) => theme.color.border};
  }
`;

export const SidebarFooterDesktop = styled.div`
  @media ${mobile} {
    display: none;
  }
`;

export const FooterMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;

  ${Version} {
    flex-shrink: 0;
  }
`;

export const UserChip = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 8px;
  min-width: 0;
  padding: 10px;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: ${({ theme }) => theme.elev};

  ${SidebarFooterDesktop} {
    grid-column: 1 / -1;
    grid-row: 2;
  }
`;

export const UserChipRow = styled.div`
  display: contents;

  & > span:first-child {
    grid-column: 2;
    grid-row: 1;
    align-self: center;
  }
`;

export const UserChipActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
  width: 100%;

  button {
    width: 26px;
    height: 26px;
  }
`;

export const UserChipName = styled.span`
  grid-column: 1;
  grid-row: 1;
  font-size: 13px;
  font-weight: 600;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const LogoutBtn = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.icon};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent} 10%, transparent);
  }
`;

/* ---- Connection status indicator ---------------------------------------- */
export const Status = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: ${({ $compact }) => ($compact ? 0 : "13px")};
  color: ${({ theme }) => theme.color.muted};
  cursor: default;
`;

export const Dot = styled.span<{ $state: "good" | "bad" | "idle" }>`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${({ $state, theme }) =>
    $state === "good"
      ? theme.color.good
      : $state === "bad"
      ? theme.color.bad
      : theme.color.muted};
  ${({ $state, theme }) =>
    $state === "good" && `box-shadow: 0 0 8px ${theme.color.good};`}
`;

export const Meter = styled.span<{ $state: "good" | "bad" | "idle" }>`
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 16px;
  flex-shrink: 0;

  i {
    display: block;
    width: 3px;
    border-radius: 1px;
    background: ${({ theme }) => theme.color.track};
    html[data-bars="square"] & {
      border-radius: 2px;
    }
  }

  i:nth-child(1) { height: 5px; }
  i:nth-child(2) { height: 8px; }
  i:nth-child(3) { height: 12px; }
  i:nth-child(4) { height: 16px; }

  ${({ $state, theme }) =>
    $state === "good" &&
    css`
      i {
        background: ${theme.color.good};
        box-shadow: 0 0 8px ${theme.color.good};
      }
    `}

  ${({ $state, theme }) =>
    $state === "idle" &&
    css`
      i:nth-child(-n + 2) {
        background: ${theme.color.muted};
        animation: pulse 2.4s ease-in-out infinite;
      }
    `}

  ${({ $state, theme }) =>
    $state === "bad" &&
    css`
      i:nth-child(1),
      i:nth-child(2),
      i:nth-child(3) {
        background: ${theme.color.warn};
        animation: meter-reconnect 1.15s ease-in-out infinite;
      }
      i:nth-child(2) {
        animation-delay: 0.18s;
      }
      i:nth-child(3) {
        animation-delay: 0.36s;
      }
    `}
`;

/* ---- Overview dashboard -------------------------------------------------- */
export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media ${mobile} {
    grid-template-columns: 1fr;
    gap: 12px;

    & > * {
      grid-column: span 1 !important;
    }
  }
`;

export const CardSplit = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;

  @media ${mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
`;

export const Kv = styled.div<{ $tight?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $tight }) => ($tight ? "1fr" : "repeat(2, 1fr)")};
  gap: ${({ $tight }) => ($tight ? "8px" : "10px 24px")};
  ${({ $tight }) => $tight && "flex: 1;"}

  @media ${mobile} {
    grid-template-columns: 1fr;
    gap: 10px;
  }
`;

export const Readouts = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Readout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const ReadoutValue = styled.span<{ $sm?: boolean }>`
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  font-size: ${({ $sm }) => ($sm ? "18px" : "28px")};
  ${({ $sm, theme }) => $sm && `color: ${theme.color.muted};`}
`;

export const ReadoutUnit = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.color.muted};
  margin-left: 6px;
`;

export const ReadoutLabel = styled.span`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.color.muted};
`;

export const Subhead = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.color.muted};
  margin: 6px 0 8px;
`;

export const Bars = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 14px 0;
`;

export const Cores = styled.div`
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 46px;
  margin-top: 16px;
`;

export const Core = styled.div`
  flex: 1;
  height: 100%;
  background: ${({ theme }) => theme.color.coreIdle};
  border-radius: 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
`;

export const CoreFill = styled.div`
  width: 100%;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, ${({ theme }) => theme.color.accent} 78%, #ffffff),
    ${({ theme }) => theme.color.accent}
  );
  transition: height 0.4s ease;
`;

export const Disks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const Disk = styled.div``;

export const DiskHead = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 14px;
`;

export const DiskMount = styled.span`
  font-weight: 500;
`;

export const DiskFoot = styled.div`
  margin-top: 6px;
  font-size: 12px;
`;

export const Gpus = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

export const Gpu = styled.div`
  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border};
    padding-top: 18px;
  }
`;

export const GpuName = styled.div`
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 10px;
`;

export const GpuMeta = styled(Kv)`
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px 24px;
`;
