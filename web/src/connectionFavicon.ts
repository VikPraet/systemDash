import { cssVar } from "./theme/appearance";

export type ConnectionFaviconState = "good" | "bad" | "idle";

let current: ConnectionFaviconState = "idle";
let listening = false;

function fillFor(state: ConnectionFaviconState): string {
  if (state === "good") return cssVar("--good", "#33c98e");
  if (state === "bad") return cssVar("--bad", "#e86a6f");
  return cssVar("--muted", "#8b97a8");
}

function meterSvg(state: ConnectionFaviconState): string {
  const tile = cssVar("--panel-2", "#131c2c");
  const track = cssVar("--track", "#18263c");
  const active = fillFor(state);
  const filled = state === "good" ? 4 : state === "idle" ? 2 : 1;
  const heights = [8, 12, 18, 24];
  const width = 4;
  const gap = 2.5;
  const group = heights.length * width + (heights.length - 1) * gap;
  const startX = (32 - group) / 2;
  const bottom = 27;
  const rx = 1.2;

  const bars = heights
    .map((h, i) => {
      const x = startX + i * (width + gap);
      const y = bottom - h;
      const fill = i < filled ? active : track;
      return `<rect x="${x.toFixed(2)}" y="${y}" width="${width}" height="${h}" rx="${rx}" fill="${fill}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${tile}"/>${bars}</svg>`;
}

function paint(): void {
  const href = `data:image/svg+xml,${encodeURIComponent(meterSvg(current))}`;
  const next = document.createElement("link");
  next.rel = "icon";
  next.type = "image/svg+xml";
  next.dataset.connectionFavicon = "1";
  next.href = href;
  const prev = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-connection-favicon]");
  if (prev) prev.replaceWith(next);
  else document.head.appendChild(next);
}

export function applyConnectionFavicon(state: ConnectionFaviconState): void {
  current = state;
  if (!listening) {
    listening = true;
    window.addEventListener("systemdash-appearance", () => paint());
  }
  paint();
}
