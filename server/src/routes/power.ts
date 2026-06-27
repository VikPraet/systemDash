import { Router } from "express";
import { clientIp, recordAudit, requireRole } from "../auth.js";
import {
  actionLabel,
  getPowerCapabilities,
  PowerError,
  schedulePowerAction,
  validatePowerRequest,
} from "../systemControl.js";

export const powerRouter = Router();

const adminOnly = requireRole("admin");

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof PowerError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("power error:", err);
    res.status(500).json({ error: "power request failed" });
  }
}

powerRouter.get("/capabilities", adminOnly, (_req, res) => {
  res.json(getPowerCapabilities());
});

powerRouter.post("/run", adminOnly, (req, res) => {
  const body = (req.body ?? {}) as {
    action?: unknown;
    confirm?: unknown;
    delaySeconds?: unknown;
  };

  try {
    const { action, delaySeconds } = validatePowerRequest(
      body.action,
      body.confirm,
      body.delaySeconds
    );

    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: `system.${action}`,
      detail: `scheduled in ${delaySeconds}s`,
      status: 200,
      ip: clientIp(req),
    });

    schedulePowerAction(action, delaySeconds);

    res.json({
      ok: true,
      action,
      delaySeconds,
      message: `${actionLabel(action)} scheduled in ${delaySeconds} seconds`,
    });
  } catch (err) {
    if (err instanceof PowerError) {
      recordAudit({
        userId: req.user?.id ?? null,
        username: req.user?.username ?? null,
        action:
          typeof body.action === "string"
            ? `system.${body.action}`
            : "system.power",
        detail: err.message,
        status: err.status,
        ip: clientIp(req),
      });
    }
    sendError(res, err);
  }
});
