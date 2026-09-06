import { createGlobalStyle } from "styled-components";

// App-wide base styles: design tokens (`:root` + `[data-theme]`), resets,
// scrollbar theming, the page background, shared keyframes, and a couple of
// tiny utility classes (`.muted`, `.mono`) composed onto many elements.
export const GlobalStyle = createGlobalStyle`
  :root {
    --radius: 4px;
    --radius-sm: 2px;
    --on-accent: #ffffff;
    --knob: #ffffff;
    font-synthesis: none;
  }

  /* Deep blue-black palette matching the login screen's mood. */
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
    --bad: #d13b44;
    --hairline: rgba(18, 32, 51, 0.14);
    --overlay: rgba(15, 23, 42, 0.38);
    --shadow: rgba(15, 32, 58, 0.14);
    --elev: 0 1px 2px rgba(15, 32, 58, 0.06);
    --glow-1: rgba(31, 95, 224, 0.1);
    --glow-2: rgba(31, 95, 224, 0.05);
    --auth-dot: rgba(18, 32, 51, 0.08);
    --auth-glow: rgba(31, 95, 224, 0.18);
    --auth-panel: color-mix(in srgb, #ffffff 86%, transparent);
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
`;
