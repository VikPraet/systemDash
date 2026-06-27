import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Trash2, UserPlus, KeyRound, X } from "lucide-react";
import {
  createUserApi,
  deleteUserApi,
  fetchUsers,
  formatDate,
  updateUserApi,
} from "../../api";
import type { Role, User } from "../../types";
import { useAuth } from "../../auth/AuthContext";
import { Dropdown } from "../Dropdown";
import {
  AuthError,
  AuthSubmit,
  GhostBtn,
  Loading,
  ModalActions,
  ModalCard,
  ModalClose,
  ModalHead,
  ModalOverlay,
  ModalSub,
} from "../ui/styles";
import { Tooltip } from "../ui/Tooltip";
import * as S from "./styles";

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
    <S.UsersTab>
      <S.UsersHead>
        <h2>Users</h2>
        <span className="muted">{users.length} account(s)</span>
      </S.UsersHead>

      {error && <AuthError $inline>{error}</AuthError>}

      <CreateUserForm onCreate={(u, p, r) => act(() => createUserApi(u, p, r))} />

      {loading ? (
        <Loading>Loading users…</Loading>
      ) : (
        <S.UsersTable>
          <S.UsersRowHead>
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Created</span>
            <span>Actions</span>
          </S.UsersRowHead>
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
        </S.UsersTable>
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
    </S.UsersTab>
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
    <ModalOverlay onClick={onClose} role="presentation">
      <ModalCard as="form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <ModalHead>
          <h3>Reset password</h3>
          <ModalClose type="button" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </ModalClose>
        </ModalHead>
        <ModalSub>
          Set a new password for <strong>{user.username}</strong>. They will be
          signed out and must log in again.
        </ModalSub>
        <S.AuthField>
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </S.AuthField>
        <S.AuthField>
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </S.AuthField>
        {error && <AuthError>{error}</AuthError>}
        <ModalActions>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
          <AuthSubmit type="submit" $compact disabled={busy}>
            {busy ? "Saving…" : "Reset password"}
          </AuthSubmit>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
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
    <S.CreateForm onSubmit={submit}>
      <S.CreateInput
        type="text"
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <S.CreateInput
        type="password"
        placeholder="password (min 8 chars)"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <S.DropdownWrap>
        <RoleSelect value={role} onChange={setRole} />
      </S.DropdownWrap>
      <S.CreateButton type="submit">
        <UserPlus size={16} strokeWidth={1.8} />
        Add user
      </S.CreateButton>
    </S.CreateForm>
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
    <S.UsersRow>
      <S.UserName>
        {user.username}
        {isSelf && <S.SelfBadge>you</S.SelfBadge>}
      </S.UserName>
      <S.UsersRole>
        <RoleSelect
          value={user.role}
          onChange={onRole}
          title={ROLE_OPTIONS.find((r) => r.value === user.role)?.hint}
        />
      </S.UsersRole>
      <S.UsersStatus>
        <Tooltip
          label={isSelf ? "You cannot deactivate yourself" : "Toggle active"}
        >
          <S.StatusPill
            $state={user.active ? "on" : "off"}
            onClick={onToggleActive}
            disabled={isSelf}
          >
            {user.active ? "active" : "disabled"}
          </S.StatusPill>
        </Tooltip>
      </S.UsersStatus>
      <S.UsersCreated className="muted">{formatDate(user.createdAt)}</S.UsersCreated>
      <S.UserActions>
        <Tooltip label="Reset password">
          <S.ActionBtn onClick={onResetPassword}>
            <KeyRound size={15} strokeWidth={1.8} />
          </S.ActionBtn>
        </Tooltip>
        <Tooltip label={isSelf ? "You cannot delete yourself" : "Delete user"}>
          <S.ActionBtn $danger onClick={remove} disabled={isSelf}>
            <Trash2 size={15} strokeWidth={1.8} />
          </S.ActionBtn>
        </Tooltip>
      </S.UserActions>
    </S.UsersRow>
  );
}
