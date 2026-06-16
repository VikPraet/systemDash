import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { rust } from "@codemirror/lang-rust";
import { php } from "@codemirror/lang-php";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { nginx } from "@codemirror/legacy-modes/mode/nginx";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { go } from "@codemirror/legacy-modes/mode/go";

export interface EditorLanguage {
  label: string;
  extension: Extension;
}

function legacy(mode: Parameters<typeof StreamLanguage.define>[0], label: string): EditorLanguage {
  return { label, extension: StreamLanguage.define(mode) };
}

/** Picks a CodeMirror language pack from a file name / path. */
export function languageForFile(name: string): EditorLanguage {
  const base = name.split(/[/\\]/).pop() ?? name;
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";

  if (lower === "dockerfile" || lower.endsWith(".dockerfile")) {
    return legacy(dockerFile, "Dockerfile");
  }
  if (lower === "nginx.conf" || lower.endsWith(".nginx")) {
    return legacy(nginx, "Nginx");
  }

  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return { label: "JavaScript", extension: javascript({ jsx: false }) };
    case "jsx":
      return { label: "JSX", extension: javascript({ jsx: true }) };
    case "ts":
      return { label: "TypeScript", extension: javascript({ typescript: true }) };
    case "tsx":
      return {
        label: "TSX",
        extension: javascript({ typescript: true, jsx: true }),
      };
    case "json":
    case "jsonc":
    case "json5":
      return { label: "JSON", extension: json() };
    case "html":
    case "htm":
      return { label: "HTML", extension: html() };
    case "css":
    case "scss":
    case "less":
      return { label: "CSS", extension: css() };
    case "py":
    case "pyw":
      return { label: "Python", extension: python() };
    case "md":
    case "markdown":
      return { label: "Markdown", extension: markdown() };
    case "xml":
    case "svg":
    case "xaml":
      return { label: "XML", extension: xml() };
    case "sql":
      return { label: "SQL", extension: sql() };
    case "yml":
    case "yaml":
      return { label: "YAML", extension: yaml() };
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
    case "hh":
      return { label: "C++", extension: cpp() };
    case "java":
      return { label: "Java", extension: java() };
    case "rs":
      return { label: "Rust", extension: rust() };
    case "php":
      return { label: "PHP", extension: php() };
    case "go":
      return legacy(go, "Go");
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return legacy(shell, "Shell");
    case "ps1":
    case "psm1":
      return legacy(shell, "PowerShell");
    case "bat":
    case "cmd":
      return legacy(shell, "Batch");
    case "env":
    case "ini":
    case "cfg":
    case "conf":
    case "config":
    case "properties":
    case "toml":
    case "service":
      return legacy(properties, "Config");
    default:
      return { label: "Plain text", extension: [] };
  }
}
