import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// Raw terminal: the backend runs a real PTY (server/src/terminal.ts), so the
// shell handles echo, line editing, history and signals itself. xterm.js just
// forwards keystrokes and renders whatever the PTY emits.
export function Terminal() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // React StrictMode (dev) mounts effects twice: mount → cleanup → mount.
    // Opening the WebSocket synchronously would create a throwaway connection
    // that the server still audits as a connect/disconnect pair. Defer the
    // connection by a tick so the StrictMode cleanup cancels it before it ever
    // opens, leaving exactly one audited session per real visit.
    let cancelled = false;
    let ws: WebSocket | null = null;

    const term = new XTerm({
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      theme: {
        background: "#0b0e14",
        foreground: "#d6deeb",
        cursor: "#7aa2f7",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    term.focus();

    const sendResize = () => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
        );
      }
    };

    const connect = () => {
      if (cancelled) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/terminal`);

      ws.onopen = () => {
        sendResize();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") term.write(ev.data);
      };
      ws.onclose = () => {
        term.write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n");
      };
      ws.onerror = () => {
        term.write("\r\n\x1b[31m[connection error]\x1b[0m\r\n");
      };
    };

    const connectTimer = window.setTimeout(connect, 0);

    const dataSub = term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const onResize = () => {
      try {
        fit.fit();
        sendResize();
      } catch {
        // container not measurable yet
      }
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimer);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      dataSub.dispose();
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      term.dispose();
    };
  }, []);

  return (
    <div className="terminal-tab">
      <div className="terminal-bar">
        <span className="terminal-title">Terminal</span>
        <span className="terminal-hint muted">local shell</span>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
