// Central design tokens for the app.
//
// Values intentionally resolve to CSS custom properties (defined in
// `GlobalStyle`'s `:root` / `[data-theme]`) rather than raw hex. This keeps a
// single source of truth, lets the few remaining inline
// `style={{ ... var(--x) ... }}` usages and `color-mix()` expressions keep
// working, and still gives styled-components an idiomatic, typed `theme`:
//
//   styled.div`
//     color: ${({ theme }) => theme.color.accent};
//   `;
export const theme = {
  color: {
    bg: "var(--bg)",
    panel: "var(--panel)",
    panel2: "var(--panel-2)",
    border: "var(--border)",
    text: "var(--text)",
    muted: "var(--muted)",
    accent: "var(--accent)",
    track: "var(--track)",
    good: "var(--good)",
    warn: "var(--warn)",
    bad: "var(--bad)",
    hairline: "var(--hairline)",
    placeholder: "var(--placeholder)",
    overlay: "var(--overlay)",
    shadow: "var(--shadow)",
    onAccent: "var(--on-accent)",
    knob: "var(--knob)",
    hover: "var(--hover)",
    coreIdle: "var(--core-idle)",
    selection: "var(--selection)",
    accentRing: "var(--accent-ring)",
    sidebar: "var(--sidebar)",
    authPanel: "var(--auth-panel)",
    authGlow: "var(--auth-glow)",
  },
  elev: "var(--elev)",
  radius: {
    base: "var(--radius)",
    sm: "var(--radius-sm)",
  },
  font: {
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
} as const;

export type AppTheme = typeof theme;
