import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Trash2, UserPlus, KeyRound, X } from "lucide-react";
import {
  createUserApi,
  deleteUserApi,
  fetchUsers,
  formatDate,
  updateUserApi,
} from "../api";
import type { Role, User } from "../types";
import { useAuth } from "../auth/AuthContext";
import { Dropdown } from "./Dropdown";

/** A custom dropdown for picking a role (shows the role hints in the menu). */
function RoleSelect({
  value,
  onChange,
  title,
}: {
  value: Role;
  onChange: (role: Role) => void;
  title?: string;
}) {
  return (
    <Dropdown
      value={value}
      options={ROLE_OPTIONS}
      onChange={onChange}
      title={title}
      ariaLabel="Role"
    />
  );
}

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "viewer", label: "Viewer", hint: "Read-only: stats, history, browse files" },
  { value: "user", label: "User", hint: "Viewer + file edits, uploads, terminal" },
  { value: "admin", label: "Admin", hint: "Full access + manage users" },
];

export function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pwTarget, setPwTarget] = useState<User | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="users-tab">
      <div className="users-head">
        <h2>Users</h2>
        <span className="muted">{users.length} account(s)</span>
      </div>

      {error && <div className="auth-error inline">{error}</div>}

      <CreateUserForm onCreate={(u, p, r) => act(() => createUserApi(u, p, r))} />

      {loading ? (
        <div className="loading">Loading users…</div>
      ) : (
        <div className="users-table">
          <div className="users-row users-row-head">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Created</span>
            <span>Actions</span>
          </div>
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === me?.id}
              onRole={(r) => act(() => updateUserApi(u.id, { role: r }))}
              onToggleActive={() =>
                act(() => updateUserApi(u.id, { active: !u.active }))
              }
              onResetPassword={() => setPwTarget(u)}
              onDelete={() => act(() => deleteUserApi(u.id))}
            />
          ))}
        </div>
      )}

      {pwTarget && (
        <PasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
          onSave={async (password) => {
            await act(() => updateUserApi(pwTarget.id, { password }));
            setPwTarget(null);
          }}
        />
      )}
    </div>
  );
}

function PasswordModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-head">
          <h3>Reset password</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
        <p className="modal-sub">
          Set a new password for <strong>{user.username}</strong>. They will be
          signed out and must log in again.
        </p>
        <label className="auth-field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="auth-submit compact" disabled={busy}>
            {busy ? "Saving…" : "Reset password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateUserForm({
  onCreate,
}: {
  onCreate: (username: string, password: string, role: Role) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    onCreate(username.trim(), password, role);
    setUsername("");
    setPassword("");
    setRole("viewer");
  }

  return (
    <form className="user-create" onSubmit={submit}>
      <input
        type="text"
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="password (min 8 chars)"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <RoleSelect value={role} onChange={setRole} />
      <button type="submit">
        <UserPlus size={16} strokeWidth={1.8} />
        Add user
      </button>
    </form>
  );
}

function UserRow({
  user,
  isSelf,
  onRole,
  onToggleActive,
  onResetPassword,
  onDelete,
}: {
  user: User;
  isSelf: boolean;
  onRole: (role: Role) => void;
  onToggleActive: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  function remove() {
    if (window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
      onDelete();
    }
  }

  return (
    <div className="users-row">
      <span className="user-name">
        {user.username}
        {isSelf && <span className="self-badge">you</span>}
      </span>
      <span>
        <RoleSelect
          value={user.role}
          onChange={onRole}
          title={ROLE_OPTIONS.find((r) => r.value === user.role)?.hint}
        />
      </span>
      <span>
        <button
          className={`status-pill ${user.active ? "on" : "off"}`}
          onClick={onToggleActive}
          disabled={isSelf}
          title={isSelf ? "You cannot deactivate yourself" : "Toggle active"}
        >
          {user.active ? "active" : "disabled"}
        </button>
      </span>
      <span className="muted">{formatDate(user.createdAt)}</span>
      <span className="user-actions">
        <button onClick={onResetPassword} title="Reset password">
          <KeyRound size={15} strokeWidth={1.8} />
        </button>
        <button
          onClick={remove}
          disabled={isSelf}
          title={isSelf ? "You cannot delete yourself" : "Delete user"}
          className="danger"
        >
          <Trash2 size={15} strokeWidth={1.8} />
        </button>
      </span>
    </div>
  );
}
