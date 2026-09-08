export type Appearance = "dark" | "light";
export type Palette = "classic" | "lime";

export const APPEARANCE_STORAGE_KEY = "systemdash.appearance";
export const PALETTE_STORAGE_KEY = "systemdash.palette";

const THEME_COLOR: Record<Palette, Record<Appearance, string>> = {
  classic: { dark: "#060a12", light: "#e7eef7" },
  lime: { dark: "#000000", light: "#ececec" },
};

export function isAppearance(value: unknown): value is Appearance {
  return value === "dark" || value === "light";
}

function normalizePalette(value: unknown): Palette | null {
  if (value === "classic" || value === "original") return "classic";
  if (value === "lime") return "lime";
  return null;
}

export function isPalette(value: unknown): value is Palette {
  return normalizePalette(value) !== null;
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

export function readStoredPalette(): Palette {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    const palette = normalizePalette(stored);
    if (palette) return palette;
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

export function persistPalette(palette: Palette): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function applyAppearance(appearance: Appearance, palette: Palette = readStoredPalette()): void {
  const root = document.documentElement;
  root.dataset.theme = appearance;
  root.dataset.palette = palette;
  root.style.colorScheme = appearance;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", THEME_COLOR[palette][appearance]);
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
