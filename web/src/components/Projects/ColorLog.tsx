import { useMemo, type CSSProperties, type ReactNode } from "react";
import * as S from "./styles";

type Tone = "step" | "ok" | "warn" | "error" | "dim" | "meta";

const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const SGR = /\x1b\[([0-9;]*)m/g;
const TOKEN = /(\b[0-9a-f]{7,40}\b|https?:\/\/[^\s]+)/gi;

const BASIC_FG: Record<number, string> = {
  30: "var(--muted)",
  31: "var(--bad)",
  32: "var(--good)",
  33: "var(--warn)",
  34: "var(--accent)",
  35: "#c678dd",
  36: "#56b6c2",
  37: "var(--text)",
  90: "var(--muted)",
  91: "var(--bad)",
  92: "var(--good)",
  93: "var(--warn)",
  94: "var(--accent)",
  95: "#d19aed",
  96: "#56b6c2",
  97: "var(--text)",
};

function cube(v: number): number {
  return v === 0 ? 0 : 55 + v * 40;
}

function ansi256(n: number): string {
  if (n < 16) {
    const codes = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
    return BASIC_FG[codes[n]] ?? "inherit";
  }
  if (n < 232) {
    const i = n - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    return `rgb(${cube(r)}, ${cube(g)}, ${cube(b)})`;
  }
  const v = 8 + (n - 232) * 10;
  return `rgb(${v}, ${v}, ${v})`;
}

function lineTone(line: string): Tone | undefined {
  const t = line.trim();
  if (!t) return undefined;
  if (/^==>/.test(t) || /^Starting /.test(t)) return "step";
  if (/^(Restarting|Ensuring|Enabling) /.test(t)) return "step";
  if (/^FAILED\b/i.test(t) || /^(error|fatal|panic):/i.test(t)) return "error";
  if (/^error TS\d+/i.test(t) || /^error\s/i.test(t) || /command failed/i.test(t) || /\bELIFECYCLE\b/.test(t)) {
    return "error";
  }
  if (/^warning\b/i.test(t) || /^\s*warn(ing)?:/i.test(t) || /\bdeprecated\b/i.test(t)) {
    return "warn";
  }
  if (
    /^Done\.?$/i.test(t) ||
    /^Done in /i.test(t) ||
    /^already up to date\.?$/i.test(t) ||
    /^publish complete/i.test(t) ||
    /^container (restarted|is running)/i.test(t) ||
    /^service (restarted|enabled)/i.test(t) ||
    /^successfully\b/i.test(t) ||
    /compiled successfully/i.test(t) ||
    /^created /i.test(t) ||
    /^Fast-forward/i.test(t)
  ) {
    return "ok";
  }
  if (
    /^From https?:/i.test(t) ||
    /^hint:/i.test(t) ||
    /^remote:/i.test(t) ||
    /^Restart policy:/i.test(t) ||
    /^#\d+\s/.test(t)
  ) {
    return "dim";
  }
  if (
    /\b[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}\b/.test(t) ||
    /^Updating [0-9a-f]/i.test(t)
  ) {
    return "meta";
  }
  return undefined;
}

function highlightPlain(line: string): ReactNode {
  TOKEN.lastIndex = 0;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const v = m[0];
    parts.push(
      <S.LogTok key={k} $kind={/^https?:/i.test(v) ? "url" : "sha"}>
        {v}
      </S.LogTok>
    );
    k += 1;
    last = m.index + v.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length ? parts : line;
}

type SgrStyle = {
  color?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
};

function applySgr(style: SgrStyle, params: number[]): SgrStyle {
  const next = { ...style };
  if (params.length === 0) params = [0];
  for (let i = 0; i < params.length; i++) {
    const code = params[i];
    if (code === 0) {
      next.color = undefined;
      next.bold = false;
      next.dim = false;
      next.underline = false;
    } else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 24) next.underline = false;
    else if (code === 39) next.color = undefined;
    else if (BASIC_FG[code]) next.color = BASIC_FG[code];
    else if (code === 38 && params[i + 1] === 5) {
      next.color = ansi256(params[i + 2] ?? 0);
      i += 2;
    } else if (code === 38 && params[i + 1] === 2) {
      const r = params[i + 2] ?? 0;
      const g = params[i + 3] ?? 0;
      const b = params[i + 4] ?? 0;
      next.color = `rgb(${r}, ${g}, ${b})`;
      i += 4;
    }
  }
  return next;
}

function sgrCss(style: SgrStyle): CSSProperties | undefined {
  const css: CSSProperties = {};
  if (style.color) css.color = style.color;
  if (style.bold) css.fontWeight = 600;
  if (style.dim) css.opacity = 0.7;
  if (style.underline) css.textDecoration = "underline";
  return Object.keys(css).length ? css : undefined;
}

function renderAnsi(text: string): ReactNode {
  const cleaned = text.replace(ANSI_OSC, "").replace(ANSI_CSI, (m) => (m.endsWith("m") ? m : ""));
  const nodes: ReactNode[] = [];
  let style: SgrStyle = {};
  let last = 0;
  let k = 0;
  SGR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SGR.exec(cleaned))) {
    if (m.index > last) {
      const chunk = cleaned.slice(last, m.index);
      const css = sgrCss(style);
      nodes.push(
        css ? (
          <span key={k} style={css}>
            {chunk}
          </span>
        ) : (
          chunk
        )
      );
      k += 1;
    }
    const params = m[1] ? m[1].split(";").map((n) => Number(n) || 0) : [0];
    style = applySgr(style, params);
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) {
    const chunk = cleaned.slice(last);
    const css = sgrCss(style);
    nodes.push(
      css ? (
        <span key={k} style={css}>
          {chunk}
        </span>
      ) : (
        chunk
      )
    );
  }
  return nodes;
}

function renderLine(line: string, key: number): ReactNode {
  const hasAnsi = line.includes("\x1b[");
  const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
  const content = hasAnsi ? renderAnsi(line) : highlightPlain(line);
  return (
    <S.LogLine key={key} $tone={hasAnsi ? undefined : lineTone(line)}>
      {visible ? content : "\u00a0"}
    </S.LogLine>
  );
}

export function ColorLog({ text }: { text: string }) {
  const nodes = useMemo(() => {
    const lines = text.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.map((line, i) => renderLine(line, i));
  }, [text]);
  return <>{nodes}</>;
}
