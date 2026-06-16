import { Router, type Request } from "express";
import {
  AuthError,
  authenticate,
  clearSessionCookie,
  clientIp,
  createSession,
  createUser,
  currentUser,
  destroySession,
  needsSetup,
  parseCookies,
  recordAudit,
  sessionCookie,
  SESSION_COOKIE,
} from "../auth.js";

export const authRouter = Router();

/** Whether the connection is HTTPS (directly or via a trusting proxy). */
function isSecure(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function sessionMeta(req: Request) {
  const ua = req.headers["user-agent"];
  return { ip: clientIp(req), userAgent: typeof ua === "string" ? ua : undefined };
}

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("auth error:", err);
    res.status(500).json({ error: "authentication failed" });
  }
}

// Public: tells the client whether to show first-run setup, the login screen,
// or the dashboard (when a valid session is already present).
authRouter.get("/status", (req, res) => {
  const user = currentUser(req);
  res.json({ needsSetup: needsSetup(), user });
});

// Public, but only usable while no users exist. Creates the first admin and
// logs them straight in.
authRouter.post("/setup", (req, res) => {
  try {
    if (!needsSetup()) {
      res.status(409).json({ error: "setup already completed" });
      return;
    }
    const { username, password } = req.body ?? {};
    const user = createUser(String(username ?? ""), String(password ?? ""), "admin");
    const { token, expiresAt } = createSession(user.id, sessionMeta(req));
    res.setHeader("Set-Cookie", sessionCookie(token, expiresAt, isSecure(req)));
    recordAudit({
      userId: user.id,
      username: user.username,
      action: "auth.setup",
      detail: "created first admin account",
      status: 200,
      ip: clientIp(req),
    });
    res.json({ user });
  } catch (err) {
    sendError(res, err);
  }
});

authRouter.post("/login", (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    const attempted = String(username ?? "");
    const user = authenticate(attempted, String(password ?? ""));
    if (!user) {
      recordAudit({
        username: attempted || null,
        action: "auth.login_failed",
        detail: "invalid username or password",
        status: 401,
        ip: clientIp(req),
      });
      res.status(401).json({ error: "invalid username or password" });
      return;
    }
    const { token, expiresAt } = createSession(user.id, sessionMeta(req));
    res.setHeader("Set-Cookie", sessionCookie(token, expiresAt, isSecure(req)));
    recordAudit({
      userId: user.id,
      username: user.username,
      action: "auth.login",
      status: 200,
      ip: clientIp(req),
    });
    res.json({ user });
  } catch (err) {
    sendError(res, err);
  }
});

authRouter.post("/logout", (req, res) => {
  const user = currentUser(req);
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  destroySession(token);
  res.setHeader("Set-Cookie", clearSessionCookie(isSecure(req)));
  if (user) {
    recordAudit({
      userId: user.id,
      username: user.username,
      action: "auth.logout",
      status: 200,
      ip: clientIp(req),
    });
  }
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return;
  }
  res.json({ user });
});
