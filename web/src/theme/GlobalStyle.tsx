import { createGlobalStyle } from "styled-components";
import { mobile } from "./media";

// App-wide base styles. Color tokens are applied as inline CSS variables on
// <html> from the active theme JSON; :root here is only the Classic fallback
// so the first paint isn't unstyled.
export const GlobalStyle = createGlobalStyle`
  :root {
    --radius: 4px;
    --radius-sm: 2px;
    --radius-icon: 2px;
    --bar-radius: 999px;
    --on-accent: #ffffff;
    --knob: #ffffff;
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
    --placeholder: color-mix(in srgb, var(--text) 38%, transparent);
    --hover: color-mix(in srgb, var(--text) 5%, transparent);
    --core-idle: color-mix(in srgb, var(--text) 6%, transparent);
    --selection: color-mix(in srgb, var(--accent) 28%, transparent);
    --accent-ring: color-mix(in srgb, var(--accent) 18%, transparent);
    color-scheme: dark;
    font-synthesis: none;
  }

  * {
    box-sizing: border-box;
  }

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
    background: var(--bg);
    color: var(--text);
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  html[data-atmosphere="glow"] body {
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
  }

  html[data-atmosphere="scanline"] body {
    background: radial-gradient(
        900px 520px at 80% -8%,
        var(--glow-1),
        transparent 58%
      ),
      var(--bg);
    background-attachment: fixed;
  }

  html[data-atmosphere="scanline"] body::before {
    content: "";
    pointer-events: none;
    position: fixed;
    inset: 0;
    z-index: 80;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 2px,
      rgba(0, 0, 0, 0.18) 3px
    );
    opacity: 0.35;
    mix-blend-mode: multiply;
  }

  html[data-theme="light"][data-atmosphere="scanline"] body::before {
    mix-blend-mode: multiply;
    opacity: 0.12;
  }

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

  @keyframes skeleton-shine {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes meter-reconnect {
    0%,
    100% {
      opacity: 0.22;
    }
    50% {
      opacity: 1;
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
