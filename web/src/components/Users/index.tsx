import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronRight, KeyRound, Trash2, UserPlus, X } from "lucide-react";
import {
  createUserApi,
  deleteUserApi,
  fetchAudit,
  fetchSessions,
  fetchUsers,
  formatDate,
  formatRelative,
  updateUserApi,
} from "../../api";
import type { AuditEntry, Role, SessionInfo, User } from "../../types";
import { hasRole, useAuth } from "../../auth/AuthContext";
import { displayLabel, isFailed } from "../Activity";
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
  RoleBadge,
} from "../ui/styles";
import { PanelSkeleton } from "../ui/Skeleton";
import { Tooltip } from "../ui/Tooltip";
import * as S from "./styles";

const WIDGET_POLL_MS = 5000;
const WIDGET_AUDIT_LIMIT = 200;

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

interface UserActivity {
  user: User;
  sessionCount: number;
  online: boolean;
  lastSeen: number | null;
  lastAction: AuditEntry | null;
}

/** Newest audit entry per user, matched on id first so renames don't lose rows. */
function lastActionByUser(audit: AuditEntry[]): Map<string, AuditEntry> {
  const map = new Map<string, AuditEntry>();
  for (const entry of audit) {
    const keys = [
      entry.userId !== null ? `id:${entry.userId}` : null,
      entry.username ? `name:${entry.username}` : null,
    ].filter((k): k is string => k !== null);
    for (const key of keys) {
      const prev = map.get(key);
      if (!prev || entry.ts > prev.ts) map.set(key, entry);
    }
  }
  return map;
}

function buildActivity(
  users: User[],
  sessions: SessionInfo[],
  audit: AuditEntry[]
): UserActivity[] {
  const byUser = lastActionByUser(audit);
  const rows = users.map((user) => {
    const mine = sessions.filter((s) => s.userId === user.id);
    const lastAction = byUser.get(`id:${user.id}`) ?? byUser.get(`name:${user.username}`) ?? null;
    const seen = [
      ...mine.map((s) => s.lastSeen),
      ...(lastAction ? [lastAction.ts] : []),
    ];
    return {
      user,
      sessionCount: mine.length,
      online: mine.length > 0 && user.active,
      lastSeen: seen.length > 0 ? Math.max(...seen) : null,
      lastAction,
    };
  });
  return rows.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.lastSeen !== b.lastSeen) return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
    return a.user.username.localeCompare(b.user.username);
  });
}

/** Overview panel: who is signed in and what each account did last. Admin only. */
export function UsersActivityOverview() {
  const { user: me } = useAuth();
  const isAdmin = hasRole(me, "admin");
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [nextUsers, nextSessions, nextAudit] = await Promise.all([
        fetchUsers(),
        fetchSessions().catch(() => [] as SessionInfo[]),
        fetchAudit(WIDGET_AUDIT_LIMIT)
          .then((a) => a.entries)
          .catch(() => [] as AuditEntry[]),
      ]);
      setUsers(nextUsers);
      setSessions(nextSessions);
      setAudit(nextAudit);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const id = setInterval(() => void load(), WIDGET_POLL_MS);
    return () => clearInterval(id);
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isAdmin]);

  const rows = useMemo(
    () => buildActivity(users, sessions, audit),
    [audit, sessions, users]
  );
  const onlineCount = rows.filter((r) => r.online).length;

  if (!isAdmin) {
    return <div className="muted">Only admins can see user activity.</div>;
  }

  if (loading && users.length === 0) {
    return <PanelSkeleton label="Loading user activity…" />;
  }

  return (
    <S.WidgetRoot>
      <S.WidgetMeta className="muted">
        {onlineCount} online · {users.length} account{users.length === 1 ? "" : "s"}
      </S.WidgetMeta>
      {error && <AuthError $inline>{error}</AuthError>}
      {rows.length === 0 && !error ? (
        <div className="muted">No accounts yet.</div>
      ) : (
        <S.WidgetList>
          {rows.map((row) => (
            <ActivityRow key={row.user.id} row={row} now={now} isSelf={row.user.id === me?.id} />
          ))}
        </S.WidgetList>
      )}
      <S.WidgetFoot to="/activity">
        Open activity
        <ChevronRight size={14} strokeWidth={1.8} />
      </S.WidgetFoot>
    </S.WidgetRoot>
  );
}

function ActivityRow({
  row,
  now,
  isSelf,
}: Readonly<{ row: UserActivity; now: number; isSelf: boolean }>) {
  const { user, online, sessionCount, lastSeen, lastAction } = row;

  let when = "never signed in";
  if (online) {
    when = sessionCount > 1 ? `online · ${sessionCount} sessions` : "online";
  } else if (lastSeen !== null) {
    when = formatRelative(lastSeen, now);
  }

  let what = "No recent activity";
  if (!user.active) what = "Account disabled";
  else if (lastAction) what = displayLabel(lastAction);

  return (
    <S.WidgetRow>
      <S.OnlineDot $on={online} title={online ? "Signed in" : "Not signed in"} />
      <S.WidgetName>
        {user.username}
        {isSelf && <S.SelfBadge>you</S.SelfBadge>}
        <RoleBadge $role={user.role}>{user.role}</RoleBadge>
      </S.WidgetName>
      <S.WidgetWhen $live={online} title={lastSeen ? formatDate(lastSeen) : undefined}>
        {when}
      </S.WidgetWhen>
      <S.WidgetAction
        $alert={!user.active || (lastAction ? isFailed(lastAction) : false)}
        title={lastAction?.detail ?? undefined}
      >
        {what}
      </S.WidgetAction>
    </S.WidgetRow>
  );
}

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
