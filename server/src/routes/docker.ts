import { Router } from "express";
import {
  containerAction,
  containerLogs,
  DockerError,
  getDockerStatus,
  listContainers,
  removeContainer,
  withProjectNames,
} from "../docker.js";
import { listProjects } from "../projects.js";
import { clientIp, recordAudit, requireRole } from "../auth.js";

export const dockerRouter = Router();

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof DockerError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("docker error:", err);
    res.status(500).json({ error: "docker request failed" });
  }
}

dockerRouter.get("/status", async (_req, res) => {
  try {
    res.json(await getDockerStatus());
  } catch (err) {
    sendError(res, err);
  }
});

dockerRouter.get("/containers", async (_req, res) => {
  try {
    const status = await getDockerStatus();
    if (!status.available) {
      res.status(503).json({ error: status.error ?? "Docker is not available" });
      return;
    }
    const names = new Map(listProjects().map((p) => [p.id, p.name]));
    const containers = withProjectNames(await listContainers(), names);
    res.json({ timestamp: Date.now(), containers });
  } catch (err) {
    sendError(res, err);
  }
});

dockerRouter.get("/containers/:id/logs", async (req, res) => {
  try {
    const tail = Number(req.query.tail);
    const logs = await containerLogs(
      paramId(req.params.id),
      Number.isFinite(tail) ? tail : 300
    );
    res.json({ logs });
  } catch (err) {
    sendError(res, err);
  }
});

const mutate = requireRole("user");

dockerRouter.post("/containers/:id/start", mutate, async (req, res) => {
  try {
    const id = paramId(req.params.id);
    await containerAction(id, "start");
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "docker.start",
      detail: id,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

dockerRouter.post("/containers/:id/stop", mutate, async (req, res) => {
  try {
    const id = paramId(req.params.id);
    await containerAction(id, "stop");
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "docker.stop",
      detail: id,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

dockerRouter.post("/containers/:id/restart", mutate, async (req, res) => {
  try {
    const id = paramId(req.params.id);
    await containerAction(id, "restart");
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "docker.restart",
      detail: id,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

dockerRouter.post("/containers/:id/remove", mutate, async (req, res) => {
  try {
    const id = paramId(req.params.id);
    const force = (req.body as { force?: unknown })?.force === true;
    await removeContainer(id, force);
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "docker.remove",
      detail: force ? `${id} (force)` : id,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});
