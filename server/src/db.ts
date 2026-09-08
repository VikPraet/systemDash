import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "./paths.js";

// Auth data (users + sessions) lives in its own SQLite file alongside the
// history/settings, using the same data-dir convention so everything is
// writable regardless of where the server was launched from. We rely on Node's
// built-in `node:sqlite` (already used by history.ts) to avoid any native
// dependency.
const DB_FILE = path.join(DATA_DIR, "auth.db");

let db: DatabaseSync | null = null;

/** Opens (and lazily initialises) the auth database. */
export function authDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = new DatabaseSync(DB_FILE);
  fresh.exec("PRAGMA journal_mode = WAL;");
  fresh.exec("PRAGMA synchronous = NORMAL;");
  fresh.exec("PRAGMA foreign_keys = ON;");
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL,
      recovery_question    TEXT,
      recovery_answer_hash TEXT
    );
  `);
  // Migrate older user tables that predate self-serve recovery.
  for (const col of ["recovery_question TEXT", "recovery_answer_hash TEXT"]) {
    try {
      fresh.exec(`ALTER TABLE users ADD COLUMN ${col};`);
    } catch {
      // Column already exists; ignore.
    }
  }
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen  INTEGER NOT NULL DEFAULT 0,
      ip         TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  // Migrate older session tables that predate the activity columns.
  for (const col of [
    "last_seen INTEGER NOT NULL DEFAULT 0",
    "ip TEXT",
    "user_agent TEXT",
  ]) {
    try {
      fresh.exec(`ALTER TABLE sessions ADD COLUMN ${col};`);
    } catch {
      // Column already exists; ignore.
    }
  }
  // Audit log: an append-only record of who did what and when, mirroring how the
  // history tab keeps time-series metrics. `username` is denormalised so entries
  // remain readable after a user is deleted.
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       INTEGER NOT NULL,
      user_id  INTEGER,
      username TEXT,
      action   TEXT NOT NULL,
      detail   TEXT,
      status   INTEGER,
      ip       TEXT
    );
  `);
  fresh.exec("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts DESC);");
  // Geo cache: maps an IP to its resolved location so we only hit the external
  // geolocation service once per address. Local/private IPs are stored too (with
  // status 'local') so they never trigger a lookup.
  fresh.exec(`
    CREATE TABLE IF NOT EXISTS geo_cache (
      ip           TEXT PRIMARY KEY,
      status       TEXT NOT NULL,
      label        TEXT,
      city         TEXT,
      region       TEXT,
      country      TEXT,
      country_code TEXT,
      lat          REAL,
      lon          REAL,
      resolved_at  INTEGER NOT NULL
    );
  `);
  db = fresh;
  return db;
}

/** Flushes the WAL so a file copy of auth.db is consistent. */
export function checkpointAuthDb(): void {
  if (!db && !fs.existsSync(DB_FILE)) return;
  try {
    authDb().exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch {
    // Best-effort; the copy still includes -wal/-shm when present.
  }
}

/** Closes the auth database so files can be replaced (restore). */
export function closeAuthDb(): void {
  if (!db) return;
  try {
    db.close();
  } catch {
    // Ignore close errors so restore can still swap files.
  }
  db = null;
}
