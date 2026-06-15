import { WebSocketServer, type WebSocket } from "ws";
import { spawn } from "node:child_process";
import os from "node:os";
import type { Server } from "node:http";

// We stream a piped child shell (not a real PTY) over a WebSocket. The browser
// handles line editing and local echo, then sends whole lines to the shell's
// stdin; the shell's stdout/stderr is streamed back. This keeps things
// dependency-light and cross-platform, at the cost of full-screen TUI support
// (vim, htop, etc.), which would need a real PTY (node-pty) or SSH later.

interface ClientMessage {
  type: "input";
  data: string;
}

function shellCommand(): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    return { cmd: "powershell.exe", args: ["-NoLogo"] };
  }
  return { cmd: process.env.SHELL || "/bin/bash", args: [] };
}

function startSession(ws: WebSocket): void {
  const { cmd, args } = shellCommand();
  const send = (s: string) => {
    if (ws.readyState === ws.OPEN) ws.send(s);
  };

  let child;
  try {
    child = spawn(cmd, args, {
      cwd: os.homedir(),
      env: process.env,
      windowsHide: true,
    });
  } catch (err) {
    send(`Failed to start shell: ${(err as Error).message}\r\n`);
    ws.close();
    return;
  }

  child.stdout.on("data", (d: Buffer) => send(d.toString()));
  child.stderr.on("data", (d: Buffer) => send(d.toString()));
  child.on("error", (err) => send(`\r\n[shell error: ${err.message}]\r\n`));
  child.on("exit", (code) => {
    send(`\r\n[process exited with code ${code ?? 0}]\r\n`);
    if (ws.readyState === ws.OPEN) ws.close();
  });

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (msg.type === "input" && typeof msg.data === "string") {
      try {
        child.stdin.write(msg.data);
      } catch {
        // shell closed its stdin; ignore
      }
    }
  });

  ws.on("close", () => {
    try {
      child.kill();
    } catch {
      // already gone
    }
  });

  send(`Connected to ${cmd} (${os.hostname()}). Working dir: ${os.homedir()}\r\n`);
}

/** Attaches the terminal WebSocket endpoint at /api/terminal to an HTTP server. */
export function attachTerminal(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/api/terminal" });
  wss.on("connection", (ws) => startSession(ws));
}
