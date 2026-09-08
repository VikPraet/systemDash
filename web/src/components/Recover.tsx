import { useState, type FormEvent } from "react";
import { KeyRound, User } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { recoverPasswordApi, recoverUsernameApi } from "../api";
import type { RecoveryQuestionId } from "../auth/recoveryQuestions";
import { RecoveryFields } from "./AuthLayout/RecoveryFields";
import * as A from "./AuthLayout/styles";
import { AuthSubmit } from "./ui/styles";

type Mode = "password" | "username";

export function Recover() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const mode: Mode = params.get("for") === "username" ? "username" : "password";

  function setMode(next: Mode) {
    const nextParams = new URLSearchParams(params);
    if (next === "username") nextParams.set("for", "username");
    else nextParams.delete("for");
    setParams(nextParams, { replace: true });
  }

  return mode === "username" ? (
    <UsernameForm onMode={setMode} backState={location.state} />
  ) : (
    <PasswordForm onMode={setMode} backState={location.state} />
  );
}

function UsernameForm({
  onMode,
  backState,
}: {
  onMode: (mode: Mode) => void;
  backState: unknown;
}) {
  const [question, setQuestion] = useState<RecoveryQuestionId | "">("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!question) {
      setError("Choose a recovery question.");
      return;
    }
    if (answer.trim().length < 4) {
      setError("Recovery answer must be at least 4 characters.");
      return;
    }
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
          <Link to="/login" state={backState}>
            Back to sign in
          </Link>
          {" · "}
          <button type="button" onClick={() => onMode("password")}>
            Reset password
          </button>
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
        onQuestion={(id) => {
          setQuestion(id);
          if (error) setError(null);
        }}
        onAnswer={(value) => {
          setAnswer(value);
          if (error) setError(null);
        }}
        autoFocus
      />
      {error && <A.AuthError>{error}</A.AuthError>}
      <AuthSubmit type="submit" disabled={busy}>
        <User size={16} strokeWidth={1.8} />
        {busy ? "Checking…" : "Find username"}
      </AuthSubmit>
      <A.AuthHint>
        Never set a recovery question? An admin can reset your password from
        Users. If you are the only admin, you will need access to the host.
      </A.AuthHint>
      <A.AuthNav>
        <Link to="/login" state={backState}>
          Back to sign in
        </Link>
      </A.AuthNav>
    </A.AuthForm>
  );
}

function PasswordForm({
  onMode,
  backState,
}: {
  onMode: (mode: Mode) => void;
  backState: unknown;
}) {
  const [username, setUsername] = useState("");
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const name = username.trim();
    if (!name) {
      setError("Enter your username.");
      return;
    }
    if (answer.trim().length < 4) {
      setError("Recovery answer must be at least 4 characters.");
      return;
    }
    if (!password) {
      setError("Enter a new password.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recoverPasswordApi(name, answer, password);
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
          <Link to="/login" state={backState}>
          Back to sign in
        </Link>
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
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          autoFocus
        />
      </A.AuthField>
      <A.AuthField>
        <span>Recovery answer</span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            if (error) setError(null);
          }}
        />
      </A.AuthField>
      <A.AuthField>
        <span>New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
        />
      </A.AuthField>
      <A.AuthField>
        <span>Confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (error) setError(null);
          }}
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
        <Link to="/login" state={backState}>
          Back to sign in
        </Link>
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
