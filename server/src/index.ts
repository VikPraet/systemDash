import express from "express";
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
  HttpError,
} from "./files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

const app = express();

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

// In production, serve the built frontend (web/dist) so everything is one host.
const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback: serve index.html for any non-API route (Express 5 wildcard syntax).
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`SystemDash server listening on http://localhost:${PORT}`);
});
