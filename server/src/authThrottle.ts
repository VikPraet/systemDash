const DELAY_AFTER = () => Number(process.env.SYSTEMDASH_AUTH_DELAY_AFTER ?? 5);
const LOCKOUT_AFTER = () => Number(process.env.SYSTEMDASH_AUTH_LOCKOUT_AFTER ?? 10);
const WINDOW_MS = () => Number(process.env.SYSTEMDASH_AUTH_WINDOW_MS ?? 15 * 60 * 1000);
const DELAY_MS = () => Number(process.env.SYSTEMDASH_AUTH_DELAY_MS ?? 250);
const MAX_KEYS = 10_000;
const KEY_MAX = 80;

interface Bucket {
  count: number;
  resetAt: number;
  touched: number;
}

const buckets = new Map<string, Bucket>();

function clipKey(raw: string): string {
  const k = raw.trim().toLowerCase().slice(0, KEY_MAX);
  return k || "unknown";
}

function prune(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
  if (buckets.size <= MAX_KEYS) return;
  const ordered = [...buckets.entries()].sort((a, b) => a[1].touched - b[1].touched);
  const drop = buckets.size - MAX_KEYS + Math.ceil(MAX_KEYS * 0.1);
  for (let i = 0; i < drop; i++) buckets.delete(ordered[i][0]);
}

function bucket(key: string, now: number): Bucket {
  prune(now);
  const k = clipKey(key);
  const cur = buckets.get(k);
  if (!cur || cur.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS(), touched: now };
    buckets.set(k, fresh);
    return fresh;
  }
  cur.touched = now;
  return cur;
}

function maxCount(keys: string[], now: number): number {
  let max = 0;
  for (const key of keys) {
    max = Math.max(max, bucket(key, now).count);
  }
  return max;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const AUTH_LOCKED_MESSAGE = "too many attempts, try again later";

/** Delay or reject before a login/recovery attempt. */
export async function gateAuthAttempt(keys: string[]): Promise<"ok" | "locked"> {
  const now = Date.now();
  const n = maxCount(keys, now);
  const lockAfter = Math.max(1, LOCKOUT_AFTER());
  if (n >= lockAfter) return "locked";
  const delayAfter = Math.max(0, DELAY_AFTER());
  if (n >= delayAfter && DELAY_MS() > 0) {
    const exp = Math.min(4, Math.max(0, n - delayAfter));
    const wait = Math.min(4_000, DELAY_MS() * 2 ** exp);
    if (wait > 0) await sleep(wait);
  }
  return "ok";
}

export function recordAuthFailure(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    const b = bucket(key, now);
    b.count += 1;
  }
}

export function clearAuthFailures(keys: string[]): void {
  for (const key of keys) buckets.delete(clipKey(key));
}

export function loginKeys(ip: string, username: string): string[] {
  const keys = [`login:ip:${ip || "unknown"}`];
  const u = username.trim().toLowerCase();
  if (u) keys.push(`login:user:${u}`);
  return keys;
}

export function recoveryPasswordKeys(ip: string, username: string): string[] {
  const keys = [`rec:ip:${ip || "unknown"}`];
  const u = username.trim().toLowerCase();
  if (u) keys.push(`rec:user:${u}`);
  return keys;
}

export function recoveryUsernameKeys(ip: string, question: string): string[] {
  return [`rec:ip:${ip || "unknown"}`, `rec:q:${question.trim().toLowerCase() || "none"}`];
}

/** Test helper. */
export function resetAuthThrottle(): void {
  buckets.clear();
}

export function authThrottleSize(): number {
  return buckets.size;
}
