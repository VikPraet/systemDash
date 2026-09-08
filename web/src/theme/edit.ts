import { CLASSIC_THEME } from "./builtins";
import {
  THEME_ID_RE,
  isBuiltinThemeId,
  resolveMode,
  sanitizeThemeId,
  type DashTheme,
} from "./schema";

export function slugifyThemeId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return THEME_ID_RE.test(slug) ? slug : "custom-theme";
}

export function uniqueThemeId(base: string, taken: Set<string>): string {
  const id = sanitizeThemeId(base, "custom-theme");
  if (!taken.has(id) && !isBuiltinThemeId(id)) return id;
  const stem = id.replace(/-\d+$/, "").slice(0, 44);
  for (let n = 2; n < 100; n++) {
    const next = `${stem}-${n}`;
    if (!taken.has(next) && !isBuiltinThemeId(next)) return next;
  }
  return `theme-${Date.now().toString(36)}`;
}

/** Fully resolved clone so the editor always has both modes and every token. */
export function resolvedClone(source: DashTheme, id: string, name: string): DashTheme {
  return {
    id,
    name,
    modes: {
      dark: structuredClone(resolveMode(source, "dark", CLASSIC_THEME)),
      light: structuredClone(resolveMode(source, "light", CLASSIC_THEME)),
    },
  };
}

export function parseHexColor(value: string): string | null {
  const raw = value.trim();
  const short = raw.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = raw.match(/^#([0-9a-f]{6})$/i);
  return full ? raw.toLowerCase() : null;
}
