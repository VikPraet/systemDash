import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchAuthStatus,
  login as loginApi,
  logout as logoutApi,
  setUnauthorizedHandler,
  setupAdmin as setupApi,
} from "../api";
import type { Role, User } from "../types";

interface AuthState {
  loading: boolean;
  error: string | null;
  needsSetup: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Role hierarchy used for client-side gating (the server enforces the real one).
const RANK: Record<Role, number> = { viewer: 0, user: 1, admin: 2 };
export function hasRole(user: User | null, min: Role): boolean {
  return !!user && RANK[user.role] >= RANK[min];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await fetchAuthStatus();
      setNeedsSetup(status.needsSetup);
      setUser(status.user);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // When a background request hits 401, the session is gone: drop to login.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await loginApi(username, password);
    setUser(u);
    setNeedsSetup(false);
  }, []);

  const setup = useCallback(async (username: string, password: string) => {
    const u = await setupApi(username, password);
    setUser(u);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, error, needsSetup, user, login, setup, logout, refresh }),
    [loading, error, needsSetup, user, login, setup, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
