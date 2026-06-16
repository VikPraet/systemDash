import { createGlobalStyle } from "styled-components";

// App-wide base styles: design tokens (`:root`), resets, scrollbar theming, the
// page background, shared keyframes, and a couple of tiny utility classes
// (`.muted`, `.mono`) that are composed onto many elements throughout the app.
export const GlobalStyle = createGlobalStyle`
  :root {
    /* Deep blue-black palette matching the login screen's mood. */
    --bg: #070b13;
    --panel: #0d1420;
    --panel-2: #141d2c;
    --border: #202b3e;
    --text: #e6edf6;
    --muted: #8b97a8;
    --accent: #4f8cff;
    --track: #1a2740;
    /* Status colors retuned cooler/calmer to sit in the blue palette. */
    --good: #33c98e;
    --warn: #d6a23f;
    --bad: #e86a6f;
    /* Editorial design language: sharp corners across the app. */
    --radius: 4px;
    --radius-sm: 2px;
    --hairline: rgba(255, 255, 255, 0.18);
    font-synthesis: none;
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

  body {
    /* Subtle blue ambient glow, echoing the login background. */
    background: radial-gradient(
        1100px 620px at 82% -12%,
        rgba(79, 140, 255, 0.12),
        transparent 58%
      ),
      radial-gradient(
        900px 600px at 6% 110%,
        rgba(51, 201, 142, 0.06),
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
