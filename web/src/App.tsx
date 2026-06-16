import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  Activity as ActivityIcon,
  FolderOpen,
  Gauge as GaugeIcon,
  LineChart,
  LogOut,
  ScrollText,
  TerminalSquare,
  Users as UsersIcon,
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
  formatBytes,
  formatClock,
  formatRelative,
  formatUptime,
} from "./api";
import type { Role, SystemSnapshot } from "./types";
import { Card, Gauge, Bar, LabeledBar, Stat } from "./components/widgets";
import { Processes } from "./components/Processes";
import { Files } from "./components/Files";
import { Terminal } from "./components/Terminal";
import { History } from "./components/History";
import { Users } from "./components/Users";
import { Activity } from "./components/Activity";
import { Login } from "./components/Login";
import { Setup } from "./components/Setup";
import { useAuth, hasRole } from "./auth/AuthContext";
import { BrandDot, Loading, RoleBadge } from "./components/ui/styles";
import { AuthScreen } from "./components/AuthLayout/styles";
import * as S from "./App.styles";

const POLL_MS = 1000;

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
  { path: "/files", label: "Files", icon: FolderOpen },
  { path: "/terminal", label: "Terminal", icon: TerminalSquare, minRole: "user" },
  { path: "/users", label: "Users", icon: UsersIcon, minRole: "admin" },
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
    return (
      <AuthScreen>
        <Loading>Loading…</Loading>
      </AuthScreen>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route path="/setup" element={<SetupRoute />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/processes" element={<Processes />} />
          <Route path="/files" element={<Files />} />
          <Route
            path="/terminal"
            element={
              <RequireRole min="user">
                <Terminal />
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
function PublicOnly({ children }: { children: ReactElement }) {
  const { user, needsSetup } = useAuth();
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to="/overview" replace />;
  return children;
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
  return <Overview snap={snap} error={error} />;
}

function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [snap, setSnap] = useState<SystemSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const visibleNav = NAV.filter((t) => !t.minRole || hasRole(user, t.minRole));

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const data = await fetchSnapshot(ctrl.signal);
        if (!cancelled) {
          setSnap(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
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
        <S.Brand>
          <BrandDot />
          <h1>SystemDash</h1>
        </S.Brand>
        <S.Tabs>
          {visibleNav.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Icon className="nav-icon" size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </S.Tabs>
        <S.SidebarFooter>
          <S.UserChip>
            <S.UserChipInfo>
              <S.UserChipName>{user?.username}</S.UserChipName>
              <RoleBadge $role={user?.role}>{user?.role}</RoleBadge>
            </S.UserChipInfo>
            <S.LogoutBtn onClick={onLogout} title="Sign out">
              <LogOut size={16} strokeWidth={1.8} />
            </S.LogoutBtn>
          </S.UserChip>
          <S.FooterMeta>
            <StatusIndicator snap={snap} error={error} now={now} />
            {snap && <S.Version>v{snap.app.version}</S.Version>}
          </S.FooterMeta>
        </S.SidebarFooter>
      </S.Sidebar>

      <S.Content>
        <Outlet context={{ snap, error, now } satisfies DashboardContext} />
      </S.Content>
    </S.AppShell>
  );
}

function StatusIndicator({
  snap,
  error,
  now,
}: {
  snap: SystemSnapshot | null;
  error: string | null;
  now: number;
}) {
  const state = error ? "bad" : snap ? "good" : "idle";
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
    <S.StatusWrap>
      <S.Status>
        <S.Dot $state={state} />
        {label}
      </S.Status>
      <S.StatusTooltip role="tooltip">
        <S.StatusTooltipTitle>{title}</S.StatusTooltipTitle>
        {detail && <S.StatusTooltipDetail>{detail}</S.StatusTooltipDetail>}
        <S.StatusTooltipArrow />
      </S.StatusTooltip>
    </S.StatusWrap>
  );
}

function Overview({
  snap,
  error,
}: {
  snap: SystemSnapshot | null;
  error: string | null;
}) {
  if (!snap) {
    return (
      <Loading>
        {error ? `Could not reach the backend: ${error}` : "Loading system stats…"}
      </Loading>
    );
  }

  const { host, cpu, memory, disks, gpus } = snap;

  return (
    <S.Grid>
      <Card title="System" span={2}>
        <S.Kv>
          <Stat label="Host" value={host.hostname} />
          <Stat label="OS" value={`${host.distro} ${host.release}`.trim()} />
          <Stat label="Kernel" value={host.kernel || "—"} />
          <Stat label="Architecture" value={host.arch} />
          <Stat label="Platform" value={host.platform} />
          <Stat
            label="Machine"
            value={
              [host.systemManufacturer, host.systemModel]
                .filter(Boolean)
                .join(" ") || "—"
            }
          />
          <Stat label="Uptime" value={formatUptime(host.uptimeSeconds)} />
        </S.Kv>
      </Card>

      <Card title="CPU">
        <S.CardSplit>
          <Gauge value={cpu.loadPercent} label="load" />
          <S.Readouts>
            <S.Readout>
              <S.ReadoutValue>
                {cpu.currentSpeedGHz.toFixed(2)}
                <S.ReadoutUnit>GHz</S.ReadoutUnit>
              </S.ReadoutValue>
              <S.ReadoutLabel>current clock</S.ReadoutLabel>
            </S.Readout>
            <S.Readout>
              <S.ReadoutValue $sm>
                {cpu.baseSpeedGHz.toFixed(2)}
                <S.ReadoutUnit>GHz</S.ReadoutUnit>
              </S.ReadoutValue>
              <S.ReadoutLabel>base clock</S.ReadoutLabel>
            </S.Readout>
          </S.Readouts>
        </S.CardSplit>
        <S.Kv $tight>
          <Stat label="Model" value={`${cpu.manufacturer} ${cpu.brand}`} />
          <Stat
            label="Cores"
            value={`${cpu.physicalCores} physical / ${cpu.cores} logical`}
          />
        </S.Kv>
        {cpu.temperatureC !== null && (
          <S.Bars>
            <LabeledBar
              label="Temperature"
              value={cpu.temperatureC}
              max={cpu.temperatureMaxC}
              valueText={`${cpu.temperatureC} / ${cpu.temperatureMaxC} °C`}
            />
          </S.Bars>
        )}
        {cpu.perCoreLoad.length > 0 && (
          <>
            <S.Subhead>Per-core load</S.Subhead>
            <S.Cores>
              {cpu.perCoreLoad.map((load, i) => (
                <S.Core
                  key={i}
                  title={`Core ${i}: ${load}%${
                    cpu.perCoreSpeed[i]
                      ? ` · ${cpu.perCoreSpeed[i].toFixed(2)} GHz`
                      : ""
                  }`}
                >
                  <S.CoreFill style={{ height: `${load}%` }} />
                </S.Core>
              ))}
            </S.Cores>
          </>
        )}
      </Card>

      <Card title="Memory">
        <S.CardSplit>
          <Gauge value={memory.usedPercent} label="used" />
          <S.Readouts>
            <S.Readout>
              <S.ReadoutValue>{formatBytes(memory.usedBytes)}</S.ReadoutValue>
              <S.ReadoutLabel>of {formatBytes(memory.totalBytes)}</S.ReadoutLabel>
            </S.Readout>
          </S.Readouts>
        </S.CardSplit>
        <S.Bars>
          <LabeledBar
            label="RAM usage"
            value={memory.usedBytes}
            max={memory.totalBytes}
            valueText={`${formatBytes(memory.usedBytes)} / ${formatBytes(
              memory.totalBytes
            )}`}
          />
          {memory.swapTotalBytes > 0 && (
            <LabeledBar
              label="Swap usage"
              value={memory.swapUsedBytes}
              max={memory.swapTotalBytes}
              valueText={`${formatBytes(memory.swapUsedBytes)} / ${formatBytes(
                memory.swapTotalBytes
              )}`}
            />
          )}
        </S.Bars>
        <S.Kv $tight>
          <Stat label="Available" value={formatBytes(memory.availableBytes)} />
        </S.Kv>
      </Card>

      <Card title="Storage" span={2}>
        <S.Disks>
          {disks.length === 0 && <div className="muted">No volumes reported.</div>}
          {disks.map((d) => (
            <S.Disk key={`${d.fs}-${d.mount}`}>
              <S.DiskHead>
                <S.DiskMount>{d.mount || d.fs}</S.DiskMount>
                <span className="muted">{d.type}</span>
              </S.DiskHead>
              <Bar value={d.usedPercent} />
              <S.DiskFoot className="muted">
                {formatBytes(d.usedBytes)} used · {formatBytes(d.availableBytes)} free
                · {formatBytes(d.sizeBytes)} total
              </S.DiskFoot>
            </S.Disk>
          ))}
        </S.Disks>
      </Card>

      <Card title="GPU" span={2}>
        <S.Gpus>
          {gpus.length === 0 && <div className="muted">No GPU reported.</div>}
          {gpus.map((g, i) => {
            const hasBars =
              g.utilizationPercent !== null ||
              g.memoryTotalMb !== null ||
              g.temperatureC !== null;
            return (
              <S.Gpu key={i}>
                <S.GpuName>
                  {g.vendor} {g.model}
                </S.GpuName>
                {hasBars && (
                  <S.Bars>
                    {g.utilizationPercent !== null && (
                      <LabeledBar
                        label="Utilization"
                        value={g.utilizationPercent}
                        max={100}
                        valueText={`${g.utilizationPercent}%`}
                      />
                    )}
                    {g.memoryTotalMb !== null && (
                      <LabeledBar
                        label="Memory"
                        value={g.memoryUsedMb ?? 0}
                        max={g.memoryTotalMb}
                        valueText={`${g.memoryUsedMb ?? 0} / ${g.memoryTotalMb} MB`}
                      />
                    )}
                    {g.temperatureC !== null && (
                      <LabeledBar
                        label="Temperature"
                        value={g.temperatureC}
                        max={g.temperatureMaxC}
                        valueText={`${g.temperatureC} / ${g.temperatureMaxC} °C`}
                      />
                    )}
                  </S.Bars>
                )}
                <S.GpuMeta $tight>
                  {g.vramMb ? <Stat label="VRAM" value={`${g.vramMb} MB`} /> : null}
                  {g.clockCoreMhz !== null && (
                    <Stat label="Core clock" value={`${g.clockCoreMhz} MHz`} />
                  )}
                  {g.clockMemoryMhz !== null && (
                    <Stat label="Memory clock" value={`${g.clockMemoryMhz} MHz`} />
                  )}
                  {g.powerDrawW !== null && (
                    <Stat
                      label="Power"
                      value={
                        g.powerLimitW !== null
                          ? `${g.powerDrawW} / ${g.powerLimitW} W`
                          : `${g.powerDrawW} W`
                      }
                    />
                  )}
                  {g.fanPercent !== null && (
                    <Stat label="Fan" value={`${g.fanPercent}%`} />
                  )}
                </S.GpuMeta>
              </S.Gpu>
            );
          })}
        </S.Gpus>
      </Card>
    </S.Grid>
  );
}
