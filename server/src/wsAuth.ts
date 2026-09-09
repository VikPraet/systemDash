import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import {
  hashToken,
  isOperatorRole,
  parseCookies,
  SESSION_COOKIE,
  userForToken,
  type User,
} from "./auth.js";
import { registerLiveSocket } from "./wsLive.js";

const RECHECK_MS = 20_000;

export function socketSessionToken(req: IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

export function authenticateSocket(req: IncomingMessage): User | null {
  return userForToken(socketSessionToken(req));
}

export function requireOperator(user: User | null): user is User {
  return !!user && isOperatorRole(user.role);
}

export function watchAuthorizedSocket(opts: {
  token: string;
  userId: number;
  ws: WebSocket;
  onRevoked: () => void;
}): { ensureAuthorized: () => boolean; stop: () => void } {
  let last = 0;
  let stopped = false;
  const hash = hashToken(opts.token);

  const fail = (): boolean => {
    if (stopped) return false;
    stopped = true;
    stop();
    try {
      opts.onRevoked();
    } catch {
      // ignore
    }
    if (opts.ws.readyState === opts.ws.OPEN || opts.ws.readyState === opts.ws.CONNECTING) {
      try {
        opts.ws.close();
      } catch {
        // ignore
      }
    }
    return false;
  };

  const check = (): boolean => {
    if (stopped) return false;
    const user = userForToken(opts.token);
    last = Date.now();
    if (!user || user.id !== opts.userId || !isOperatorRole(user.role)) return fail();
    return true;
  };

  const unreg = registerLiveSocket(hash, opts.userId, () => {
    fail();
  });

  const timer = setInterval(() => {
    check();
  }, RECHECK_MS);
  timer.unref?.();

  function stop(): void {
    stopped = true;
    clearInterval(timer);
    unreg();
  }

  opts.ws.on("close", () => stop());

  return {
    ensureAuthorized: () => {
      if (stopped) return false;
      if (Date.now() - last < RECHECK_MS) return true;
      return check();
    },
    stop,
  };
}
