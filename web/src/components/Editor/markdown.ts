/** True for `.md` / `.markdown` files. */
export function isMarkdownFile(name: string): boolean {
  const base = name.split(/[/\\]/).pop()?.toLowerCase() ?? "";
  return base.endsWith(".md") || base.endsWith(".markdown");
}

export type MarkdownView = "source" | "preview";
