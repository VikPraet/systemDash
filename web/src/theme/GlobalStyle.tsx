import { createGlobalStyle } from "styled-components";
import { mobile } from "./media";

// App-wide base styles: design tokens (`:root` + `[data-theme]`), resets,
// scrollbar theming, the page background, shared keyframes, and a couple of
// tiny utility classes (`.muted`, `.mono`) composed onto many elements.
export const GlobalStyle = createGlobalStyle`
  :root {
    /* Layout tokens — independent of color palettes. */
    --radius: 4px;
    --radius-sm: 2px;
    --radius-icon: 2px;
    --on-accent: #ffffff;
    --knob: #ffffff;
    font-synthesis: none;
  }

  /* Classic palette: deep blue-black + electric blue. Do not restyle this
     block for lime experiments — layout/radius for lime lives below. */
  :root,
  html[data-theme="dark"] {
    --bg: #060a12;
    --panel: #0c1320;
    --panel-2: #131c2c;
    --sidebar: #080d16;
    --border: #243145;
    --text: #e8eef7;
    --muted: #8b97a8;
    --accent: #4f8cff;
    --track: #18263c;
    --good: #33c98e;
    --warn: #d6a23f;
    --bad: #e86a6f;
    --hairline: rgba(255, 255, 255, 0.16);
    --overlay: rgba(4, 8, 14, 0.62);
    --shadow: rgba(0, 0, 0, 0.5);
    --elev: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    --glow-1: rgba(79, 140, 255, 0.16);
    --glow-2: rgba(79, 140, 255, 0.07);
    --auth-dot: rgba(255, 255, 255, 0.07);
    --auth-glow: rgba(79, 140, 255, 0.22);
    --auth-panel: color-mix(in srgb, #131c2c 78%, transparent);
    --on-accent: #ffffff;
    color-scheme: dark;
  }

  html[data-theme="light"] {
    --bg: #e7eef7;
    --panel: #ffffff;
    --panel-2: #f3f6fb;
    --sidebar: #dfe7f2;
    --border: #c3cedd;
    --text: #122033;
    --muted: #55657a;
    --accent: #1f5fe0;
    --track: #d5deeb;
    --good: #0e8f64;
    --warn: #b45309;
    --glow-2: rgba(31, 95, 224, 0.05);
    --auth-dot: rgba(18, 32, 51, 0.08);
    --auth-glow: rgba(31, 95, 224, 0.18);
    --auth-panel: color-mix(in srgb, #ffffff 86%, transparent);
    --on-accent: #ffffff;
    color-scheme: light;
  }

  /* Lime experiments: layout tokens + charcoal palette. Classic above stays put. */
  html[data-palette="lime"] {
    --radius: 22px;
    --radius-sm: 12px;
    --radius-icon: 8px;
  }

  html[data-palette="lime"][data-theme="dark"] {
    --bg: #000000;
    --panel: #0a0a0a;
    --panel-2: #121212;
    --sidebar: #050505;
    --border: #222222;
    --text: #f2f2f2;
    --muted: #8a8a8a;
    --accent: #c6ff3d;
    --track: #161616;
    --good: #c6ff3d;
    --warn: #ff7a4d;
    --bad: #e86a6f;
    --hairline: rgba(255, 255, 255, 0.1);
    --overlay: rgba(0, 0, 0, 0.72);
    --shadow: rgba(0, 0, 0, 0.7);
    --elev: inset 0 1px 0 rgba(255, 255, 255, 0.035);
    --glow-1: rgba(198, 255, 61, 0.08);
    --glow-2: rgba(198, 255, 61, 0.03);
    --auth-dot: rgba(255, 255, 255, 0.045);
    --auth-glow: rgba(198, 255, 61, 0.12);
    --auth-panel: color-mix(in srgb, #0a0a0a 86%, transparent);
    --on-accent: #000000;
    color-scheme: dark;
  }

  html[data-palette="lime"][data-theme="light"] {
    --bg: #ececec;
    --panel: #ffffff;
    --panel-2: #f4f4f4;
    --sidebar: #e6e6e6;
    --border: #d0d0d0;
    --text: #161616;
    --muted: #6a6a6a;
    --accent: #4f8a00;
    --track: #dddddd;
    --good: #4f8a00;
    --warn: #e24a24;
    --bad: #d13b44;
    --hairline: rgba(18, 18, 18, 0.14);
    --overlay: rgba(12, 12, 12, 0.38);
    --shadow: rgba(0, 0, 0, 0.12);
    --elev: 0 1px 2px rgba(0, 0, 0, 0.06);
    --glow-1: rgba(79, 138, 0, 0.1);
    --glow-2: rgba(79, 138, 0, 0.05);
    --auth-dot: rgba(18, 18, 18, 0.08);
    --auth-glow: rgba(79, 138, 0, 0.14);
    --auth-panel: color-mix(in srgb, #ffffff 86%, transparent);
    --on-accent: #121212;
    color-scheme: light;
  }

  :root {
    --placeholder: color-mix(in srgb, var(--text) 38%, transparent);
    --hover: color-mix(in srgb, var(--text) 5%, transparent);
    --core-idle: color-mix(in srgb, var(--text) 6%, transparent);
    --selection: color-mix(in srgb, var(--accent) 28%, transparent);
    --accent-ring: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  * {
    box-sizing: border-box;
  }

  /* Scrollbar themed to match the dashboard */
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  *::-webkit-scrollbar-track {
    background: var(--bg);
  }

  *::-webkit-scrollbar-thumb {
    background: var(--panel-2);
    border: 2px solid var(--bg);
    border-radius: 999px;
  }

  *::-webkit-scrollbar-thumb:hover {
    background: var(--border);
  }

  *::-webkit-scrollbar-corner {
    background: var(--bg);
  }

  html,
  body,
  #root {
    height: 100%;
    margin: 0;
  }

  /* Desktop: only the main pane scrolls. Otherwise wheel overscroll at the
     bottom of a tall page (opened project, activity log) moves <html>. */
  @media not ${mobile} {
    html,
    body,
    #root {
      overflow: hidden;
    }
  }

  html {
    -webkit-text-size-adjust: 100%;
  }

  body {
    background: radial-gradient(
        1100px 620px at 82% -12%,
        var(--glow-1),
        transparent 58%
      ),
      radial-gradient(
        800px 520px at 0% 110%,
        var(--glow-2),
        transparent 55%
      ),
      var(--bg);
    background-attachment: fixed;
    color: var(--text);
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* Composable text utilities used across many components. */
  .muted {
    color: var(--muted);
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }

  .ta-right {
    text-align: right;
  }

  /* ---- Shared keyframes (referenced by name from component styles) ---- */
  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 6px var(--accent);
    }
    50% {
      box-shadow: 0 0 16px var(--accent);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes modal-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes modal-pop {
    from {
      transform: translateY(8px) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @keyframes dropdown-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes auth-pane-in {
    from {
      opacity: 0;
      transform: translateX(var(--auth-slide, 18px));
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
`;
