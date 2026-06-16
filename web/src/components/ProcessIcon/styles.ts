import styled from "styled-components";

export type IconCategory =
  | "browser"
  | "code"
  | "terminal"
  | "chat"
  | "media"
  | "game"
  | "document"
  | "shield"
  | "system"
  | "files"
  | "app"
  | "process";

// Per-category accent colors (mirrors the old `.pi-*` rules; some reference
// theme tokens, others are bespoke hues).
const CATEGORY_COLOR: Record<IconCategory, string> = {
  browser: "#4f8cff",
  code: "var(--good)",
  terminal: "#38bdf8",
  chat: "#a78bfa",
  media: "#f472b6",
  game: "#f59e0b",
  document: "#818cf8",
  shield: "#2dd4bf",
  files: "var(--accent)",
  system: "#6b7689",
  app: "#93b4ff",
  process: "#5d6675",
};

export const ProcIconSvg = styled.svg<{ $category: IconCategory }>`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: ${({ $category }) => CATEGORY_COLOR[$category]};
`;
