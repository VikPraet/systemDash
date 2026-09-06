import { cache } from "../../cache";
import { randomId } from "../../randomId";

const STORAGE_KEY = "systemdash-terminal";
const MAX_SCROLLBACK_CHARS = 512_000;
const PERSIST_MS = 400;

export type TerminalSplitMode = "none" | "horizontal" | "vertical";
export type TerminalPaneId = "primary" | "secondary";

export interface TerminalTabState {
  id: string;
  title: string;
}

export interface TerminalLayoutState {
  tabs: TerminalTabState[];
  primaryTabId: string;
  secondaryTabId: string | null;
  splitMode: TerminalSplitMode;
  focusedPane: TerminalPaneId;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function defaultTab(): TerminalTabState {
  const id = randomId();
  return { id, title: "Shell 1" };
}

function readStorage(): Partial<TerminalLayoutState & { scrollback: Record<string, string> }> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<TerminalLayoutState & { scrollback: Record<string, string> }>;
  } catch {
    return null;
  }
}

/** Seeds `cache.terminal` from sessionStorage on first load. */
export function initTerminalCache(): void {
  const stored = readStorage();
  if (!stored?.tabs?.length || !stored.primaryTabId) return;

  const tabIds = new Set(stored.tabs.map((t) => t.id));
  if (!tabIds.has(stored.primaryTabId)) return;

  cache.terminal.tabs = stored.tabs;
  cache.terminal.primaryTabId = stored.primaryTabId;
  cache.terminal.secondaryTabId =
    stored.secondaryTabId && tabIds.has(stored.secondaryTabId)
      ? stored.secondaryTabId
      : null;
  cache.terminal.splitMode = stored.splitMode ?? "none";
  cache.terminal.focusedPane = stored.focusedPane ?? "primary";
  if (stored.scrollback && typeof stored.scrollback === "object") {
    cache.terminal.scrollback = { ...stored.scrollback };
  }
}

export function getDefaultTerminalLayout(): TerminalLayoutState & {
  scrollback: Record<string, string>;
} {
  const tab = defaultTab();
  return {
    tabs: [tab],
    primaryTabId: tab.id,
    secondaryTabId: null,
    splitMode: "none",
    focusedPane: "primary",
    scrollback: {},
  };
}

/**
 * `clear` / RIS / CSI 2J (erase display) / CSI 3J (erase scrollback).
 * Returns the text after the last wipe, or null if none was found.
 */
function sliceAfterLastFullClear(text: string): string | null {
  const re = /\x1b\[([0-9;]*)J|\x1bc/g;
  let lastEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0] === "\x1bc") {
      lastEnd = match.index + match[0].length;
      continue;
    }
    const params = match[1] === "" ? ["0"] : match[1].split(";");
    if (params.some((p) => p === "2" || p === "3")) {
      lastEnd = match.index + match[0].length;
    }
  }
  return lastEnd === -1 ? null : text.slice(lastEnd);
}

function capScrollback(text: string): string {
  if (text.length <= MAX_SCROLLBACK_CHARS) return text;
  return text.slice(text.length - MAX_SCROLLBACK_CHARS);
}

export function appendTerminalScrollback(tabId: string, chunk: string): void {
  if (!chunk) return;
  const prev = cache.terminal.scrollback[tabId] ?? "";
  let next = prev + chunk;
  const afterClear = sliceAfterLastFullClear(next);
  if (afterClear !== null) next = afterClear;
  cache.terminal.scrollback[tabId] = capScrollback(next);
  scheduleTerminalPersist();
}

export function replaceTerminalScrollback(tabId: string, text: string): void {
  // Keep an empty string so a cleared tab stays cleared across reload,
  // instead of looking like a brand-new tab that should show the banner.
  cache.terminal.scrollback[tabId] = capScrollback(text);
  scheduleTerminalPersist();
}

const CONNECT_BANNER =
  /Connected as \S+@[^\r\n]+?\. Working dir: [^\r\n]+/;

/** True when a WebSocket payload is the server's one-shot connect greeting. */
export function isTerminalConnectBanner(data: string): boolean {
  return /^[\r\n]*Connected as \S+@[^\r\n]+?\. Working dir: [^\r\n]+[\r\n]*$/.test(data);
}

function trimIncompleteTerminalLine(text: string): string {
  if (!text || text.endsWith("\n")) return text;
  const lastNl = text.lastIndexOf("\n");
  if (lastNl === -1) return "";
  return text.slice(0, lastNl + 1);
}

/**
 * Cleans sessionStorage scrollback after a reload. Reloads start a new PTY, so
 * we drop glued "prompt + Connected as…" lines, honor `clear`, and strip the
 * leftover live prompt instead of painting them into the new session.
 */
export function sanitizeRestoredScrollback(text: string): string {
  const sliced = sliceAfterLastFullClear(text);
  const body = sliced !== null ? sliced : text;
  if (!body) return "";
  const lineRe =
    /[^\r\n]*Connected as \S+@[^\r\n]+?\. Working dir: [^\r\n]+(?:\r\n|\n|\r)?/g;
  let keptBanner = "";
  const rest = body.replace(lineRe, (line) => {
    if (!keptBanner) {
      const match = line.match(CONNECT_BANNER);
      if (match) keptBanner = `${match[0]}\r\n`;
    }
    return "";
  });
  return keptBanner + trimIncompleteTerminalLine(rest);
}

export function clearTerminalScrollback(tabId: string): void {
  delete cache.terminal.scrollback[tabId];
  scheduleTerminalPersist();
}

export function syncTerminalLayout(layout: TerminalLayoutState): void {
  cache.terminal.tabs = layout.tabs;
  cache.terminal.primaryTabId = layout.primaryTabId;
  cache.terminal.secondaryTabId = layout.secondaryTabId;
  cache.terminal.splitMode = layout.splitMode;
  cache.terminal.focusedPane = layout.focusedPane;
  scheduleTerminalPersist();
}

export function scheduleTerminalPersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          tabs: cache.terminal.tabs,
          primaryTabId: cache.terminal.primaryTabId,
          secondaryTabId: cache.terminal.secondaryTabId,
          splitMode: cache.terminal.splitMode,
          focusedPane: cache.terminal.focusedPane,
          scrollback: cache.terminal.scrollback,
        })
      );
    } catch {
      // sessionStorage full or unavailable
    }
  }, PERSIST_MS);
}
