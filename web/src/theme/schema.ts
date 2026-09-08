export type Appearance = "dark" | "light";
export type GaugeStyle = "circle" | "squircle" | "square";
export type BarStyle = "pill" | "square";
export type Atmosphere = "glow" | "scanline" | "none";

export const TOKEN_KEYS = [
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

export type TokenKey = (typeof TOKEN_KEYS)[number];
export type ThemeTokens = Partial<Record<TokenKey, string>>;

export const TOKEN_TO_CSS: Record<TokenKey, string> = {
  bg: "--bg",
  panel: "--panel",
  panel2: "--panel-2",
  sidebar: "--sidebar",
  border: "--border",
  text: "--text",
  muted: "--muted",
  accent: "--accent",
  track: "--track",
  good: "--good",
  warn: "--warn",
  bad: "--bad",
  hairline: "--hairline",
  overlay: "--overlay",
  shadow: "--shadow",
  elev: "--elev",
  glow1: "--glow-1",
  glow2: "--glow-2",
  authDot: "--auth-dot",
  authGlow: "--auth-glow",
  authPanel: "--auth-panel",
  onAccent: "--on-accent",
  knob: "--knob",
  radius: "--radius",
  radiusSm: "--radius-sm",
  radiusIcon: "--radius-icon",
};

export interface ThemeEffects {
  gauge: GaugeStyle;
  bars: BarStyle;
  atmosphere: Atmosphere;
}

export interface ThemeMode {
  tokens: ThemeTokens;
  effects: ThemeEffects;
}

export interface DashTheme {
  id: string;
  name: string;
  modes: Partial<Record<Appearance, ThemeMode>>;
}

export interface ThemeSummary {
  id: string;
  name: string;
  builtin: boolean;
  modes: Appearance[];
  preview: Partial<Record<Appearance, { bg: string; accent: string }>>;
  theme?: DashTheme;
}

export const THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const BUILTIN_THEME_IDS = ["classic", "lime", "phosphor", "ember", "midnight"] as const;
export type BuiltinThemeId = (typeof BUILTIN_THEME_IDS)[number];

export function isAppearance(value: unknown): value is Appearance {
  return value === "dark" || value === "light";
}

export function isBuiltinThemeId(value: unknown): value is BuiltinThemeId {
  return typeof value === "string" && (BUILTIN_THEME_IDS as readonly string[]).includes(value);
}

export function sanitizeThemeId(raw: unknown, fallback = "classic"): string {
  if (typeof raw !== "string") return fallback;
  const id = raw.trim().toLowerCase();
  if (id === "original") return "classic";
  if (!THEME_ID_RE.test(id)) return fallback;
  return id;
}

function isSafeCssValue(value: string): boolean {
  if (value.length === 0 || value.length > 220) return false;
  if (/[;{}<>]/.test(value)) return false;
  if (/url\s*\(/i.test(value)) return false;
  if (/expression/i.test(value)) return false;
  if (/@import/i.test(value)) return false;
  return true;
}

function asTokenMap(input: unknown): ThemeTokens {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: ThemeTokens = {};
  for (const key of TOKEN_KEYS) {
    const v = src[key];
    if (typeof v === "string" && isSafeCssValue(v.trim())) out[key] = v.trim();
  }
  return out;
}

function asEffects(input: unknown, fallback: ThemeEffects): ThemeEffects {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    gauge:
      src.gauge === "squircle" || src.gauge === "square" || src.gauge === "circle"
        ? src.gauge
        : fallback.gauge,
    bars: src.bars === "square" ? "square" : src.bars === "pill" ? "pill" : fallback.bars,
    atmosphere:
      src.atmosphere === "scanline" || src.atmosphere === "none" || src.atmosphere === "glow"
        ? src.atmosphere
        : fallback.atmosphere,
  };
}

export function emptyEffects(): ThemeEffects {
  return { gauge: "circle", bars: "pill", atmosphere: "glow" };
}

export function mergeMode(base: ThemeMode, overlay: Partial<ThemeMode> | undefined): ThemeMode {
  return {
    tokens: { ...base.tokens, ...(overlay?.tokens ?? {}) },
    effects: { ...base.effects, ...(overlay?.effects ?? {}) },
  };
}

export function sanitizeTheme(input: unknown, fallback: DashTheme): DashTheme | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const id = sanitizeThemeId(src.id, "");
  if (!id) return null;
  const name =
    typeof src.name === "string" && src.name.trim().length > 0
      ? src.name.trim().slice(0, 64)
      : id;
  const modesIn = src.modes && typeof src.modes === "object" ? (src.modes as Record<string, unknown>) : {};
  const modes: Partial<Record<Appearance, ThemeMode>> = {};
  for (const appearance of ["dark", "light"] as const) {
    const raw = modesIn[appearance];
    const fb = fallback.modes[appearance] ?? fallback.modes.dark ?? fallback.modes.light;
    if (!fb) continue;
    if (!raw || typeof raw !== "object") {
      if (fallback.modes[appearance]) modes[appearance] = fb;
      continue;
    }
    const rec = raw as Record<string, unknown>;
    modes[appearance] = {
      tokens: { ...fb.tokens, ...asTokenMap(rec.tokens) },
      effects: asEffects(rec.effects, fb.effects),
    };
  }
  if (!modes.dark && !modes.light) return null;
  return { id, name, modes };
}

export function resolveMode(theme: DashTheme, appearance: Appearance, fallback: DashTheme): ThemeMode {
  const fb =
    fallback.modes[appearance] ??
    fallback.modes.dark ??
    fallback.modes.light ?? {
      tokens: {},
      effects: emptyEffects(),
    };
  const mode = theme.modes[appearance] ?? theme.modes.dark ?? theme.modes.light;
  return mergeMode(fb, mode);
}

export function themeHasAppearance(theme: DashTheme, appearance: Appearance): boolean {
  return Boolean(theme.modes[appearance]);
}

export function themeSummary(theme: DashTheme, builtin: boolean): ThemeSummary {
  const modes = (["dark", "light"] as const).filter((a) => theme.modes[a]);
  const preview: ThemeSummary["preview"] = {};
  for (const appearance of modes) {
    const tokens = theme.modes[appearance]?.tokens ?? {};
    preview[appearance] = {
      bg: tokens.bg ?? "#111",
      accent: tokens.accent ?? "#888",
    };
  }
  return {
    id: theme.id,
    name: theme.name,
    builtin,
    modes,
    preview,
    theme: builtin ? undefined : theme,
  };
}
