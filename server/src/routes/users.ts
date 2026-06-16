import { Router } from "express";
import {
  AuthError,
  clientIp,
  countAdmins,
  createUser,
  deleteUser,
  getUserById,
  isRole,
  listUsers,
  recordAudit,
  requireRole,
  setUserActive,
  setUserPassword,
  setUserRole,
  type Role,
} from "../auth.js";

export const usersRouter = Router();

// Every endpoint here is admin-only.
usersRouter.use(requireRole("admin"));

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error("users error:", err);
    res.status(500).json({ error: "user operation failed" });
  }
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AuthError(400, "invalid user id");
  return id;
}

usersRouter.get("/", (_req, res) => {
  res.json({ users: listUsers() });
});

usersRouter.post("/", (req, res) => {
  try {
    const { username, password, role } = req.body ?? {};
    const r: Role = isRole(role) ? role : "viewer";
    const user = createUser(String(username ?? ""), String(password ?? ""), r);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "user.create",
      detail: `created ${user.username} (${user.role})`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ user });
  } catch (err) {
    sendError(res, err);
  }
});

usersRouter.patch("/:id", (req, res) => {
  try {
    const id = parseId(req.params.id);
    const target = getUserById(id);
    if (!target) throw new AuthError(404, "user not found");
    const self = req.user!;
    const { role, active, password } = req.body ?? {};

    // Guard rails: don't let an admin lock themselves or the system out.
    const demotingLastAdmin =
      target.role === "admin" &&
      ((role !== undefined && role !== "admin") || active === false) &&
      countAdmins() <= 1;
    if (demotingLastAdmin) {
      throw new AuthError(400, "cannot remove the last active admin");
    }
    if (target.id === self.id && active === false) {
      throw new AuthError(400, "you cannot deactivate your own account");
    }

    let user = target;
    const changes: string[] = [];
    if (role !== undefined) {
      user = setUserRole(id, role as Role);
      changes.push(`role -> ${user.role}`);
    }
    if (active !== undefined) {
      user = setUserActive(id, Boolean(active));
      changes.push(active ? "activated" : "deactivated");
    }
    if (password !== undefined) {
      setUserPassword(id, String(password));
      changes.push("password reset");
    }
    if (changes.length > 0) {
      recordAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: "user.update",
        detail: `${target.username}: ${changes.join(", ")}`,
        status: 200,
        ip: clientIp(req),
      });
    }
    res.json({ user: getUserById(id) ?? user });
  } catch (err) {
    sendError(res, err);
  }
});

usersRouter.delete("/:id", (req, res) => {
  try {
    const id = parseId(req.params.id);
    const target = getUserById(id);
    if (!target) throw new AuthError(404, "user not found");
    if (target.id === req.user!.id) {
      throw new AuthError(400, "you cannot delete your own account");
    }
    if (target.role === "admin" && countAdmins() <= 1) {
      throw new AuthError(400, "cannot delete the last active admin");
    }
    deleteUser(id);
    recordAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "user.delete",
      detail: `deleted ${target.username}`,
      status: 200,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});
