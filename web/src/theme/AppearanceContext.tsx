import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyAppearance,
  persistAppearance,
  persistPalette,
  readStoredAppearance,
  readStoredPalette,
  type Appearance,
  type Palette,
} from "./appearance";

interface AppearanceContextValue {
  appearance: Appearance;
  palette: Palette;
  setAppearance: (next: Appearance) => void;
  setPalette: (next: Palette) => void;
  toggleAppearance: () => void;
  togglePalette: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(readStoredAppearance);
  const [palette, setPaletteState] = useState<Palette>(readStoredPalette);

  useEffect(() => {
    applyAppearance(appearance, palette);
    persistAppearance(appearance);
    persistPalette(palette);
  }, [appearance, palette]);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
  }, []);

  const setPalette = useCallback((next: Palette) => {
    setPaletteState(next);
  }, []);

  const toggleAppearance = useCallback(() => {
    setAppearanceState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const togglePalette = useCallback(() => {
    setPaletteState((current) => (current === "classic" ? "lime" : "classic"));
  }, []);

  const value = useMemo(
    () => ({
      appearance,
      palette,
      setAppearance,
      setPalette,
      toggleAppearance,
      togglePalette,
    }),
    [appearance, palette, setAppearance, setPalette, toggleAppearance, togglePalette]
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return ctx;
}
