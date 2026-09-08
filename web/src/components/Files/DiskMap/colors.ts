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

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function usageFill(type: UsageNodeType, ext: string | null): string {
  if (type === "free") return "var(--track)";
  if (type === "other") return "color-mix(in srgb, var(--muted) 45%, var(--panel-2))";
  if (type === "dir") return "color-mix(in srgb, var(--accent) 28%, var(--panel-2))";
  const key = (ext ?? "").toLowerCase();
  if (key && EXT_COLOR[key]) return EXT_COLOR[key];
  if (!key) return "color-mix(in srgb, var(--muted) 55%, var(--panel))";
  const hue = hashHue(key);
  return `hsl(${hue} 62% 52%)`;
}

export function usageStroke(selected: boolean, hover: boolean): string {
  if (selected) return "var(--text)";
  if (hover) return "color-mix(in srgb, var(--text) 55%, transparent)";
  return "color-mix(in srgb, var(--bg) 55%, transparent)";
}
