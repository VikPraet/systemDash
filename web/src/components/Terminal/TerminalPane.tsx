import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { cache } from "../../cache";
import {
  attachTerminalSession,
  disposeTerminalSession,
  getTerminalSession,
  setTerminalSession,
  type TerminalSession,
} from "./terminalSession";
import { appendTerminalScrollback, clearTerminalScrollback } from "./terminalPersist";
import * as S from "./styles";

function writeSession(session: TerminalSession, data: string, tabId: string): void {
  session.term.write(data);
  appendTerminalScrollback(tabId, data);
}

function createSession(tabId: string): TerminalSession {
  let ws: WebSocket | null = null;
  let cancelled = false;

  const term = new XTerm({
    convertEol: false,
    cursorBlink: true,
    scrollback: 8000,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    theme: {
      background: "#141d2c",
      foreground: "#e6edf6",
      cursor: "#4f8cff",
      selectionBackground: "rgba(79, 140, 255, 0.28)",
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  const session: TerminalSession = {
    term,
    fit,
    fitTerminal: () => {},
    host: null,
    visible: true,
    restored: false,
    dispose: () => {},
  };

  const sendResize = () => {
    const host = session.host;
    if (!session.visible || !host || host.clientWidth < 2 || host.clientHeight < 2) return;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    }
  };

  session.fitTerminal = () => {
    const host = session.host;
    if (!session.visible || !host || host.clientWidth < 2 || host.clientHeight < 2) return;
    try {
      fit.fit();
      sendResize();
    } catch {
      // host not measurable yet
    }
  };

  session.dispose = () => {
    cancelled = true;
    window.clearTimeout(connectTimer);
    dataSub.dispose();
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    term.dispose();
    session.host = null;
  };

  const connect = () => {
    if (cancelled) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/api/terminal`);

    ws.onopen = () => session.fitTerminal();
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") writeSession(session, ev.data, tabId);
    };
    ws.onclose = () => {
      writeSession(session, "\r\n\x1b[90m[disconnected]\x1b[0m\r\n", tabId);
    };
    ws.onerror = () => {
      writeSession(session, "\r\n\x1b[31m[connection error]\x1b[0m\r\n", tabId);
    };
  };

  const connectTimer = window.setTimeout(connect, 0);

  const dataSub = term.onData((data) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data }));
    }
  });

  return session;
}

/** One xterm + WebSocket session per tab. Sessions survive tab switches and route changes. */
export function TerminalPane({
  tabId,
  visible,
  focused,
  onFocus,
}: {
  tabId: string;
  visible: boolean;
  focused: boolean;
  onFocus: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let session = getTerminalSession(tabId);
    const isNew = !session;
    if (!session) {
      session = createSession(tabId);
      setTerminalSession(tabId, session);
    }
    sessionRef.current = session;
    session.visible = visibleRef.current;
    session.host = host;

    const initialScrollback = isNew ? cache.terminal.scrollback[tabId] : undefined;
    attachTerminalSession(session, host, initialScrollback);

    const fitTimers = [50, 150, 400].map((ms) =>
      window.setTimeout(() => {
        if (visibleRef.current) session.fitTerminal();
      }, ms)
    );

    const onResize = () => {
      if (visibleRef.current) session?.fitTerminal();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      window.removeEventListener("resize", onResize);
      for (const id of fitTimers) window.clearTimeout(id);
      ro.disconnect();
      sessionRef.current = null;
      if (session) session.host = null;
    };
  }, [tabId]);

  useEffect(() => {
    const session = sessionRef.current ?? getTerminalSession(tabId);
    if (!session) return;
    session.visible = visible;

    if (!visible) return;

    const id = window.requestAnimationFrame(() => {
      session.fitTerminal();
      window.requestAnimationFrame(() => {
        session.fitTerminal();
        session.term.refresh(0, session.term.rows - 1);
        if (focused) session.term.focus();
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [tabId, visible, focused]);

  return (
    <S.TerminalPane $visible={visible} onMouseDown={onFocus}>
      <S.TerminalHost ref={hostRef} />
    </S.TerminalPane>
  );
}

export function closeTerminalTabSession(tabId: string): void {
  disposeTerminalSession(tabId);
  clearTerminalScrollback(tabId);
}
