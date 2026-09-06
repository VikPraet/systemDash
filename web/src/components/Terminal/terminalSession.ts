import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { xtermThemeFromCss } from "../../theme/appearance";

export interface TerminalSession {
  term: XTerm;
  fit: FitAddon;
  fitTerminal: () => void;
  ensureConnected: () => void;
  flushOutput: () => void;
  host: HTMLDivElement | null;
  visible: boolean;
  restored: boolean;
  dispose: () => void;
}

const sessions = new Map<string, TerminalSession>();

export function getTerminalSession(tabId: string): TerminalSession | undefined {
  return sessions.get(tabId);
}

export function setTerminalSession(tabId: string, session: TerminalSession): void {
  sessions.set(tabId, session);
}

export function disposeTerminalSession(tabId: string): void {
  const session = sessions.get(tabId);
  if (!session) return;
  session.dispose();
  sessions.delete(tabId);
}

export function syncXtermTheme(): void {
  const theme = xtermThemeFromCss();
  for (const session of sessions.values()) {
    session.term.options.theme = theme;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("systemdash-appearance", syncXtermTheme);
}

/** Moves an existing xterm element into `host` and refits when shown. */
export function attachTerminalSession(
  session: TerminalSession,
  host: HTMLDivElement,
  initialScrollback?: string
): void {
  session.host = host;
  if (!session.term.element) {
    session.term.open(host);
    if (initialScrollback) {
      try {
        session.term.write(initialScrollback, () => session.flushOutput());
      } catch {
        session.flushOutput();
      }
    } else {
      session.flushOutput();
    }
  } else {
    host.replaceChildren(session.term.element);
  }
  if (session.visible) session.fitTerminal();
}
