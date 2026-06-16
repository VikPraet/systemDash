import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { authDb } from "./db.js";

// Roles are an ordered hierarchy: each role implies the ones below it. We compare
// by rank so `requireRole("user")` also admits admins.
export const ROLES = ["viewer", "user", "admin"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = { viewer: 0, user: 1, admin: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export interface User {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  createdAt: number;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  active: number;
  created_at: number;
}

/** Maps a DB row to the public User shape (never exposing the password hash). */
function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: isRole(row.role) ? row.role : "viewer",
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Passwords: scrypt with a per-user random salt. Stored as `scrypt$salt$hash`
// (both hex). We compare with a constant-time check to avoid timing leaks.
// ---------------------------------------------------------------------------
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  let derived: Buffer;
  try {
    derived = crypto.scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  return (
    derived.length === expected.length &&
    crypto.timingSafeEqual(derived, expected)
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** True when no users exist yet, i.e. the first-run setup should be shown. */
export function needsSetup(): boolean {
  const row = authDb()
    .prepare("SELECT COUNT(*) AS c FROM users")
    .get() as { c: number };
  return (row?.c ?? 0) === 0;
}

export function listUsers(): User[] {
  const rows = authDb()
    .prepare("SELECT * FROM users ORDER BY id ASC")
    .all() as unknown as UserRow[];
  return rows.map(toUser);
}

export function getUserById(id: number): User | null {
  const row = authDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

function validateUsername(username: string): string {
  const u = username.trim();
  if (!USERNAME_RE.test(u)) {
    throw new AuthError(
      400,
      "username must be 3-32 chars: letters, numbers, dot, dash, underscore"
    );
  }
  return u;
}

function validatePassword(password: string): void {
  if (typeof password !== "string" || password.length < 8) {
    throw new AuthError(400, "password must be at least 8 characters");
  }
}

/** Creates a user. Throws AuthError(409) if the username is taken. */
export function createUser(
  username: string,
  password: string,
  role: Role
): User {
  const u = validateUsername(username);
  validatePassword(password);
  if (!isRole(role)) throw new AuthError(400, "invalid role");
  const exists = authDb()
    .prepare("SELECT 1 FROM users WHERE username = ?")
    .get(u);
  if (exists) throw new AuthError(409, "username already exists");
  const info = authDb()
    .prepare(
      `INSERT INTO users (username, password_hash, role, active, created_at)
       VALUES (?, ?, ?, 1, ?)`
    )
    .run(u, hashPassword(password), role, Date.now());
  return getUserById(Number(info.lastInsertRowid))!;
}

export function setUserRole(id: number, role: Role): User {
  if (!isRole(role)) throw new AuthError(400, "invalid role");
  authDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  const user = getUserById(id);
  if (!user) throw new AuthError(404, "user not found");
  return user;
}

export function setUserActive(id: number, active: boolean): User {
  authDb()
    .prepare("UPDATE users SET active = ? WHERE id = ?")
    .run(active ? 1 : 0, id);
  const user = getUserById(id);
  if (!user) throw new AuthError(404, "user not found");
  if (!active) deleteUserSessions(id); // kick out a disabled user immediately
  return user;
}

export function setUserPassword(id: number, password: string): void {
  validatePassword(password);
  const info = authDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(hashPassword(password), id);
  if (info.changes === 0) throw new AuthError(404, "user not found");
  deleteUserSessions(id); // force re-login with the new password
}

export function deleteUser(id: number): void {
  const info = authDb().prepare("DELETE FROM users WHERE id = ?").run(id);
  if (info.changes === 0) throw new AuthError(404, "user not found");
}

export function countAdmins(): number {
  const row = authDb()
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1")
    .get() as { c: number };
  return row?.c ?? 0;
}

/** Verifies credentials and returns the user, or null if invalid/disabled. */
export function authenticate(username: string, password: string): User | null {
  const row = authDb()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username.trim()) as UserRow | undefined;
  if (!row || row.active !== 1) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return toUser(row);
}

// ---------------------------------------------------------------------------
// Sessions: an opaque random token is sent to the client; we only store its
// SHA-256 hash, so a leaked DB can't be used to forge live sessions.
// ---------------------------------------------------------------------------
export const SESSION_COOKIE = "sd_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface NewSession {
  token: string;
  expiresAt: number;
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export function createSession(userId: number, meta: SessionMeta = {}): NewSession {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  authDb()
    .prepare(
      `INSERT INTO sessions
         (token_hash, user_id, created_at, expires_at, last_seen, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      hashToken(token),
      userId,
      now,
      expiresAt,
      now,
      meta.ip ?? null,
      meta.userAgent ?? null
    );
  return { token, expiresAt };
}

/** Looks up the user for a session token, sliding its expiry. Prunes if stale. */
export function userForToken(token: string | undefined): User | null {
  if (!token) return null;
  const db = authDb();
  const row = db
    .prepare(
      `SELECT s.expires_at AS expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(hashToken(token)) as (UserRow & { expires_at: number }) | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now() || row.active !== 1) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    return null;
  }
  // Sliding expiry: extend on use so active users stay logged in, and record
  // last activity so the sessions widget can show "last seen".
  const now = Date.now();
  db.prepare(
    "UPDATE sessions SET expires_at = ?, last_seen = ? WHERE token_hash = ?"
  ).run(now + SESSION_TTL_MS, now, hashToken(token));
  return toUser(row);
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  authDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

function deleteUserSessions(userId: number): void {
  authDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** Removes expired sessions. Safe to call periodically. */
export function pruneSessions(): void {
  authDb().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

export interface SessionInfo {
  id: string; // token hash; opaque handle used to revoke
  userId: number;
  username: string;
  role: Role;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  current: boolean; // true for the caller's own session
}

/** The opaque session id (token hash) for the caller's cookie, if logged in. */
export function currentSessionId(req: Request): string | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return token ? hashToken(token) : null;
}

/** Lists currently active (non-expired) sessions with their owning user. */
export function listSessions(currentId?: string | null): SessionInfo[] {
  const rows = authDb()
    .prepare(
      `SELECT s.token_hash, s.user_id, s.created_at, s.last_seen, s.expires_at,
              s.ip, s.user_agent, u.username, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > ?
       ORDER BY s.last_seen DESC`
    )
    .all(Date.now()) as unknown as Array<{
    token_hash: string;
    user_id: number;
    created_at: number;
    last_seen: number;
    expires_at: number;
    ip: string | null;
    user_agent: string | null;
    username: string;
    role: string;
  }>;
  return rows.map((r) => ({
    id: r.token_hash,
    userId: r.user_id,
    username: r.username,
    role: isRole(r.role) ? r.role : "viewer",
    createdAt: r.created_at,
    lastSeen: r.last_seen,
    expiresAt: r.expires_at,
    ip: r.ip,
    userAgent: r.user_agent,
    current: !!currentId && r.token_hash === currentId,
  }));
}

/** Revokes a single session by its opaque id (the stored token hash). */
export function revokeSession(id: string): void {
  const info = authDb()
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .run(id);
  if (info.changes === 0) throw new AuthError(404, "session not found");
}

// ---------------------------------------------------------------------------
// Audit log: an append-only record of notable actions, like the history tab but
// for user activity. Writes never throw so logging can't break a request.
// ---------------------------------------------------------------------------
export interface AuditEntryInput {
  userId?: number | null;
  username?: string | null;
  action: string;
  detail?: string | null;
  status?: number | null;
  ip?: string | null;
}

export interface AuditEntry {
  id: number;
  ts: number;
  userId: number | null;
  username: string | null;
  action: string;
  detail: string | null;
  status: number | null;
  ip: string | null;
}

export function recordAudit(entry: AuditEntryInput): void {
  try {
    authDb()
      .prepare(
        `INSERT INTO audit_log (ts, user_id, username, action, detail, status, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Date.now(),
        entry.userId ?? null,
        entry.username ?? null,
        entry.action,
        entry.detail ?? null,
        entry.status ?? null,
        entry.ip ?? null
      );
  } catch (err) {
    console.error("failed to record audit entry:", err);
  }
}

/** Returns the most recent audit entries (newest first), capped by `limit`. */
export function listAudit(limit = 200): AuditEntry[] {
  const lim = Math.max(1, Math.min(2000, Math.round(limit)));
  const rows = authDb()
    .prepare("SELECT * FROM audit_log ORDER BY ts DESC, id DESC LIMIT ?")
    .all(lim) as unknown as Array<{
    id: number;
    ts: number;
    user_id: number | null;
    username: string | null;
    action: string;
    detail: string | null;
    status: number | null;
    ip: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    userId: r.user_id,
    username: r.username,
    action: r.action,
    detail: r.detail,
    status: r.status,
    ip: r.ip,
  }));
}

/** Keeps the audit log bounded to the newest `maxRows` entries. */
export function pruneAudit(maxRows = 5000): void {
  try {
    authDb()
      .prepare(
        `DELETE FROM audit_log
         WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT ?)`
      )
      .run(maxRows);
  } catch (err) {
    console.error("failed to prune audit log:", err);
  }
}

/** Extracts a best-effort client IP from an Express-like request. */
export function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.ip ?? "";
}

// ---------------------------------------------------------------------------
// Cookies + Express middleware
// ---------------------------------------------------------------------------

/** Minimal Cookie header parser (avoids a cookie-parser dependency). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function sessionCookie(token: string, expiresAt: number, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Resolves the current user from the session cookie, if any. */
export function currentUser(req: Request): User | null {
  const cookies = parseCookies(req.headers.cookie);
  return userForToken(cookies[SESSION_COOKIE]);
}

/** Rejects the request with 401 unless a valid session is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return;
  }
  req.user = user;
  next();
}

/** Requires the user to have at least `min` role rank. Use after requireAuth. */
export function requireRole(min: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user ?? currentUser(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    req.user = user;
    if (ROLE_RANK[user.role] < ROLE_RANK[min]) {
      res.status(403).json({ error: "insufficient permissions" });
      return;
    }
    next();
  };
}
