import { Router } from "express";
import {
  AuthError,
  clientIp,
  currentSessionId,
  listAudit,
  listSessions,
  recordAudit,
  requireRole,
  revokeSession,
} from "../auth.js";
import { resolveLocations, normalizeForLookup, type GeoLocation } from "../geo.js";

// Attaches a resolved `location` to each row that carries an `ip`, looking up
// every distinct address once. Never throws — on failure rows just get a null
// location and the response still succeeds.
async function withLocations<T extends { ip: string | null }>(
  rows: T[]
): Promise<Array<T & { location: GeoLocation | null }>> {
  let byIp = new Map<string, GeoLocation>();
  try {
    byIp = await resolveLocations(rows.map((r) => r.ip));
  } catch (err) {
    console.error("failed to resolve locations:", err);
  }
  return rows.map((r) => {
    const key = normalizeForLookup(r.ip);
    return { ...r, location: (key && byIp.get(key)) || null };
  });
}

// Active-sessions + audit-log endpoints. Admin-only: this is sensitive activity
// data about every user. The guard is applied per-route (not via router.use)
// because this router is mounted at "/api", so a router-level middleware would
// run for every API request and 403 non-admins on unrelated endpoints.
export const activityRouter = Router();

const adminOnly = requireRole("admin");

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("activity error:", err);
    res.status(500).json({ error: "activity request failed" });
  }
}

activityRouter.get("/sessions", adminOnly, async (req, res) => {
  try {
    const sessions = await withLocations(listSessions(currentSessionId(req)));
    res.json({ sessions });
  } catch (err) {
    sendError(res, err);
  }
});

activityRouter.post("/sessions/revoke", adminOnly, (req, res) => {
  try {
    const { id } = req.body ?? {};
    if (typeof id !== "string" || !id) throw new AuthError(400, "missing session id");
    revokeSession(id);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "session.revoke",
      detail: `revoked session ${id.slice(0, 12)}…`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

activityRouter.get("/audit", adminOnly, async (req, res) => {
  try {
    const limit = Number(req.query.limit);
    const entries = await withLocations(listAudit(Number.isFinite(limit) ? limit : 200));
    res.json({ entries });
  } catch (err) {
    sendError(res, err);
  }
});
