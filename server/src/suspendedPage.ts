import http from "node:http";
import type { ProjectSummary } from "./projects.js";

const pages = new Map<number, http.Server>();
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function suspendedPage(name: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Service suspended</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#090e17;color:#edf2fa;font:16px/1.6 system-ui,sans-serif}main{width:100%;max-width:540px;padding:40px;border:1px solid #29364a;border-radius:20px;background:#111b2b}small{color:#a6b9d3;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(28px,5vw,38px);line-height:1.2;margin:18px 0}p{color:#b7c6da;overflow-wrap:anywhere}a{display:inline-block;margin-top:12px;padding:10px 18px;border:1px solid #536989;border-radius:8px;color:#edf2fa;text-decoration:none}a:focus-visible{outline:3px solid #86b7ff;outline-offset:4px}
  </style></head><body><main><small>Temporarily unavailable</small><h1>Service suspended</h1><p>${escapeHtml(name)} has been paused by its administrator. Please try again later.</p><a href="">Try again</a></main></body></html>`;
}

export async function stopSuspendedPage(id: number): Promise<void> {
  const server = pages.get(id);
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
    server.closeAllConnections();
  });
  pages.delete(id);
}

export async function startSuspendedPage(project: Pick<ProjectSummary, "id" | "name" | "port" | "serviceKind">): Promise<void> {
  if (project.serviceKind !== "website" || !project.port) return;
  if (pages.has(project.id)) return;
  const body = suspendedPage(project.name);
  const server = http.createServer((_req, res) => {
    res.writeHead(503, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "Connection": "close",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  // A native process may take a moment to release its listener after SIGTERM.
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => { server.off("listening", onListen); reject(err); };
        const onListen = () => { server.off("error", onError); resolve(); };
        server.once("error", onError);
        server.once("listening", onListen);
        server.listen(project.port!);
      });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt >= 19) throw err;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  server.on("error", err => console.error("Suspended project page:", err));
  server.unref();
  pages.set(project.id, server);
}
