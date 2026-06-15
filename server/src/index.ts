import express from "express";
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { getSnapshot } from "./stats.js";
import { getProcesses } from "./processes.js";
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
import { getSettings, saveSettings } from "./settings.js";
import { attachTerminal } from "./terminal.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

const app = express();
// Raise the body limit so the editor can save reasonably large text files.
app.use(express.json({ limit: "8mb" }));

/** Sends a thrown error as an HTTP response, mapping HttpError to its status. */
function sendError(res: express.Response, err: unknown, fallback: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error(`${fallback}:`, err);
    res.status(500).json({ error: fallback });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

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
  try {
    res.json(await readTextFile(String(req.query.path ?? "")));
  } catch (err) {
    sendError(res, err, "failed to read file");
  }
});

app.post("/api/fs/write", async (req, res) => {
  try {
    const { path: target, content } = req.body ?? {};
    res.json({ entry: await writeTextFile(String(target ?? ""), String(content ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to save file");
  }
});

app.get("/api/fs/download", async (req, res) => {
  try {
    const file = await resolveFile(String(req.query.path ?? ""));
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

app.put("/api/settings", async (req, res) => {
  try {
    res.json(await saveSettings(req.body));
  } catch (err) {
    sendError(res, err, "failed to save settings");
  }
});

app.post("/api/fs/folder", async (req, res) => {
  try {
    const { path: parent, name } = req.body ?? {};
    res.json({ entry: await createFolder(String(parent ?? ""), String(name ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to create folder");
  }
});

app.post("/api/fs/file", async (req, res) => {
  try {
    const { path: parent, name } = req.body ?? {};
    res.json({ entry: await createFile(String(parent ?? ""), String(name ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to create file");
  }
});

app.post("/api/fs/rename", async (req, res) => {
  try {
    const { path: target, newName } = req.body ?? {};
    res.json({ entry: await renameEntry(String(target ?? ""), String(newName ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to rename");
  }
});

app.post("/api/fs/move", async (req, res) => {
  try {
    const { path: source, dest } = req.body ?? {};
    res.json({ entry: await moveEntry(String(source ?? ""), String(dest ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to move");
  }
});

app.post("/api/fs/copy", async (req, res) => {
  try {
    const { path: source, dest } = req.body ?? {};
    res.json({ entry: await copyEntry(String(source ?? ""), String(dest ?? "")) });
  } catch (err) {
    sendError(res, err, "failed to copy");
  }
});

app.post("/api/fs/delete", async (req, res) => {
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
app.post("/api/fs/upload", async (req, res) => {
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

server.listen(PORT, () => {
  console.log(`SystemDash server listening on http://localhost:${PORT}`);
});
