import { BUILTIN_THEMES, CLASSIC_THEME, builtinById } from "./builtins";
import {
  TOKEN_TO_CSS,
  isAppearance,
  resolveMode,
  sanitizeThemeId,
  type Appearance,
  type DashTheme,
  type ThemeEffects,
  type ThemeMode,
} from "./schema";

export type { Appearance, DashTheme, ThemeEffects, ThemeMode };
export { isAppearance };

export const APPEARANCE_STORAGE_KEY = "systemdash.appearance";
export const THEME_ID_STORAGE_KEY = "systemdash.themeId";
/** @deprecated kept so we can migrate the old palette toggle. */
export const PALETTE_STORAGE_KEY = "systemdash.palette";

export function readStoredAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (isAppearance(stored)) return stored;
  } catch {
    // Private mode / blocked storage.
  }
  return "dark";
}

export function readStoredThemeId(): string {
  try {
    const stored = localStorage.getItem(THEME_ID_STORAGE_KEY);
    const id = sanitizeThemeId(stored, "");
    if (id) return id;
    const legacy = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (legacy === "lime") return "lime";
    if (legacy === "classic" || legacy === "original") return "classic";
  } catch {
    // Private mode / blocked storage.
  }
  return "classic";
}

export function persistAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function persistThemeId(themeId: string): void {
  try {
    localStorage.setItem(THEME_ID_STORAGE_KEY, themeId);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function applyTheme(theme: DashTheme, appearance: Appearance): ThemeMode {
  const mode = resolveMode(theme, appearance, CLASSIC_THEME);
  const root = document.documentElement;
  root.dataset.theme = appearance;
  root.dataset.themeId = theme.id;
  root.dataset.gauge = mode.effects.gauge;
  root.dataset.bars = mode.effects.bars;
  root.dataset.atmosphere = mode.effects.atmosphere;
  root.style.colorScheme = appearance;
  for (const [key, css] of Object.entries(TOKEN_TO_CSS)) {
    const value = mode.tokens[key as keyof typeof mode.tokens];
    if (value) root.style.setProperty(css, value);
    else root.style.removeProperty(css);
  }
  root.style.setProperty("--bar-radius", mode.effects.bars === "square" ? "var(--radius-sm)" : "999px");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", mode.tokens.bg ?? "#060a12");
  }
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("systemdash-appearance"));
  });
  return mode;
}

export function resolveTheme(themeId: string, custom: DashTheme[] = []): DashTheme {
  return custom.find((t) => t.id === themeId) ?? builtinById(themeId) ?? CLASSIC_THEME;
}

export function catalogThemes(custom: DashTheme[]): DashTheme[] {
  const customIds = new Set(custom.map((t) => t.id));
  return [...BUILTIN_THEMES.filter((t) => !customIds.has(t.id)), ...custom];
}

export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function xtermThemeFromCss(): {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
} {
  return {
    background: cssVar("--panel-2", "#141d2c"),
    foreground: cssVar("--text", "#e6edf6"),
    cursor: cssVar("--accent", "#4f8cff"),
    selectionBackground: cssVar("--selection", "rgba(79, 140, 255, 0.28)"),
  };
}
