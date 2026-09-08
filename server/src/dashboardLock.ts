import { authDb } from "./db.js";

/** No mouse/keyboard activity for this long frees the layout so another admin can edit. */
export const LAYOUT_EDIT_IDLE_MS = 3 * 60 * 1000;

export class DashboardLockError extends Error {
  constructor(
    public status: number,
    message: string,
    public lock: LayoutLockInfo
  ) {
    super(message);
  }
}

export interface LayoutLockInfo {
  editing: boolean;
  mine: boolean;
  username: string | null;
  acquiredAt: number | null;
  lastActionAt: number | null;
  idleMs: number;
  expiresInMs: number | null;
}

interface LockRow {
  id: number;
  user_id: number;
  username: string;
  session_hash: string | null;
  acquired_at: number;
  last_action: number;
}

function readRow(): LockRow | undefined {
  return authDb()
    .prepare("SELECT * FROM dashboard_edit_lock WHERE id = 1")
    .get() as LockRow | undefined;
}

function isFresh(row: LockRow, now = Date.now()): boolean {
  return now - row.last_action < LAYOUT_EDIT_IDLE_MS;
}

function pruneExpired(now = Date.now()): LockRow | undefined {
  const row = readRow();
  if (!row) return undefined;
  if (isFresh(row, now)) return row;
  authDb().prepare("DELETE FROM dashboard_edit_lock WHERE id = 1").run();
  return undefined;
}

function toInfo(row: LockRow | undefined, userId?: number, now = Date.now()): LayoutLockInfo {
  if (!row) {
    return {
      editing: false,
      mine: false,
      username: null,
      acquiredAt: null,
      lastActionAt: null,
      idleMs: LAYOUT_EDIT_IDLE_MS,
      expiresInMs: null,
    };
  }
  const remaining = Math.max(0, row.last_action + LAYOUT_EDIT_IDLE_MS - now);
  return {
    editing: true,
    mine: userId != null && row.user_id === userId,
    username: row.username,
    acquiredAt: row.acquired_at,
    lastActionAt: row.last_action,
    idleMs: LAYOUT_EDIT_IDLE_MS,
    expiresInMs: remaining,
  };
}

export function layoutLockStatus(userId?: number): LayoutLockInfo {
  return toInfo(pruneExpired(), userId);
}

/** Who currently holds a fresh layout lock, if anyone. */
export function layoutLockHolder(): { userId: number; sessionHash: string | null } | null {
  const row = pruneExpired();
  if (!row) return null;
  return { userId: row.user_id, sessionHash: row.session_hash };
}

export function acquireLayoutLock(
  user: { id: number; username: string },
  sessionHash: string | null
): LayoutLockInfo {
  const now = Date.now();
  const row = pruneExpired(now);
  if (row && row.user_id !== user.id) {
    const lock = toInfo(row, user.id, now);
    throw new DashboardLockError(
      409,
      `${row.username} is customizing the layout. Try again in a few minutes, or ask them to Save or Cancel.`,
      lock
    );
  }
  authDb()
    .prepare(
      `INSERT INTO dashboard_edit_lock (id, user_id, username, session_hash, acquired_at, last_action)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         username = excluded.username,
         session_hash = excluded.session_hash,
         acquired_at = CASE
           WHEN dashboard_edit_lock.user_id = excluded.user_id THEN dashboard_edit_lock.acquired_at
           ELSE excluded.acquired_at
         END,
         last_action = excluded.last_action`
    )
    .run(user.id, user.username, sessionHash, now, now);
  return toInfo(readRow(), user.id, now);
}

export function heartbeatLayoutLock(userId: number, active: boolean): LayoutLockInfo {
  const now = Date.now();
  const row = pruneExpired(now);
  if (!row || row.user_id !== userId) {
    throw new DashboardLockError(
      409,
      row
        ? `${row.username} is customizing the layout.`
        : "Layout edit session expired.",
      toInfo(row, userId, now)
    );
  }
  if (active) {
    authDb()
      .prepare("UPDATE dashboard_edit_lock SET last_action = ? WHERE id = 1 AND user_id = ?")
      .run(now, userId);
  }
  return toInfo(readRow(), userId, Date.now());
}

export function holdsLayoutLock(userId: number): boolean {
  const row = pruneExpired();
  return Boolean(row && row.user_id === userId);
}

export function touchLayoutLock(userId: number): void {
  if (!holdsLayoutLock(userId)) return;
  authDb()
    .prepare("UPDATE dashboard_edit_lock SET last_action = ? WHERE id = 1 AND user_id = ?")
    .run(Date.now(), userId);
}

export function releaseLayoutLock(userId: number): LayoutLockInfo {
  authDb()
    .prepare("DELETE FROM dashboard_edit_lock WHERE id = 1 AND user_id = ?")
    .run(userId);
  return layoutLockStatus(userId);
}

export function layoutsDiffer(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a ?? {}) !== JSON.stringify(b ?? {});
  } catch {
    return true;
  }
}
