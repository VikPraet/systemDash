import { Router } from "express";
import { clientIp, recordAudit, requireRole } from "../auth.js";
import {
  AppUpdateError,
  getAppUpdateJob,
  getAppUpdateStatus,
  startAppUpdate,
} from "../appUpdate.js";

export const appUpdateRouter = Router();

const adminOnly = requireRole("admin");

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof AppUpdateError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("app-update error:", err);
    res.status(500).json({ error: "app update request failed" });
  }
}

appUpdateRouter.get("/status", adminOnly, async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    res.json(await getAppUpdateStatus({ force }));
  } catch (err) {
    sendError(res, err);
  }
});

appUpdateRouter.get("/job", adminOnly, (_req, res) => {
  res.json(getAppUpdateJob());
});

appUpdateRouter.post("/start", adminOnly, (req, res) => {
  try {
    const body = (req.body ?? {}) as { version?: unknown };
    const version = typeof body.version === "string" ? body.version : undefined;
    startAppUpdate(version);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "app-update.start",
      detail: version ? `SystemDash self-update to v${version}` : "SystemDash self-update",
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});
