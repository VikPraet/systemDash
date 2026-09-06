import { Router } from "express";
import { clientIp, recordAudit, requireRole } from "../auth.js";
import { getPublicAccess, setPublicAccessHostname } from "../access.js";
import { ProjectsError } from "../projects.js";

export const accessRouter = Router();

const adminOnly = requireRole("admin");

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof ProjectsError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("access error:", err);
  res.status(500).json({ error: "access request failed" });
}

accessRouter.get("/", adminOnly, async (req, res) => {
  try {
    res.json(await getPublicAccess({ force: req.query.refresh === "1" }));
  } catch (err) {
    sendError(res, err);
  }
});

accessRouter.post("/", adminOnly, async (req, res) => {
  const body = (req.body ?? {}) as { hostname?: unknown };
  const hostname = typeof body.hostname === "string" ? body.hostname : "";
  try {
    const next = await setPublicAccessHostname(hostname);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "access.public",
      detail: next.notice ?? hostname,
      status: 200,
      ip: clientIp(req),
    });
    res.json(next);
  } catch (err) {
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "access.public",
      detail: err instanceof ProjectsError ? err.message : hostname,
      status: err instanceof ProjectsError ? err.status : 500,
      ip: clientIp(req),
    });
    sendError(res, err);
  }
});
