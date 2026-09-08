import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  Activity as ActivityIcon,
  Box,
  FolderGit2,
  FolderOpen,
  Gauge as GaugeIcon,
  LineChart,
  LogOut,
  Menu,
  Package,
  ScrollText,
  TerminalSquare,
  Users as UsersIcon,
  KeyRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import {
  fetchSnapshot,
  formatClock,
  formatRelative,
} from "./api";
import type { Role, SystemSnapshot } from "./types";
import { Overview } from "./components/Overview";
import { Processes } from "./components/Processes";
import { Files } from "./components/Files";
import { Terminal } from "./components/Terminal";
import { History } from "./components/History";
import { Users } from "./components/Users";
import { Activity } from "./components/Activity";
import { Containers } from "./components/Containers";
import { Projects } from "./components/Projects";
import { SystemUpdates } from "./components/SystemUpdates";
import { AppVersionLink } from "./components/SystemUpdates/AppVersionLink";
import { Login } from "./components/Login";
import { Recover } from "./components/Recover";
import { RecoveryModal } from "./components/RecoveryModal";
import { Setup } from "./components/Setup";
import { useAuth, hasRole } from "./auth/AuthContext";
import { cache } from "./cache";
import { APP_NAME } from "./brand";
import { applyConnectionFavicon } from "./connectionFavicon";
import {
  AuthSubmit,
  GhostBtn,
  Loading,
  ModalActions,
  ModalCard,
  ModalClose,
  ModalHead,
  ModalOverlay,
  ModalSub,
  RoleBadge,
} from "./components/ui/styles";
import { ReconnectOverlay, useReconnectGate } from "./components/ui/ReconnectOverlay";
import { Tooltip } from "./components/ui/Tooltip";
import { ThemeToggle } from "./components/ui/ThemeToggle";
import { ThemePicker } from "./components/ui/ThemePicker";
import { LayoutEditBar, LayoutToggle } from "./components/ui/LayoutToggle";
import { AuthLayout } from "./components/AuthLayout";
import { AuthScreen } from "./components/AuthLayout/styles";
import * as S from "./App.styles";

const POLL_MS = 1000;
const SNAPSHOT_TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECOVERY_NUDGE_SNOOZE: { label: string; ms: number; primary?: boolean }[] = [
  { label: "1 day", ms: DAY_MS },
  { label: "1 week", ms: 7 * DAY_MS, primary: true },
  { label: "1 month", ms: 30 * DAY_MS },
];

function recoveryNudgeSnoozeKey(userId: number) {
  return `recoveryNudgeSnooze:${userId}`;
}

function readRecoveryNudgeSnooze(userId: number): number {
  try {
    const raw = localStorage.getItem(recoveryNudgeSnoozeKey(userId));
    const until = raw ? Number(raw) : 0;
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

function writeRecoveryNudgeSnooze(userId: number, until: number) {
  try {
    localStorage.setItem(recoveryNudgeSnoozeKey(userId), String(until));
  } catch {
    // Private mode / quota — the banner just stays visible this session.
  }
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  minRole?: Role;
}

// `minRole` gates a route/link to a role rank; omitted means any logged-in user.
const NAV: NavItem[] = [
  { path: "/overview", label: "Overview", icon: GaugeIcon },
  { path: "/history", label: "History", icon: LineChart },
  { path: "/processes", label: "Processes", icon: ActivityIcon },
  { path: "/containers", label: "Containers", icon: Box },
  { path: "/projects", label: "Projects", icon: FolderGit2, minRole: "user" },
  { path: "/files", label: "Files", icon: FolderOpen },
  { path: "/terminal", label: "Terminal", icon: TerminalSquare, minRole: "user" },
  { path: "/users", label: "Users", icon: UsersIcon, minRole: "admin" },
  { path: "/updates", label: "Updates", icon: Package, minRole: "admin" },
  { path: "/activity", label: "Activity", icon: ScrollText, minRole: "admin" },
];

// Snapshot data (used by the Overview page and the sidebar status indicator) is
// polled once in the layout and shared with child routes via the Outlet context.
interface DashboardContext {
  snap: SystemSnapshot | null;
  error: string | null;
  now: number;
}
function useDashboard(): DashboardContext {
  return useOutletContext<DashboardContext>();
}

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return <AuthLoading />;
  }

  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/recover" element={<Recover />} />
        </Route>
      </Route>
      <Route path="/setup" element={<SetupRoute />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/processes" element={<Processes />} />
          <Route path="/containers" element={<Containers />} />
          <Route
            path="/projects"
            element={
              <RequireRole min="user">
                <Projects />
              </RequireRole>
            }
          />
          <Route path="/files" element={<Files />} />
          <Route
            path="/terminal"
            element={
              <RequireRole min="user">
                <></>
              </RequireRole>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole min="admin">
                <Users />
              </RequireRole>
            }
          />
          <Route
            path="/updates"
            element={
              <RequireRole min="admin">
                <SystemUpdates />
              </RequireRole>
            }
          />
          <Route
            path="/activity"
            element={
              <RequireRole min="admin">
                <Activity />
              </RequireRole>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

// Renders children only when logged out; otherwise sends the user into the app
// (or to setup when no users exist yet).
function PublicOnly() {
  const { user, needsSetup } = useAuth();
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to="/overview" replace />;
  return <Outlet />;
}

function SetupRoute() {
  const { needsSetup, user } = useAuth();
  if (!needsSetup) return <Navigate to={user ? "/overview" : "/login"} replace />;
  return <Setup />;
}

// Gate for every dashboard route: bounce to setup/login as appropriate, keeping
// the attempted location so login can return the user to it.
function RequireAuth() {
  const { user, needsSetup } = useAuth();
  const location = useLocation();
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function RequireRole({ min, children }: { min: Role; children: ReactElement }) {
  const { user } = useAuth();
  if (!hasRole(user, min)) return <Navigate to="/overview" replace />;
  return children;
}

function OverviewPage() {
  const { snap, error } = useDashboard();
  const { user } = useAuth();
  const isAdmin = hasRole(user, "admin");
  return <Overview snap={snap} error={error} showUpdates={isAdmin} />;
}

function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [snap, setSnap] = useState<SystemSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const visibleNav = NAV.filter((t) => !t.minRole || hasRole(user, t.minRole));
  const canUseTerminal = hasRole(user, "user");
  const isAdmin = hasRole(user, "admin");
  const onTerminalRoute = location.pathname === "/terminal";
  const [terminalMounted, setTerminalMounted] = useState(
    () => canUseTerminal && cache.terminal.tabs.length > 0
  );
  const [navOpen, setNavOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [hideRecoveryPromptOpen, setHideRecoveryPromptOpen] = useState(false);
  const [recoveryNudgeSnoozeUntil, setRecoveryNudgeSnoozeUntil] = useState(() =>
    user ? readRecoveryNudgeSnooze(user.id) : 0
  );
  const canSetRecovery = typeof user?.hasRecovery === "boolean";
  const showRecoveryNudge =
    !onTerminalRoute &&
    canSetRecovery &&
    !!user &&
    !user.hasRecovery &&
    now >= recoveryNudgeSnoozeUntil;

  useEffect(() => {
    setRecoveryNudgeSnoozeUntil(user ? readRecoveryNudgeSnooze(user.id) : 0);
  }, [user]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  useEffect(() => {
    if (onTerminalRoute && canUseTerminal) setTerminalMounted(true);
  }, [onTerminalRoute, canUseTerminal]);

  const reconnect = useReconnectGate(!!error);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      const tickCtrl = new AbortController();
      const timer = window.setTimeout(() => tickCtrl.abort(), SNAPSHOT_TIMEOUT_MS);
      const onUnmount = () => tickCtrl.abort();
      ctrl.signal.addEventListener("abort", onUnmount);
      try {
        const data = await fetchSnapshot(tickCtrl.signal);
        if (!cancelled) {
          setSnap(data);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        if ((e as Error).name === "AbortError" && ctrl.signal.aborted) return;
        setError(
          (e as Error).name === "AbortError"
            ? "Timed out waiting for the host"
            : (e as Error).message
        );
      } finally {
        window.clearTimeout(timer);
        ctrl.signal.removeEventListener("abort", onUnmount);
        inFlight.current = false;
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    applyConnectionFavicon(connectionState(snap, error));
  }, [snap, error]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <S.AppShell>
      <S.Sidebar>
        <S.SidebarHeader>
          <S.MenuBtn
            type="button"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </S.MenuBtn>
          <S.Brand
            to="/overview"
            aria-label={`${APP_NAME} — Overview`}
            onClick={() => setNavOpen(false)}
          >
            <ConnectionMeter snap={snap} error={error} now={now} />
            <h1>{APP_NAME}</h1>
          </S.Brand>
          <S.MobileTopActions>
            {isAdmin && (
              <>
                <ThemeToggle />
                <ThemePicker />
                <LayoutToggle />
              </>
            )}
            {canSetRecovery && (
              <Tooltip label="Recovery question">
                <S.LogoutBtn type="button" onClick={() => setRecoveryOpen(true)}>
                  <KeyRound size={16} strokeWidth={1.8} />
                </S.LogoutBtn>
              </Tooltip>
            )}
            <Tooltip label="Sign out">
              <S.LogoutBtn onClick={onLogout}>
                <LogOut size={16} strokeWidth={1.8} />
              </S.LogoutBtn>
            </Tooltip>
          </S.MobileTopActions>
        </S.SidebarHeader>

        <S.NavPanel $open={navOpen}>
          <S.Tabs>
            {visibleNav.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) => (isActive ? "active" : "")}
                onClick={() => setNavOpen(false)}
              >
                <Icon className="nav-icon" size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </NavLink>
            ))}
          </S.Tabs>
          <S.SidebarFooter>
            {isAdmin && <LayoutEditBar />}
            <S.UserChip>
              <S.UserChipName>{user?.username}</S.UserChipName>
              <S.UserChipRow>
                <RoleBadge $role={user?.role}>{user?.role}</RoleBadge>
                <S.SidebarFooterDesktop>
                  <S.UserChipActions>
                    {isAdmin && (
                      <>
                        <ThemeToggle />
                        <ThemePicker />
                        <LayoutToggle />
                      </>
                    )}
                    {canSetRecovery && (
                      <Tooltip label="Recovery question">
                        <S.LogoutBtn type="button" onClick={() => setRecoveryOpen(true)}>
                          <KeyRound size={16} strokeWidth={1.8} />
                        </S.LogoutBtn>
                      </Tooltip>
                    )}
                    <Tooltip label="Sign out">
                      <S.LogoutBtn onClick={onLogout}>
                        <LogOut size={16} strokeWidth={1.8} />
                      </S.LogoutBtn>
                    </Tooltip>
                  </S.UserChipActions>
                </S.SidebarFooterDesktop>
              </S.UserChipRow>
            </S.UserChip>
            <S.FooterMeta>
              <S.SidebarFooterDesktop>
                <StatusIndicator snap={snap} error={error} now={now} />
              </S.SidebarFooterDesktop>
              {snap && isAdmin ? (
                <AppVersionLink version={snap.app.version} />
              ) : (
                snap && <S.Version>v{snap.app.version}</S.Version>
              )}
            </S.FooterMeta>
          </S.SidebarFooter>
        </S.NavPanel>
      </S.Sidebar>

      <S.Content>
        {navOpen && (
          <S.NavBackdrop
            type="button"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        )}
        <S.ContentPad>
          {showRecoveryNudge && (
            <S.RecoveryNudge>
              <span>
                Set a recovery question so you can get back in if you forget your
                username or password.
              </span>
              <S.RecoveryNudgeActions>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setHideRecoveryPromptOpen(true)}
                >
                  Hide
                </button>
                <button type="button" onClick={() => setRecoveryOpen(true)}>
                  Set up
                </button>
              </S.RecoveryNudgeActions>
            </S.RecoveryNudge>
          )}
          <S.ContentLayer $active={!onTerminalRoute}>
            <Outlet context={{ snap, error, now } satisfies DashboardContext} />
          </S.ContentLayer>
          {canUseTerminal && terminalMounted && (
            <S.ContentLayer $active={onTerminalRoute}>
              <Terminal active={onTerminalRoute} />
            </S.ContentLayer>
          )}
        </S.ContentPad>
      </S.Content>
      {recoveryOpen && <RecoveryModal onClose={() => setRecoveryOpen(false)} />}
      {hideRecoveryPromptOpen && user && (
        <RecoveryHidePrompt
          onClose={() => setHideRecoveryPromptOpen(false)}
          onSnooze={(ms) => {
            const until = Date.now() + ms;
            writeRecoveryNudgeSnooze(user.id, until);
            setRecoveryNudgeSnoozeUntil(until);
            setHideRecoveryPromptOpen(false);
          }}
        />
      )}
      {reconnect.visible && reconnect.since != null && (
        <ReconnectOverlay since={reconnect.since} lastSeen={snap?.timestamp ?? null} />
      )}
    </S.AppShell>
  );
}

function RecoveryHidePrompt({
  onClose,
  onSnooze,
}: {
  onClose: () => void;
  onSnooze: (ms: number) => void;
}) {
  return (
    <ModalOverlay onClick={onClose} role="presentation">
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>Hide reminder</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.8} />
          </ModalClose>
        </ModalHead>
        <ModalSub>
          We'll remind you again later. You can still set a recovery question
          anytime from the key icon.
        </ModalSub>
        <S.RecoverySnoozeChoices>
          {RECOVERY_NUDGE_SNOOZE.map(({ label, ms, primary }) =>
            primary ? (
              <AuthSubmit
                key={label}
                type="button"
                $compact
                onClick={() => onSnooze(ms)}
              >
                {label}
              </AuthSubmit>
            ) : (
              <GhostBtn key={label} type="button" onClick={() => onSnooze(ms)}>
                {label}
              </GhostBtn>
            )
          )}
        </S.RecoverySnoozeChoices>
        <ModalActions>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}

function AuthLoading() {
  useEffect(() => {
    applyConnectionFavicon("idle");
  }, []);

  return (
    <AuthScreen>
      <Loading>Loading…</Loading>
    </AuthScreen>
  );
}

function connectionState(snap: SystemSnapshot | null, error: string | null): "good" | "bad" | "idle" {
  return error ? "bad" : snap ? "good" : "idle";
}

function ConnectionMeter({
  snap,
  error,
  now,
}: {
  snap: SystemSnapshot | null;
  error: string | null;
  now: number;
}) {
  const state = connectionState(snap, error);
  const label = error ? "disconnected" : snap ? "live" : "connecting…";
  let title: string;
  let detail: string | null = null;
  if (snap) {
    title = `Updated ${formatRelative(snap.timestamp, now)}`;
    detail = `at ${formatClock(snap.timestamp)}`;
    if (error) detail += " · reconnecting…";
  } else if (error) {
    title = "No data received yet";
    detail = "reconnecting…";
  } else {
    title = "Waiting for first update…";
  }

  return (
    <Tooltip label={`${label} — ${title}`} detail={detail ?? undefined}>
      <S.Meter $state={state} aria-label={label}>
        <i />
        <i />
        <i />
        <i />
      </S.Meter>
    </Tooltip>
  );
}

function StatusIndicator({
  snap,
  error,
  now,
  compact,
}: {
  snap: SystemSnapshot | null;
  error: string | null;
  now: number;
  compact?: boolean;
}) {
  const state = connectionState(snap, error);
  const label = error ? "disconnected" : snap ? "live" : "connecting…";

  let title: string;
  let detail: string | null = null;
  if (snap) {
    title = `Updated ${formatRelative(snap.timestamp, now)}`;
    detail = `at ${formatClock(snap.timestamp)}`;
    if (error) detail += " · reconnecting…";
  } else if (error) {
    title = "No data received yet";
    detail = "reconnecting…";
  } else {
    title = "Waiting for first update…";
  }

  return (
    <Tooltip label={title} detail={detail ?? undefined}>
      <S.Status $compact={compact}>
        <S.Dot $state={state} />
        {label}
      </S.Status>
    </Tooltip>
  );
}

