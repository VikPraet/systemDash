import { Router } from "express";
import { clientIp, recordAudit, requireRole } from "../auth.js";
import {
  BUILTIN_THEME_META,
  ThemeError,
  deleteCustomTheme,
  listCustomThemes,
  saveCustomTheme,
  themePreview,
} from "../themes.js";

export const themesRouter = Router();

const adminOnly = requireRole("admin");

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof ThemeError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("theme error:", err);
  res.status(500).json({ error: "theme request failed" });
}

themesRouter.get("/", async (_req, res) => {
  try {
    const custom = await listCustomThemes();
    res.json({
      themes: [
        ...BUILTIN_THEME_META.map((t) => ({
          id: t.id,
          name: t.name,
          builtin: true,
          modes: ["dark", "light"],
        })),
        ...custom.map((t) => ({
          id: t.id,
          name: t.name,
          builtin: false,
          modes: Object.keys(t.modes),
          preview: themePreview(t),
          theme: t,
        })),
      ],
    });
  } catch (err) {
    sendError(res, err);
  }
});

themesRouter.post("/", adminOnly, async (req, res) => {
  try {
    const theme = await saveCustomTheme(req.body);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "theme.import",
      detail: theme.id,
      status: 200,
      ip: clientIp(req),
    });
    res.json(theme);
  } catch (err) {
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "theme.import",
      detail: err instanceof ThemeError ? err.message : null,
      status: err instanceof ThemeError ? err.status : 500,
      ip: clientIp(req),
    });
    sendError(res, err);
  }
});

themesRouter.delete("/:id", adminOnly, async (req, res) => {
  const id = String(req.params.id ?? "");
  try {
    await deleteCustomTheme(id);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "theme.delete",
      detail: id,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    recordAudit({
      userId: req.user?.id ?? null,
      username: req.user?.username ?? null,
      action: "theme.delete",
      detail: err instanceof ThemeError ? err.message : id,
      status: err instanceof ThemeError ? err.status : 500,
      ip: clientIp(req),
    });
    sendError(res, err);
  }
});
