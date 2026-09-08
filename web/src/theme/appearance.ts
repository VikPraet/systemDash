export type Appearance = "dark" | "light";

export const APPEARANCE_STORAGE_KEY = "systemdash.appearance";

export function isAppearance(value: unknown): value is Appearance {
  return value === "dark" || value === "light";
}

export function readStoredAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (isAppearance(stored)) return stored;
  } catch {
    // Private mode / blocked storage.
  }
  return "dark";
}

export function persistAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  root.dataset.theme = appearance;
  root.style.colorScheme = appearance;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", appearance === "light" ? "#e7eef7" : "#060a12");
  }
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("systemdash-appearance"));
  });
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
