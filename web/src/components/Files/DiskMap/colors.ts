import type { UsageNodeType } from "../../../types";

const EXT_COLOR: Record<string, string> = {
  mp4: "#e45c4c",
  mkv: "#de4a3d",
  avi: "#c43d32",
  mov: "#f07167",
  webm: "#c44536",
  wmv: "#d4554a",
  m4v: "#e0675b",
  mp3: "#a78bfa",
  wav: "#8b5cf6",
  flac: "#7c3aed",
  aac: "#9f7aea",
  ogg: "#818cf8",
  m4a: "#c4b5fd",
  jpg: "#34d399",
  jpeg: "#34d399",
  png: "#10b981",
  gif: "#2dd4bf",
  webp: "#059669",
  svg: "#14b8a6",
  bmp: "#4ade80",
  psd: "#22c55e",
  heic: "#86efac",
  zip: "#fbbf24",
  rar: "#f59e0b",
  "7z": "#d97706",
  gz: "#eab308",
  tar: "#ca8a04",
  iso: "#a16207",
  xz: "#facc15",
  pdf: "#f87171",
  doc: "#3b82f6",
  docx: "#3b82f6",
  xls: "#22c55e",
  xlsx: "#16a34a",
  ppt: "#f97316",
  pptx: "#ea580c",
  txt: "#94a3b8",
  md: "#64748b",
  js: "#eab308",
  mjs: "#eab308",
  ts: "#3b82f6",
  tsx: "#2563eb",
  jsx: "#38bdf8",
  py: "#22c55e",
  rs: "#f97316",
  go: "#22d3ee",
  json: "#94a3b8",
  css: "#38bdf8",
  html: "#fb7185",
  xml: "#64748b",
  yml: "#94a3b8",
  yaml: "#94a3b8",
  exe: "#ec4899",
  dll: "#c026d3",
  msi: "#db2777",
  so: "#e11d48",
  dmg: "#a855f7",
  app: "#d946ef",
  bat: "#f43f5e",
  cmd: "#e11d48",
  sys: "#9f1239",
  vmdk: "#6366f1",
  vhd: "#818cf8",
  vhdx: "#6366f1",
  img: "#64748b",
  db: "#0ea5e9",
  sqlite: "#0284c7",
  bak: "#78716c",
};

// Tiles are deliberately theme-independent: mixing them with the panel tokens
// made files blend into the background (and into the folder plates) on themes
// whose panels are very dark or very light.
const DIR_FILL = "#5486c0";
const UNKNOWN_FILL = "#8b93a1";
const OTHER_FILL = "#5c6472";
const FREE_FILL = "#3a4150";

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hslToHex(hue: number, sat: number, light: number): string {
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const base = light - c / 2;
  const seg = Math.floor(hp) % 6;
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  const hex = rgb
    .map((v) =>
      Math.round((v + base) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
  return `#${hex}`;
}

export function usageFill(type: UsageNodeType, ext: string | null): string {
  if (type === "free") return FREE_FILL;
  if (type === "other") return OTHER_FILL;
  if (type === "dir") return DIR_FILL;
  const key = (ext ?? "").toLowerCase();
  if (!key) return UNKNOWN_FILL;
  return EXT_COLOR[key] ?? hslToHex(hashHue(key), 0.62, 0.52);
}

function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = Number.parseInt(m[1], 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export interface UsageColor {
  fill: string;
  /** Label colour that stays readable on top of `fill`. */
  label: string;
  meta: string;
}

export function usageColor(type: UsageNodeType, ext: string | null): UsageColor {
  const fill = usageFill(type, ext);
  // 0.2 is roughly where black text overtakes white text in contrast.
  if (relativeLuminance(fill) >= 0.2) {
    return { fill, label: "rgba(8,10,14,0.88)", meta: "rgba(8,10,14,0.7)" };
  }
  return { fill, label: "rgba(255,255,255,0.94)", meta: "rgba(255,255,255,0.72)" };
}

// Folder containers sit behind their children, so each nesting level gets a
// slightly lighter plate to keep the boundaries readable.
export function frameFill(depth: number): string {
  const tint = Math.min(16, 6 + depth * 3);
  return `color-mix(in srgb, var(--text) ${tint}%, var(--panel-2))`;
}

export function frameStroke(depth: number): string {
  const strength = Math.max(22, 55 - depth * 8);
  return `color-mix(in srgb, var(--muted) ${strength}%, transparent)`;
}

export function usageStroke(selected: boolean, hover: boolean): string {
  if (selected) return "var(--text)";
  if (hover) return "color-mix(in srgb, var(--text) 55%, transparent)";
  return "color-mix(in srgb, var(--bg) 55%, transparent)";
}
