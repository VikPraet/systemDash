import { promises as fsp } from "node:fs";
import path from "node:path";
import { THEMES_DIR, isPathInside } from "./paths.js";

export const BUILTIN_THEME_IDS = ["classic", "lime", "phosphor", "ember", "midnight"] as const;

export const BUILTIN_THEME_META = [
  { id: "classic", name: "Classic" },
  { id: "lime", name: "Lime" },
  { id: "phosphor", name: "Phosphor" },
  { id: "ember", name: "Ember" },
  { id: "midnight", name: "Midnight" },
] as const;

const THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TOKEN_KEYS = [
  "bg",
  "panel",
  "panel2",
  "sidebar",
  "border",
  "text",
  "muted",
  "accent",
  "track",
  "good",
  "warn",
  "bad",
  "hairline",
  "overlay",
  "shadow",
  "elev",
  "glow1",
  "glow2",
  "authDot",
  "authGlow",
  "authPanel",
  "onAccent",
  "knob",
  "radius",
  "radiusSm",
  "radiusIcon",
] as const;

export class ThemeError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface ThemeTokens {
  [key: string]: string | undefined;
}

export interface ThemeEffects {
  gauge: "circle" | "squircle" | "square";
  bars: "pill" | "square";
  atmosphere: "glow" | "scanline" | "none";
}

export interface ThemeMode {
  tokens: ThemeTokens;
  effects: ThemeEffects;
}

export interface DashTheme {
  id: string;
  name: string;
  modes: Partial<Record<"dark" | "light", ThemeMode>>;
}

function isSafeCssValue(value: string): boolean {
  if (value.length === 0 || value.length > 220) return false;
  if (/[;{}<>]/.test(value)) return false;
  if (/url\s*\(/i.test(value)) return false;
  if (/expression/i.test(value)) return false;
  if (/@import/i.test(value)) return false;
  return true;
}

function asTokens(input: unknown): ThemeTokens {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: ThemeTokens = {};
  for (const key of TOKEN_KEYS) {
    const v = src[key];
    if (typeof v === "string" && isSafeCssValue(v.trim())) out[key] = v.trim();
  }
  return out;
}

function asEffects(input: unknown): ThemeEffects {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    gauge:
      src.gauge === "squircle" || src.gauge === "square" || src.gauge === "circle"
        ? src.gauge
        : "circle",
    bars: src.bars === "square" ? "square" : "pill",
    atmosphere:
      src.atmosphere === "scanline" || src.atmosphere === "none" || src.atmosphere === "glow"
        ? src.atmosphere
        : "glow",
  };
}

export function sanitizeThemeId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  if (!THEME_ID_RE.test(id)) return null;
  return id;
}

export function sanitizeTheme(input: unknown): DashTheme {
  if (!input || typeof input !== "object") {
    throw new ThemeError(400, "Theme file must be a JSON object");
  }
  const src = input as Record<string, unknown>;
  const id = sanitizeThemeId(src.id);
  if (!id) {
    throw new ThemeError(
      400,
      "Theme id must be 1–48 characters: lowercase letters, numbers, dashes"
    );
  }
  if ((BUILTIN_THEME_IDS as readonly string[]).includes(id)) {
    throw new ThemeError(400, `Cannot overwrite the built-in "${id}" theme — pick another id`);
  }
  const name =
    typeof src.name === "string" && src.name.trim().length > 0
      ? src.name.trim().slice(0, 64)
      : id;
  const modesIn = src.modes && typeof src.modes === "object" ? (src.modes as Record<string, unknown>) : {};
  const modes: DashTheme["modes"] = {};
  for (const appearance of ["dark", "light"] as const) {
    const raw = modesIn[appearance];
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    modes[appearance] = {
      tokens: asTokens(rec.tokens),
      effects: asEffects(rec.effects),
    };
  }
  if (!modes.dark && !modes.light) {
    throw new ThemeError(400, "Theme needs a modes.dark and/or modes.light block");
  }
  return { id, name, modes };
}

function themePath(id: string): string {
  const file = path.join(THEMES_DIR, `${id}.json`);
  if (!isPathInside(THEMES_DIR, file)) {
    throw new ThemeError(400, "Invalid theme id");
  }
  return file;
}

async function ensureDir(): Promise<void> {
  await fsp.mkdir(THEMES_DIR, { recursive: true });
}

export async function listCustomThemes(): Promise<DashTheme[]> {
  await ensureDir();
  let names: string[];
  try {
    names = await fsp.readdir(THEMES_DIR);
  } catch {
    return [];
  }
  const out: DashTheme[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fsp.readFile(path.join(THEMES_DIR, name), "utf8");
      out.push(sanitizeTheme(JSON.parse(raw)));
    } catch {
      // Skip corrupt / invalid files rather than failing the catalog.
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function saveCustomTheme(input: unknown): Promise<DashTheme> {
  const theme = sanitizeTheme(input);
  await ensureDir();
  await fsp.writeFile(themePath(theme.id), JSON.stringify(theme, null, 2), "utf8");
  return theme;
}

export async function deleteCustomTheme(id: string): Promise<void> {
  const safe = sanitizeThemeId(id);
  if (!safe) throw new ThemeError(400, "Invalid theme id");
  if ((BUILTIN_THEME_IDS as readonly string[]).includes(safe)) {
    throw new ThemeError(400, "Built-in themes cannot be deleted");
  }
  try {
    await fsp.unlink(themePath(safe));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new ThemeError(404, "Theme not found");
    throw err;
  }
}

export function themePreview(theme: DashTheme): Partial<
  Record<"dark" | "light", { bg: string; accent: string }>
> {
  const preview: Partial<Record<"dark" | "light", { bg: string; accent: string }>> = {};
  for (const appearance of ["dark", "light"] as const) {
    const tokens = theme.modes[appearance]?.tokens ?? {};
    preview[appearance] = {
      bg: tokens.bg ?? "#111",
      accent: tokens.accent ?? "#888",
    };
  }
  return preview;
}
