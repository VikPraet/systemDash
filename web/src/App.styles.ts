import styled from "styled-components";

/* ---- App shell ----------------------------------------------------------- */
export const AppShell = styled.div`
  --sidebar-width: 220px;
  height: 100vh;
  display: flex;

  @media (max-width: 720px) {
    flex-direction: column;
    height: auto;
  }
`;

export const Sidebar = styled.aside`
  flex-shrink: 0;
  width: var(--sidebar-width);
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 22px 14px 16px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.color.panel2},
    ${({ theme }) => theme.color.panel} 220px
  );
  border-right: 1px solid ${({ theme }) => theme.color.border};

  @media (max-width: 720px) {
    width: 100%;
    height: auto;
    position: sticky;
    top: 0;
    z-index: 10;
    flex-direction: row;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    border-right: none;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
  }
`;

export const Content = styled.main`
  flex: 1;
  min-width: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 20px;

  @media (max-width: 720px) {
    height: auto;
    overflow-y: visible;
  }
`;

export const ContentLayer = styled.div<{ $active?: boolean }>`
  display: ${({ $active }) => ($active ? "block" : "none")};
  max-width: 1200px;
  margin: 0 auto;
  min-height: 0;
`;

export const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 8px 0;

  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
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

  &[type="button"] {
    cursor: pointer;
    font: inherit;

    &:hover {
      color: ${({ theme }) => theme.color.text};
    }
  }
`;

/* ---- Sidebar navigation -------------------------------------------------- */
export const Tabs = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;

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

  @media (max-width: 720px) {
    flex-direction: row;

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

  @media (max-width: 720px) {
    margin-top: 0;
    margin-left: auto;
    padding: 0;
    border-top: none;
    flex-direction: row;
    align-items: center;
    gap: 12px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const UserChipInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
`;

export const UserChipName = styled.span`
  font-size: 13px;
  font-weight: 600;
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
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.muted};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    border-color: ${({ theme }) => theme.color.accent};
  }
`;

/* ---- Connection status indicator ---------------------------------------- */
export const Status = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
  cursor: default;
`;

export const Dot = styled.span<{ $state: "good" | "bad" | "idle" }>`
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${({ $state, theme }) =>
    $state === "good"
      ? theme.color.good
      : $state === "bad"
      ? theme.color.bad
      : theme.color.muted};
  ${({ $state, theme }) =>
    $state === "good" && `box-shadow: 0 0 8px ${theme.color.good};`}
`;

/* ---- Overview dashboard -------------------------------------------------- */
export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;

    & > * {
      grid-column: span 1 !important;
    }
  }
`;

export const CardSplit = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

export const Kv = styled.div<{ $tight?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $tight }) => ($tight ? "1fr" : "repeat(2, 1fr)")};
  gap: ${({ $tight }) => ($tight ? "8px" : "10px 24px")};
  ${({ $tight }) => $tight && "flex: 1;"}
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
  background: rgba(255, 255, 255, 0.04);
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
