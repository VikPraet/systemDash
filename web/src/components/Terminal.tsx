import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// A line-buffered terminal: the browser does local echo + line editing, then
// sends whole lines to the server's shell. This pairs with the piped (non-PTY)
// backend in server/src/terminal.ts.
export function Terminal() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      convertEol: true,
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

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/terminal`);

    let connected = false;

    ws.onopen = () => {
      connected = true;
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") term.write(ev.data);
    };
    ws.onclose = () => {
      connected = false;
      term.write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n");
    };
    ws.onerror = () => {
      term.write("\r\n\x1b[31m[connection error]\x1b[0m\r\n");
    };

    // Raw passthrough: the shell (PowerShell on Windows, bash/$SHELL elsewhere)
    // handles echo, line editing, history and Ctrl+C itself. We just forward
    // keystrokes and render whatever comes back.
    const dataSub = term.onData((data) => {
      if (connected) ws.send(JSON.stringify({ type: "input", data }));
    });

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        // container not measurable yet
      }
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      dataSub.dispose();
      ws.close();
      term.dispose();
    };
  }, []);

  return (
    <div className="terminal-tab">
      <div className="terminal-bar">
        <span className="terminal-title">Terminal</span>
        <span className="terminal-hint muted">
          local shell · full-screen TUI apps (vim, htop) unsupported
        </span>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
