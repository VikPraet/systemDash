import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** CodeMirror chrome — uses the same CSS tokens as `GlobalStyle` `:root`. */
export function createEditorTheme(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--panel-2)",
        color: "var(--text)",
        height: "100%",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-scroller": {
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: "13px",
        lineHeight: "1.55",
        overflow: "auto",
      },
      ".cm-gutters": {
        backgroundColor: "var(--panel)",
        color: "var(--muted)",
        borderRight: "1px solid var(--border)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
        color: "var(--text)",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--accent)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent) !important",
        },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: "color-mix(in srgb, var(--accent) 16%, transparent)",
        outline: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
      },
      ".cm-foldGutter span": {
        color: "var(--muted)",
      },
      ".cm-foldPlaceholder": {
        backgroundColor: "var(--panel)",
        border: "1px solid var(--border)",
        color: "var(--muted)",
      },
    },
    { dark }
  );
}

/** Syntax colours derived from the app accent / status palette. */
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--accent)" },
  { tag: [t.operator, t.operatorKeyword], color: "var(--accent)" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "var(--text)" },
  { tag: [t.propertyName], color: "var(--text)" },
  {
    tag: [t.function(t.variableName), t.labelName],
    color: "color-mix(in srgb, var(--accent) 82%, var(--text))",
  },
  {
    tag: [t.color, t.constant(t.name), t.standard(t.name)],
    color: "var(--warn)",
  },
  { tag: [t.definition(t.name), t.separator], color: "var(--text)" },
  {
    tag: [
      t.typeName,
      t.className,
      t.number,
      t.changed,
      t.annotation,
      t.modifier,
      t.self,
      t.namespace,
    ],
    color: "var(--warn)",
  },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "var(--good)" },
  { tag: [t.meta, t.comment], color: "var(--muted)", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "var(--good)" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "var(--warn)" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "var(--good)" },
  { tag: t.invalid, color: "var(--bad)" },
]);

export const editorHighlight = syntaxHighlighting(highlight);
