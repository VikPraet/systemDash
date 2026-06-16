// Central design tokens for the app.
//
// Values intentionally resolve to CSS custom properties (defined in
// `GlobalStyle`'s `:root`) rather than raw hex. This keeps a single source of
// truth, lets the few remaining inline `style={{ ... var(--x) ... }}` usages and
// `color-mix()` expressions keep working, and still gives styled-components an
// idiomatic, typed `theme` to consume:
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
  },
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
