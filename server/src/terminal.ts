import { WebSocketServer, type WebSocket } from "ws";
import { spawn } from "node:child_process";
import os from "node:os";
import type { Server, IncomingMessage } from "node:http";
import {
  parseCookies,
  userForToken,
  recordAudit,
  SESSION_COOKIE,
  type User,
} from "./auth.js";

// We stream a piped child shell (not a real PTY) over a WebSocket. The browser
// handles line editing and local echo, then sends whole lines to the shell's
// stdin; the shell's stdout/stderr is streamed back. This keeps things
// dependency-light and cross-platform, at the cost of full-screen TUI support
// (vim, htop, etc.), which would need a real PTY (node-pty) or SSH later.

interface ClientMessage {
  type: "input";
  data: string;
}

interface SessionContext {
  user: User;
  ip: string;
}

function shellCommand(): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    return { cmd: "powershell.exe", args: ["-NoLogo"] };
  }
  return { cmd: process.env.SHELL || "/bin/bash", args: [] };
}

// Matches CSI escape sequences (arrow keys, history navigation, etc.) so they
// don't pollute the reconstructed command line.
const ANSI_CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Reconstructs typed command lines from the raw keystroke stream so each command
 * a user runs can be audited. This is a best-effort approximation (the shell,
 * not us, does the real line editing) but handles the common cases: printable
 * input, backspace, Ctrl+C/Ctrl+U clears, and Enter to commit.
 */
class CommandTracker {
  private buf = "";

  /** Feeds raw input; invokes `onCommand` for each completed line. */
  feed(data: string, onCommand: (cmd: string) => void): void {
    const cleaned = data.replace(ANSI_CSI, "").replace(/\x1b/g, "");
    for (const ch of cleaned) {
      if (ch === "\r" || ch === "\n") {
        const cmd = this.buf.trim();
        this.buf = "";
        if (cmd) onCommand(cmd.length > 1000 ? `${cmd.slice(0, 1000)}…` : cmd);
      } else if (ch === "\x7f" || ch === "\b") {
        this.buf = this.buf.slice(0, -1);
      } else if (ch === "\x03" || ch === "\x15") {
        // Ctrl+C / Ctrl+U: abandon the current line.
        this.buf = "";
      } else if (ch >= " ") {
        this.buf += ch;
      }
    }
  }
}

function startSession(ws: WebSocket, ctx: SessionContext): void {
  const { cmd, args } = shellCommand();
  const send = (s: string) => {
    if (ws.readyState === ws.OPEN) ws.send(s);
  };
  const tracker = new CommandTracker();

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
      tracker.feed(msg.data, (command) => {
        recordAudit({
          userId: ctx.user.id,
          username: ctx.user.username,
          action: "terminal.command",
          detail: command,
          ip: ctx.ip,
        });
      });
      try {
        child.stdin.write(msg.data);
      } catch {
        // shell closed its stdin; ignore
      }
    }
  });

  ws.on("close", () => {
    recordAudit({
      userId: ctx.user.id,
      username: ctx.user.username,
      action: "terminal.disconnect",
      detail: "closed the terminal session",
      ip: ctx.ip,
    });
    try {
      child.kill();
    } catch {
      // already gone
    }
  });

  send(`Connected to ${cmd} (${os.hostname()}). Working dir: ${os.homedir()}\r\n`);
}

/** Validates the session cookie on an upgrade request; returns the user or null. */
function authenticateUpgrade(req: IncomingMessage): User | null {
  const cookies = parseCookies(req.headers.cookie);
  return userForToken(cookies[SESSION_COOKIE]);
}

/**
 * Attaches the terminal WebSocket endpoint at /api/terminal to an HTTP server.
 *
 * The terminal grants full shell access, so we authenticate the session cookie
 * during the HTTP upgrade handshake and require at least the `user` role before
 * the socket is ever established. Unauthorized upgrades are rejected outright.
 */
export function attachTerminal(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    // Only handle our terminal path; leave other upgrades (if any) untouched.
    const url = req.url ?? "";
    const pathname = url.split("?")[0];
    if (pathname !== "/api/terminal") return;

    const user = authenticateUpgrade(req);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    if (user.role !== "user" && user.role !== "admin") {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const fwd = req.headers["x-forwarded-for"];
    const ip =
      (typeof fwd === "string" && fwd.split(",")[0].trim()) ||
      req.socket.remoteAddress ||
      "";
    recordAudit({
      userId: user.id,
      username: user.username,
      action: "terminal.connect",
      detail: "opened a terminal session",
      status: 101,
      ip,
    });

    wss.handleUpgrade(req, socket, head, (ws) => {
      startSession(ws, { user, ip });
    });
  });
}
