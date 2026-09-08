import { Router } from "express";
import { clientIp, currentSessionId, recordAudit, requireRole } from "../auth.js";
import {
  DashboardLockError,
  acquireLayoutLock,
  heartbeatLayoutLock,
  layoutLockStatus,
  releaseLayoutLock,
  type LayoutLockInfo,
} from "../dashboardLock.js";

export const dashboardRouter = Router();
const adminOnly = requireRole("admin");

function sendLockError(res: import("express").Response, err: unknown): void {
  if (err instanceof DashboardLockError) {
    res.status(err.status).json({ error: err.message, lock: err.lock });
    return;
  }
  console.error("dashboard lock error:", err);
  res.status(500).json({ error: "layout lock failed" });
}

function jsonLock(res: import("express").Response, lock: LayoutLockInfo): void {
  res.json(lock);
}

dashboardRouter.get("/edit-lock", adminOnly, (req, res) => {
  try {
    jsonLock(res, layoutLockStatus(req.user!.id));
  } catch (err) {
    sendLockError(res, err);
  }
});

dashboardRouter.post("/edit-lock", adminOnly, (req, res) => {
  try {
    const lock = acquireLayoutLock(req.user!, currentSessionId(req));
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "dashboard.layout_edit",
      detail: "started customizing layout",
      status: 200,
      ip: clientIp(req),
    });
    jsonLock(res, lock);
  } catch (err) {
    sendLockError(res, err);
  }
});

dashboardRouter.post("/edit-lock/heartbeat", adminOnly, (req, res) => {
  try {
    const active = Boolean((req.body as { active?: unknown })?.active);
    jsonLock(res, heartbeatLayoutLock(req.user!.id, active));
  } catch (err) {
    sendLockError(res, err);
  }
});

dashboardRouter.delete("/edit-lock", adminOnly, (req, res) => {
  try {
    jsonLock(res, releaseLayoutLock(req.user!.id));
  } catch (err) {
    sendLockError(res, err);
  }
});

dashboardRouter.post("/edit-lock/release", adminOnly, (req, res) => {
  try {
    jsonLock(res, releaseLayoutLock(req.user!.id));
  } catch (err) {
    sendLockError(res, err);
  }
});
