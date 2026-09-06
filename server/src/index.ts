import express from "express";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { getSnapshot } from "./stats.js";
import { getProcesses, killProcess, ProcessError, type KillMode } from "./processes.js";
import {
  getRoots,
  listDirectory,
  directorySize,
  resolveFile,
  createFolder,
  createFile,
  renameEntry,
  moveEntry,
  copyEntry,
  deleteEntry,
  resolveUploadTarget,
  readTextFile,
  writeTextFile,
  HttpError,
} from "./files.js";
import { getSettings, saveSettings, initSettings, diffSettings, sanitizeOsUsername } from "./settings.js";
import { queryHistory, historyStats, clearHistory } from "./history.js";
import { attachTerminal } from "./terminal.js";
import { lookupOsUser } from "./osUser.js";
import {
  requireAuth,
  requireRole,
  pruneSessions,
  pruneAudit,
  recordAudit,
  clientIp,
} from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { activityRouter } from "./routes/activity.js";
import { dockerRouter } from "./routes/docker.js";
import { updatesRouter } from "./routes/updates.js";
import { appUpdateRouter } from "./routes/appUpdate.js";
import { powerRouter } from "./routes/power.js";
import { projectsRouter } from "./routes/projects.js";
import { accessRouter } from "./routes/access.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

const app = express();
// We're behind a single host (and optionally a reverse proxy); trust the proxy
// so req.secure / x-forwarded-proto are honoured for Secure cookies.
app.set("trust proxy", true);
// Raise the body limit so the editor can save reasonably large text files.
app.use(express.json({ limit: "8mb" }));

// Health check stays public so uptime monitors work without credentials.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Auth endpoints (status/setup/login/logout/me) must be reachable while logged
// out, so they are mounted before the auth gate below.
app.use("/api/auth", authRouter);

// Everything under /api from here on requires a valid session. Read endpoints
// only need a logged-in user (viewer+); mutating endpoints additionally require
// requireRole("user") inline. User management requires admin (inside its router).
app.use("/api", requireAuth);
app.use("/api/users", usersRouter);
app.use("/api", activityRouter);
app.use("/api/docker", dockerRouter);
app.use("/api/updates", updatesRouter);
app.use("/api/app-update", appUpdateRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/access", accessRouter);

// Host power control (reboot / shutdown). Admin-only; explicit audit before the
// generic middleware. Must respond before the OS command runs.
app.use("/api/power", powerRouter);

// Process control. Defined before the generic audit middleware so we can record
// a richer, explicit audit entry (with the process name + mode) instead of the
// generic one. Requires the `user` role; `kill` force-terminates, `end` is graceful.
app.post("/api/processes/kill", requireRole("user"), async (req, res) => {
  const body = (req.body ?? {}) as { pid?: unknown; mode?: unknown; name?: unknown };
  const pid = Number(body.pid);
  const mode: KillMode = body.mode === "kill" ? "kill" : "end";
  const name = typeof body.name === "string" ? body.name : "";
  const label = `${name ? `${name} ` : ""}(pid ${Number.isFinite(pid) ? pid : "?"})`;
  try {
    await killProcess(pid, mode);
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: mode === "kill" ? "process.kill" : "process.end",
      detail: label,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: mode === "kill" ? "process.kill" : "process.end",
      detail: `failed: ${label}`,
      status: err instanceof ProcessError ? err.status : 500,
      ip: clientIp(req),
    });
    if (err instanceof ProcessError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error("Failed to terminate process:", err);
      res.status(500).json({ error: "failed to terminate process" });
    }
  }
});

// Audit any state-changing operational request (file writes, settings, history
// clear, etc.). Mounted after the user/session routers so those don't get logged
// twice — they record richer entries themselves. Reads (GET) are not logged.
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  res.on("finish", () => {
    // Successful settings saves are logged explicitly by the route with a
    // field-level diff. Still fall through for failures/denials (>=400) so
    // blocked attempts aren't lost.
    if (req.path.startsWith("/api/settings") && res.statusCode < 400) {
      return;
    }
    if (
      (req.path === "/access" || req.path.startsWith("/api/access")) &&
      res.statusCode < 400
    ) {
      return;
    }
    const action =
      req.path.replace(/^\/api\//, "").replace(/\/+$/, "").replace(/\//g, ".") ||
      "request";
    const body = (req.body ?? {}) as Record<string, unknown>;
    const detail =
      (typeof body.path === "string" && body.path) ||
      (typeof body.dir === "string" && body.dir) ||
      (typeof req.query.dir === "string" ? req.query.dir : null) ||
      null;
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action,
      detail,
      status: res.statusCode,
      ip: clientIp(req),
    });
  });
  next();
});

/** Parses a query-string number, falling back to a default when absent/invalid. */
function numParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Sends a thrown error as an HTTP response, mapping HttpError to its status. */
function sendError(res: express.Response, err: unknown, fallback: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error(`${fallback}:`, err);
    res.status(500).json({ error: fallback });
  }
}

app.get("/api/system", async (_req, res) => {
  try {
    const snapshot = await getSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("Failed to collect system snapshot:", err);
    res.status(500).json({ error: "failed to collect system stats" });
  }
});

app.get("/api/processes", async (_req, res) => {
  try {
    const processes = await getProcesses();
    res.json(processes);
  } catch (err) {
    console.error("Failed to collect processes:", err);
    res.status(500).json({ error: "failed to collect processes" });
  }
});

app.get("/api/fs/roots", async (_req, res) => {
  try {
    res.json({ roots: await getRoots() });
  } catch (err) {
    console.error("Failed to list roots:", err);
    res.status(500).json({ error: "failed to list roots" });
  }
});

app.get("/api/fs/list", async (req, res) => {
  try {
    const listing = await listDirectory(String(req.query.path ?? ""));
    res.json(listing);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error("Failed to list directory:", err);
      res.status(500).json({ error: "failed to list directory" });
    }
  }
});

app.get("/api/fs/dirsize", async (req, res) => {
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });
  try {
    const result = await directorySize(
      String(req.query.path ?? ""),
      () => aborted
    );
    if (aborted) return;
    res.json(result);
  } catch (err) {
    if (aborted) return;
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error("Failed to compute directory size:", err);
      res.status(500).json({ error: "failed to compute directory size" });
    }
  }
});

app.get("/api/fs/read", async (req, res) => {
  const target = String(req.query.path ?? "");
  try {
    const result = await readTextFile(target);
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "fs.read",
      detail: target,
      status: 200,
      ip: clientIp(req),
    });
    res.json(result);
  } catch (err) {
    sendError(res, err, "failed to read file");
  }
});

app.post("/api/fs/write", requireRole("user"), async (req, res) => {
  try {
    const { path: target, content } = req.body ?? {};
    res.json({ entry: await writeTextFile(String(target ?? ""), String(content ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to save file");
  }
});

app.get("/api/fs/download", async (req, res) => {
  const target = String(req.query.path ?? "");
  try {
    const file = await resolveFile(target);
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "fs.download",
      detail: target,
      status: 200,
      ip: clientIp(req),
    });
    res.download(file);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error("Failed to download file:", err);
      res.status(500).json({ error: "failed to download file" });
    }
  }
});

app.get("/api/settings", async (_req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    sendError(res, err, "failed to load settings");
  }
});

app.put("/api/settings", requireRole("user"), async (req, res) => {
  try {
    const rawOsUser = (req.body as { terminal?: { osUser?: unknown } })?.terminal
      ?.osUser;
    if (typeof rawOsUser === "string" && rawOsUser.trim() !== "") {
      const osUser = sanitizeOsUsername(rawOsUser, "");
      if (!osUser) {
        res.status(400).json({
          error:
            "OS user must be a Linux username (letters, numbers, dot, dash, underscore)",
        });
        return;
      }
      if (process.platform !== "win32") {
        const found = await lookupOsUser(osUser);
        if (!found) {
          res.status(400).json({
            error: `OS user "${osUser}" was not found on this machine`,
          });
          return;
        }
      }
    }

    const prev = await getSettings();
    const next = await saveSettings(req.body);
    // Log exactly which fields changed (grouped by section) instead of a bare
    // "changed settings". A no-op save records nothing. Denied attempts are
    // still captured by the generic middleware (see its /api/settings note).
    const diff = diffSettings(prev, next);
    if (diff.count > 0) {
      recordAudit({
        userId: req.user?.id ?? null,
        username: req.user?.username ?? null,
        action:
          diff.sections.length === 1 ? `settings.${diff.sections[0]}` : "settings",
        detail: diff.detail,
        status: 200,
        ip: clientIp(req),
      });
    }
    res.json(next);
  } catch (err) {
    sendError(res, err, "failed to save settings");
  }
});

// Time-series history. `from`/`to` are epoch ms (default: last hour); `points`
// controls how many buckets the data is downsampled into for charting.
app.get("/api/history", (req, res) => {
  try {
    const now = Date.now();
    const to = numParam(req.query.to, now);
    const from = numParam(req.query.from, to - 60 * 60 * 1000);
    const points = numParam(req.query.points, 300);
    res.json(queryHistory({ from, to, points }));
  } catch (err) {
    sendError(res, err, "failed to query history");
  }
});

app.get("/api/history/stats", (_req, res) => {
  try {
    res.json(historyStats());
  } catch (err) {
    sendError(res, err, "failed to read history stats");
  }
});

app.post("/api/history/clear", requireRole("user"), (_req, res) => {
  try {
    clearHistory();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, "failed to clear history");
  }
});

app.post("/api/fs/folder", requireRole("user"), async (req, res) => {
  try {
    const { path: parent, name } = req.body ?? {};
    res.json({ entry: await createFolder(String(parent ?? ""), String(name ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to create folder");
  }
});

app.post("/api/fs/file", requireRole("user"), async (req, res) => {
  try {
    const { path: parent, name } = req.body ?? {};
    res.json({ entry: await createFile(String(parent ?? ""), String(name ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to create file");
  }
});

app.post("/api/fs/rename", requireRole("user"), async (req, res) => {
  try {
    const { path: target, newName } = req.body ?? {};
    res.json({ entry: await renameEntry(String(target ?? ""), String(newName ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to rename");
  }
});

app.post("/api/fs/move", requireRole("user"), async (req, res) => {
  try {
    const { path: source, dest } = req.body ?? {};
    res.json({ entry: await moveEntry(String(source ?? ""), String(dest ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to move");
  }
});

app.post("/api/fs/copy", requireRole("user"), async (req, res) => {
  try {
    const { path: source, dest } = req.body ?? {};
    res.json({ entry: await copyEntry(String(source ?? ""), String(dest ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to copy");
  }
});

app.post("/api/fs/delete", requireRole("user"), async (req, res) => {
  try {
    const { path: target } = req.body ?? {};
    await deleteEntry(String(target ?? ""));
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, "failed to delete");
  }
});

// Upload streams the raw request body straight to disk so large files don't
// have to be buffered in memory. The target dir + filename come from the query.
app.post("/api/fs/upload", requireRole("user"), async (req, res) => {
  try {
    const target = await resolveUploadTarget(
      String(req.query.dir ?? ""),
      String(req.query.name ?? "")
    );
    if (fs.existsSync(target)) {
      res.status(409).json({ error: "an item with that name already exists here" });
      return;
    }
    const out = fs.createWriteStream(target, { flags: "wx" });
    let failed = false;
    const fail = (status: number, message: string) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.promises.rm(target, { force: true }).catch(() => {});
      if (!res.headersSent) res.status(status).json({ error: message });
    };

    out.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") fail(403, "permission denied");
      else if (code === "EEXIST") fail(409, "an item with that name already exists here");
      else fail(500, "failed to write file");
    });
    req.on("aborted", () => fail(499, "upload aborted"));
    req.on("error", () => fail(500, "upload failed"));
    out.on("finish", () => {
      if (!failed && !res.headersSent) res.json({ ok: true });
    });

    req.pipe(out);
  } catch (err) {
    sendError(res, err, "failed to upload");
  }
});

// In production, serve the built frontend (web/dist) so everything is one host.
const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback: serve index.html for any non-API route (Express 5 wildcard syntax).
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

const server = http.createServer(app);
attachTerminal(server);

// Start the background metrics recorder before accepting requests so a 24/7
// server keeps collecting history even when no browser is connected.
initSettings().catch((err) => {
  console.error("Failed to initialise settings/history recorder:", err);
});

// Periodically drop expired sessions and trim the audit log so the auth DB
// doesn't grow unbounded.
pruneSessions();
pruneAudit();
setInterval(() => {
  pruneSessions();
  pruneAudit();
}, 60 * 60 * 1000).unref?.();

server.listen(PORT, () => {
  console.log(`SystemDash server listening on http://localhost:${PORT}`);
});
