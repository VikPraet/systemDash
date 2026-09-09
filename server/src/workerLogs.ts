import { spawn } from "node:child_process";
import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { parseCookies, userForToken, SESSION_COOKIE } from "./auth.js";
import { getProject } from "./projects.js";
import { listLabeledContainers, spawnDockerLogs } from "./docker.js";
import { subscribeWorkerLogs, workerLogTail } from "./workers.js";

function authenticate(req: import("node:http").IncomingMessage) {
  const cookies = parseCookies(req.headers.cookie);
  return userForToken(cookies[SESSION_COOKIE]);
}

function pipeChild(ws: WebSocket, child: ReturnType<typeof spawn>): void {
  const send = (s: string) => {
    if (ws.readyState === ws.OPEN) ws.send(s);
  };
  child.stdout?.on("data", (b: Buffer) => send(b.toString()));
  child.stderr?.on("data", (b: Buffer) => send(b.toString()));
  child.on("error", (err) => send(`${err.message}\n`));
  ws.on("close", () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // gone
    }
  });
}

export function attachWorkerLogs(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0];
    const match = /^\/api\/projects\/(\d+)\/logs$/.exec(pathname);
    if (!match) return;
    const user = authenticate(req);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const id = Number(match[1]);
    const project = getProject(id);
    if (!project) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const send = (s: string) => {
        if (ws.readyState === ws.OPEN) ws.send(s);
      };
      send(workerLogTail(id));
      const unsub = subscribeWorkerLogs(id, send);
      if (project.runKind === "docker") {
        void (async () => {
          try {
            if (project.managed) {
              const labeled = await listLabeledContainers(id);
              for (const c of labeled) pipeChild(ws, spawnDockerLogs(c.id, 200));
            } else if (project.container) {
              pipeChild(ws, spawnDockerLogs(project.container, 200));
            }
          } catch (err) {
            send(`${err instanceof Error ? err.message : String(err)}\n`);
          }
        })();
      }
      if (project.runKind === "systemd" && project.unit && process.platform === "linux") {
        const child = spawn("journalctl", ["-fu", project.unit, "-n", "200"], { windowsHide: true });
        pipeChild(ws, child);
      }
      ws.on("close", () => unsub());
    });
  });
}