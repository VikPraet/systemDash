import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import * as A from "./AuthLayout/styles";
import { AuthSubmit } from "./ui/styles";

function loginMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const msg = raw.toLowerCase();
  if (msg.includes("invalid username or password")) return "Wrong username or password.";
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Could not reach the host. Try again.";
  }
  return raw || "Could not sign in.";
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Where to land after login: the page the user was bounced from, else overview.
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
    "/overview";

  const name = username.trim();
  const missingName = !name;
  const missingPass = !password;
  const credsError = error === "Wrong username or password.";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (missingName && missingPass) {
      setError("Enter your username and password.");
      return;
    }
    if (missingName) {
      setError("Enter your username.");
      return;
    }
    if (missingPass) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(name, password);
      navigate(from === "/login" ? "/overview" : from, { replace: true });
    } catch (err) {
      setError(loginMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <A.AuthForm onSubmit={onSubmit}>
      <A.AuthEyebrow>Host console</A.AuthEyebrow>
      <A.AuthTitle>Sign in</A.AuthTitle>
      <A.AuthSub>Credentials for this host.</A.AuthSub>

      <A.AuthField $invalid={!!error && (missingName || credsError)}>
        <span>Username</span>
        <input
          type="text"
          autoComplete="username"
          placeholder="your username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (error) setError(null);
          }}
          autoFocus
          aria-invalid={!!error && (missingName || credsError)}
        />
      </A.AuthField>
      <A.AuthField $invalid={!!error && (missingPass || credsError)}>
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          enterKeyHint="go"
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error && (missingPass || credsError)}
        />
      </A.AuthField>

      {error && <A.AuthError>{error}</A.AuthError>}

      <AuthSubmit type="submit" disabled={busy}>
        <LogIn size={16} strokeWidth={1.8} />
        {busy ? "Signing in…" : "Sign in"}
      </AuthSubmit>

      <A.AuthNav>
        <Link to="/recover" state={location.state}>
          Forgot username or password?
        </Link>
      </A.AuthNav>
    </A.AuthForm>
  );
}
