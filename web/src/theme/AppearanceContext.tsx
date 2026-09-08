import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cache } from "../cache";
import { deleteThemeApi, fetchSettings, fetchThemes, importThemeApi, saveSettings } from "../api";
import { hasRole, useAuth } from "../auth/AuthContext";
import {
  applyTheme,
  persistAppearance,
  persistThemeId,
  readStoredAppearance,
  readStoredThemeId,
  resolveTheme,
  type Appearance,
} from "./appearance";
import { CLASSIC_THEME } from "./builtins";
import {
  BUILTIN_THEME_IDS,
  isBuiltinThemeId,
  resolveMode,
  themeHasAppearance,
  themeSummary,
  type DashTheme,
  type ThemeEffects,
  type ThemeSummary,
} from "./schema";

interface AppearanceContextValue {
  appearance: Appearance;
  themeId: string;
  theme: DashTheme;
  effects: ThemeEffects;
  catalog: ThemeSummary[];
  canEdit: boolean;
  setAppearance: (next: Appearance) => void;
  toggleAppearance: () => void;
  setThemeId: (id: string) => void;
  importTheme: (raw: unknown) => Promise<DashTheme>;
  deleteTheme: (id: string) => Promise<void>;
  exportTheme: () => DashTheme;
  setPreview: (theme: DashTheme | null, appearance?: Appearance) => void;
  hydrate: () => Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function summariesFrom(custom: DashTheme[]): ThemeSummary[] {
  const customIds = new Set(custom.map((t) => t.id));
  const builtins = BUILTIN_THEME_IDS
    .map((id) => resolveTheme(id, []))
    .filter((t) => !customIds.has(t.id))
    .map((t) => themeSummary(t, true));
  return [...builtins, ...custom.map((t) => themeSummary(t, false))];
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canEdit = hasRole(user, "admin");
  const [appearance, setAppearanceState] = useState<Appearance>(readStoredAppearance);
  const [themeId, setThemeIdState] = useState<string>(readStoredThemeId);
  const [custom, setCustom] = useState<DashTheme[]>([]);
  const [preview, setPreviewState] = useState<{
    theme: DashTheme;
    appearance: Appearance;
  } | null>(null);
  const theme = useMemo(() => resolveTheme(themeId, custom), [themeId, custom]);
  const effects: ThemeEffects = useMemo(
    () =>
      resolveMode(preview?.theme ?? theme, preview?.appearance ?? appearance, CLASSIC_THEME)
        .effects,
    [appearance, preview, theme]
  );

  useEffect(() => {
    applyTheme(preview?.theme ?? theme, preview?.appearance ?? appearance);
  }, [appearance, preview, theme]);

  useEffect(() => {
    persistAppearance(appearance);
    persistThemeId(themeId);
  }, [appearance, themeId]);

  const persistDashboard = useCallback(
    async (nextThemeId: string, nextAppearance: Appearance) => {
      if (!canEdit) return;
      try {
        const current = cache.settings.dashboard ?? {
          themeId: "classic",
          appearance: "dark" as Appearance,
          layouts: {},
        };
        const saved = await saveSettings({
          ...cache.settings,
          dashboard: { ...current, themeId: nextThemeId, appearance: nextAppearance },
        });
        cache.settings = saved;
      } catch {
        // Keep the live theme even if the save fails.
      }
    },
    [canEdit]
  );

  const setAppearance = useCallback(
    (next: Appearance) => {
      setAppearanceState(next);
      void persistDashboard(themeId, next);
    },
    [persistDashboard, themeId]
  );

  const toggleAppearance = useCallback(() => {
    setAppearanceState((current) => {
      const next = current === "dark" ? "light" : "dark";
      void persistDashboard(themeId, next);
      return next;
    });
  }, [persistDashboard, themeId]);

  const setThemeId = useCallback(
    (id: string) => {
      const resolved = resolveTheme(id, custom);
      setThemeIdState(resolved.id);
      if (!themeHasAppearance(resolved, appearance)) {
        const fallback = resolved.modes.dark ? "dark" : "light";
        setAppearanceState(fallback);
        void persistDashboard(resolved.id, fallback);
        return;
      }
      void persistDashboard(resolved.id, appearance);
    },
    [appearance, custom, persistDashboard]
  );

  const hydrate = useCallback(async () => {
    try {
      const [settings, catalog] = await Promise.all([fetchSettings(), fetchThemes()]);
      cache.settings = settings;
      window.dispatchEvent(new Event("systemdash-settings"));
      const nextCustom = catalog
        .filter((t) => !t.builtin && t.theme)
        .map((t) => t.theme!) as DashTheme[];
      setCustom(nextCustom);
      const dash = settings.dashboard;
      if (dash) {
        const id = dash.themeId || "classic";
        setThemeIdState(id);
        if (dash.appearance === "dark" || dash.appearance === "light") {
          setAppearanceState(dash.appearance);
        }
      }
    } catch {
      // Logged out / offline — keep the cached look.
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void hydrate();
  }, [hydrate, user?.id]);

  const importTheme = useCallback(
    async (raw: unknown) => {
      const saved = await importThemeApi(raw);
      setCustom((prev) => {
        const rest = prev.filter((t) => t.id !== saved.id);
        return [...rest, saved];
      });
      setThemeIdState(saved.id);
      if (!themeHasAppearance(saved, appearance) && saved.modes.light) {
        setAppearanceState("light");
        void persistDashboard(saved.id, "light");
      } else if (!themeHasAppearance(saved, appearance) && saved.modes.dark) {
        setAppearanceState("dark");
        void persistDashboard(saved.id, "dark");
      } else {
        void persistDashboard(saved.id, appearance);
      }
      return saved;
    },
    [appearance, persistDashboard]
  );

  const deleteTheme = useCallback(
    async (id: string) => {
      if (isBuiltinThemeId(id)) throw new Error("Built-in themes cannot be deleted");
      await deleteThemeApi(id);
      setCustom((prev) => prev.filter((t) => t.id !== id));
      if (themeId === id) {
        setThemeIdState("classic");
        void persistDashboard("classic", appearance);
      }
    },
    [appearance, persistDashboard, themeId]
  );

  const exportTheme = useCallback(() => theme, [theme]);

  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  const setPreview = useCallback((next: DashTheme | null, nextAppearance?: Appearance) => {
    if (!next) {
      setPreviewState(null);
      return;
    }
    setPreviewState({
      theme: next,
      appearance: nextAppearance ?? appearanceRef.current,
    });
  }, []);

  const catalog = useMemo(() => summariesFrom(custom), [custom]);

  const value = useMemo(
    () => ({
      appearance,
      themeId,
      theme,
      effects,
      catalog,
      canEdit,
      setAppearance,
      toggleAppearance,
      setThemeId,
      importTheme,
      deleteTheme,
      exportTheme,
      setPreview,
      hydrate,
    }),
    [
      appearance,
      themeId,
      theme,
      effects,
      catalog,
      canEdit,
      setAppearance,
      toggleAppearance,
      setThemeId,
      importTheme,
      deleteTheme,
      exportTheme,
      setPreview,
      hydrate,
    ]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return ctx;
}
