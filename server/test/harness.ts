import http, { type AddressInfo } from "node:http";
import { createApp, attachRealtime } from "../src/index.js";
import {
  createSession,
  createUser,
  listUsers,
  SESSION_COOKIE,
  type Role,
  type User,
} from "../src/auth.js";

function getOrCreate(
  username: string,
  role: Role,
  recovery?: { question: string; answer: string }
): User {
  const existing = listUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (existing) return existing;
  return createUser(username, "password1", role, recovery);
}

export function ensureUsers(): { admin: User; user: User; viewer: User } {
  const admin = getOrCreate("sdadmin", "admin", { question: "pet", answer: "fluffy" });
  const user = getOrCreate("sduser", "user");
  const viewer = getOrCreate("sdviewer", "viewer");
  return { admin, user, viewer };
}

export async function listenServer(): Promise<{
  server: http.Server;
  origin: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(createApp());
  attachRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    server,
    origin: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function cookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

export function sessionFor(userId: number): string {
  return createSession(userId).token;
}

export async function jsonRequest(
  origin: string,
  path: string,
  opts: {
    method?: string;
    cookie?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; json: unknown; headers: http.IncomingHttpHeaders }> {
  const url = new URL(path, origin);
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: opts.method ?? "GET",
        headers: {
          ...(body
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
            : {}),
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = text;
          }
          resolve({ status: res.statusCode ?? 0, json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export function upgradeStatus(origin: string, path: string, cookie?: string): Promise<number> {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
        headers: {
          connection: "Upgrade",
          upgrade: "websocket",
          "sec-websocket-version": "13",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        resolve(res.statusCode ?? 0);
        res.resume();
      }
    );
    req.on("upgrade", (_res, socket) => {
      socket.destroy();
      resolve(101);
    });
    req.on("error", reject);
    req.end();
  });
}
