import { Router } from "express";
import { clientIp, recordAudit, requireRole } from "../auth.js";
import {
  getUpdatesStatus,
  runSystemUpdate,
  UpdatesError,
  type UpdateScope,
} from "../updates.js";

export const updatesRouter = Router();

const adminOnly = requireRole("admin");

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof UpdatesError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("updates error:", err);
    res.status(500).json({ error: "update request failed" });
  }
}

updatesRouter.get("/status", adminOnly, async (_req, res) => {
  try {
    res.json(await getUpdatesStatus());
  } catch (err) {
    sendError(res, err);
  }
});

updatesRouter.post("/run", adminOnly, async (req, res) => {
  const scope = (req.body as { scope?: unknown })?.scope;
  if (scope !== "packages" && scope !== "all") {
    res.status(400).json({ error: 'scope must be "packages" or "all"' });
    return;
  }

  try {
    const result = await runSystemUpdate(scope as UpdateScope);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "updates.run",
      detail: scope,
      status: 200,
      ip: clientIp(req),
    });
    res.json(result);
  } catch (err) {
    if (err instanceof UpdatesError) {
      recordAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: "updates.run",
        detail: `${scope}: ${err.message}`,
        status: err.status,
        ip: clientIp(req),
      });
    }
    sendError(res, err);
  }
});
