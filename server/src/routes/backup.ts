import { Router } from "express";
import {
  BackupError,
  assertRestoreConfirm,
  createSnapshot,
  listSnapshots,
  restoreFromUpload,
  restoreSnapshot,
  scheduleRestoreRestart,
  snapshotFilePath,
} from "../backup.js";
import { clientIp, recordAudit, requireRole } from "../auth.js";

export const backupRouter = Router();

const adminOnly = requireRole("admin");

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof BackupError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("backup error:", err);
  res.status(500).json({ error: "backup request failed" });
}

backupRouter.get("/", adminOnly, async (_req, res) => {
  try {
    res.json({ snapshots: await listSnapshots() });
  } catch (err) {
    sendError(res, err);
  }
});

backupRouter.post("/", adminOnly, async (req, res) => {
  try {
    const snapshot = await createSnapshot("manual");
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "backup.create",
      detail: snapshot.fileName,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ snapshot });
  } catch (err) {
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "backup.create",
      detail: err instanceof BackupError ? err.message : null,
      status: err instanceof BackupError ? err.status : 500,
      ip: clientIp(req),
    });
    sendError(res, err);
  }
});

backupRouter.get("/:id/download", adminOnly, (req, res) => {
  const id = String(req.params.id ?? "");
  try {
    const filePath = snapshotFilePath(id);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "backup.download",
      detail: id,
      status: 200,
      ip: clientIp(req),
    });
    res.download(filePath, id);
  } catch (err) {
    sendError(res, err);
  }
});

backupRouter.post("/restore", adminOnly, async (req, res) => {
  const json = req.is("application/json");
  try {
    if (json) {
      const body = (req.body ?? {}) as { id?: unknown; confirm?: unknown };
      assertRestoreConfirm(body.confirm);
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) throw new BackupError(400, "snapshot id is required");
      await restoreSnapshot(id);
      recordAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: "backup.restore",
        detail: id,
        status: 200,
        ip: clientIp(req),
      });
      res.json({ ok: true, restarting: true });
      scheduleRestoreRestart();
      return;
    }

    assertRestoreConfirm(req.query.confirm);
    await restoreFromUpload(req);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "backup.restore",
      detail: "uploaded archive",
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true, restarting: true });
    scheduleRestoreRestart();
  } catch (err) {
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "backup.restore",
      detail: err instanceof BackupError ? err.message : null,
      status: err instanceof BackupError ? err.status : 500,
      ip: clientIp(req),
    });
    sendError(res, err);
  }
});
