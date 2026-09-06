import { useState, type FormEvent } from "react";
import { KeyRound, User } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { recoverPasswordApi, recoverUsernameApi } from "../api";
import type { RecoveryQuestionId } from "../auth/recoveryQuestions";
import { AuthLayout } from "./AuthLayout";
import { RecoveryFields } from "./AuthLayout/RecoveryFields";
import * as A from "./AuthLayout/styles";
import { AuthSubmit } from "./ui/styles";

type Mode = "password" | "username";

export function Recover() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get("for") === "username" ? "username" : "password";

  function setMode(next: Mode) {
    const nextParams = new URLSearchParams(params);
    if (next === "username") nextParams.set("for", "username");
    else nextParams.delete("for");
    setParams(nextParams, { replace: true });
  }

  return (
    <AuthLayout>
      {mode === "username" ? (
        <UsernameForm onMode={setMode} />
      ) : (
        <PasswordForm onMode={setMode} />
      )}
    </AuthLayout>
  );
}

function UsernameForm({ onMode }: { onMode: (mode: Mode) => void }) {
  const [question, setQuestion] = useState<RecoveryQuestionId | "">("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question) return;
    setBusy(true);
    setError(null);
    try {
      setUsername(await recoverUsernameApi(question, answer));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (username) {
    return (
      <A.AuthForm as="div">
        <A.AuthEyebrow>Account recovery</A.AuthEyebrow>
        <A.AuthTitle>Username found</A.AuthTitle>
        <A.AuthSub>This is the account that matches your recovery answer.</A.AuthSub>
        <A.AuthUsernameReveal>{username}</A.AuthUsernameReveal>
        <A.AuthNav>
          <Link to="/login">Back to sign in</Link>
          {" · "}
          <Link to="/recover">Reset password</Link>
        </A.AuthNav>
      </A.AuthForm>
    );
  }

  return (
    <A.AuthForm onSubmit={onSubmit}>
      <A.AuthEyebrow>Account recovery</A.AuthEyebrow>
      <A.AuthTitle>Recover access</A.AuthTitle>
      <A.AuthSub>
        Answer the question you set up. If it matches one account, we will show
        the username.
      </A.AuthSub>
      <ModeTabs mode="username" onMode={onMode} />
      <RecoveryFields
        question={question}
        answer={answer}
        onQuestion={setQuestion}
        onAnswer={setAnswer}
        autoFocus
      />
      {error && <A.AuthError>{error}</A.AuthError>}
      <AuthSubmit type="submit" disabled={busy || !question}>
        <User size={16} strokeWidth={1.8} />
        {busy ? "Checking…" : "Find username"}
      </AuthSubmit>
      <A.AuthHint>
        Never set a recovery question? An admin can reset your password from
        Users. If you are the only admin, you will need access to the host.
      </A.AuthHint>
      <A.AuthNav>
        <Link to="/login">Back to sign in</Link>
      </A.AuthNav>
    </A.AuthForm>
  );
}

function PasswordForm({ onMode }: { onMode: (mode: Mode) => void }) {
  const [username, setUsername] = useState("");
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recoverPasswordApi(username.trim(), answer, password);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <A.AuthForm as="div">
        <A.AuthEyebrow>Account recovery</A.AuthEyebrow>
        <A.AuthTitle>Password updated</A.AuthTitle>
        <A.AuthOk>
          Sign in with your new password. Existing sessions were signed out.
        </A.AuthOk>
        <A.AuthNav>
          <Link to="/login">Back to sign in</Link>
        </A.AuthNav>
      </A.AuthForm>
    );
  }

  return (
    <A.AuthForm onSubmit={onSubmit}>
      <A.AuthEyebrow>Account recovery</A.AuthEyebrow>
      <A.AuthTitle>Recover access</A.AuthTitle>
      <A.AuthSub>
        Enter your username and recovery answer to choose a new password.
      </A.AuthSub>
      <ModeTabs mode="password" onMode={onMode} />
      <A.AuthField>
        <span>Username</span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
        />
      </A.AuthField>
      <A.AuthField>
        <span>Recovery answer</span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
          minLength={4}
        />
      </A.AuthField>
      <A.AuthField>
        <span>New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </A.AuthField>
      <A.AuthField>
        <span>Confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </A.AuthField>
      {error && <A.AuthError>{error}</A.AuthError>}
      <AuthSubmit type="submit" disabled={busy}>
        <KeyRound size={16} strokeWidth={1.8} />
        {busy ? "Updating…" : "Set new password"}
      </AuthSubmit>
      <A.AuthHint>
        Never set a recovery question? An admin can reset your password from
        Users. If you are the only admin, you will need access to the host.
      </A.AuthHint>
      <A.AuthNav>
        <Link to="/login">Back to sign in</Link>
      </A.AuthNav>
    </A.AuthForm>
  );
}

function ModeTabs({
  mode,
  onMode,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
}) {
  return (
    <A.AuthModes>
      <A.AuthMode
        type="button"
        $active={mode === "password"}
        onClick={() => onMode("password")}
      >
        Password
      </A.AuthMode>
      <A.AuthMode
        type="button"
        $active={mode === "username"}
        onClick={() => onMode("username")}
      >
        Username
      </A.AuthMode>
    </A.AuthModes>
  );
}
