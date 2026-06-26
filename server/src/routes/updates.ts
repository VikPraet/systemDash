import { Router } from "express";
import { clientIp, recordAudit, requireRole } from "../auth.js";
import {
  getUpdatesStatus,
  getUpdateJob,
  runSystemUpdate,
  runUpdatePhase,
  startUpdateJob,
  UpdatesError,
  type UpdatePhase,
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

updatesRouter.get("/status", adminOnly, async (req, res) => {
  try {
    const refresh = req.query.refresh === "1";
    const descriptions = req.query.descriptions === "1";
    res.json(await getUpdatesStatus({ refresh, descriptions }));
  } catch (err) {
    sendError(res, err);
  }
});

updatesRouter.get("/job", adminOnly, (_req, res) => {
  res.json(getUpdateJob());
});

updatesRouter.post("/start", adminOnly, (req, res) => {
  const body = (req.body ?? {}) as { scope?: unknown; packages?: unknown };
  const scope = body.scope;
  if (scope !== "packages" && scope !== "all") {
    res.status(400).json({ error: 'scope must be "packages" or "all"' });
    return;
  }

  const packages = Array.isArray(body.packages)
    ? body.packages.filter((p): p is string => typeof p === "string" && p.length > 0)
    : undefined;

  try {
    startUpdateJob({ scope: scope as UpdateScope, packages });
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "updates.run",
      detail: packages?.length
        ? `${scope}: ${packages.length} selected`
        : String(scope),
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

updatesRouter.post("/run", adminOnly, async (req, res) => {
  const body = (req.body ?? {}) as { scope?: unknown; phase?: unknown };
  const phase = body.phase;

  if (phase === "refresh") {
    try {
      const result = await runUpdatePhase("refresh");
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
    return;
  }

  if (phase === "apply") {
    const scope = body.scope;
    if (scope !== "packages" && scope !== "all") {
      res.status(400).json({ error: 'scope must be "packages" or "all"' });
      return;
    }
    try {
      const result = await runUpdatePhase("apply", scope as UpdateScope);
      recordAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: "updates.run",
        detail: String(scope),
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
          detail: `${String(scope)}: ${err.message}`,
          status: err.status,
          ip: clientIp(req),
        });
      }
      sendError(res, err);
    }
    return;
  }

  const scope = body.scope;
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
      detail: String(scope),
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
        detail: `${String(scope)}: ${err.message}`,
        status: err.status,
        ip: clientIp(req),
      });
    }
    sendError(res, err);
  }
});
