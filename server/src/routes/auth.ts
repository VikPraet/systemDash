import { Router, type Request } from "express";
import {
  AuthError,
  authenticate,
  allowRecoveryAttempt,
  clearSessionCookie,
  clientIp,
  createSession,
  createUser,
  currentUser,
  destroySession,
  needsSetup,
  parseCookies,
  recordAudit,
  recoverPassword,
  recoverUsername,
  RECOVERY_FAIL_MESSAGE,
  recordRecoveryFailure,
  requireAuth,
  sessionCookie,
  SESSION_COOKIE,
  setUserRecovery,
} from "../auth.js";
import { releaseLayoutLock } from "../dashboardLock.js";

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
    const { username, password, recoveryQuestion, recoveryAnswer } = req.body ?? {};
    const user = createUser(String(username ?? ""), String(password ?? ""), "admin", {
      question: String(recoveryQuestion ?? ""),
      answer: String(recoveryAnswer ?? ""),
    });
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
  if (user) releaseLayoutLock(user.id);
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

authRouter.post("/recover/username", (req, res) => {
  const ip = clientIp(req);
  if (!allowRecoveryAttempt(ip)) {
    res.status(429).json({ error: "too many attempts, try again later" });
    return;
  }
  const { question, answer } = req.body ?? {};
  const username = recoverUsername(String(question ?? ""), String(answer ?? ""));
  if (!username) {
    recordRecoveryFailure(ip);
    recordAudit({
      action: "auth.recover_username_failed",
      detail: "recovery details did not match",
      status: 401,
      ip,
    });
    res.status(401).json({ error: RECOVERY_FAIL_MESSAGE });
    return;
  }
  recordAudit({
    username,
    action: "auth.recover_username",
    status: 200,
    ip,
  });
  res.json({ username });
});

authRouter.post("/recover/password", (req, res) => {
  const ip = clientIp(req);
  if (!allowRecoveryAttempt(ip)) {
    res.status(429).json({ error: "too many attempts, try again later" });
    return;
  }
  try {
    const { username, answer, password } = req.body ?? {};
    const attempted = String(username ?? "");
    const ok = recoverPassword(attempted, String(answer ?? ""), String(password ?? ""));
    if (!ok) {
      recordRecoveryFailure(ip);
      recordAudit({
        username: attempted || null,
        action: "auth.recover_password_failed",
        detail: "recovery details did not match",
        status: 401,
        ip,
      });
      res.status(401).json({ error: RECOVERY_FAIL_MESSAGE });
      return;
    }
    recordAudit({
      username: attempted,
      action: "auth.recover_password",
      detail: "password reset via recovery question",
      status: 200,
      ip,
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

authRouter.patch("/recovery", requireAuth, (req, res) => {
  try {
    const { question, answer } = req.body ?? {};
    const user = setUserRecovery(req.user!.id, {
      question: String(question ?? ""),
      answer: String(answer ?? ""),
    });
    recordAudit({
      userId: user.id,
      username: user.username,
      action: "auth.recovery_set",
      status: 200,
      ip: clientIp(req),
    });
    res.json({ user });
  } catch (err) {
    sendError(res, err);
  }
});
