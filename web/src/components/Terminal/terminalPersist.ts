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

export function appendTerminalScrollback(tabId: string, chunk: string): void {
  if (!chunk) return;
  const prev = cache.terminal.scrollback[tabId] ?? "";
  let next = prev + chunk;
  if (next.length > MAX_SCROLLBACK_CHARS) {
    next = next.slice(next.length - MAX_SCROLLBACK_CHARS);
  }
  cache.terminal.scrollback[tabId] = next;
  scheduleTerminalPersist();
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
