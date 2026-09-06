import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthLayout } from "./AuthLayout";
import * as A from "./AuthLayout/styles";
import { AuthSubmit } from "./ui/styles";

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from === "/login" ? "/overview" : from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <A.AuthForm onSubmit={onSubmit}>
        <A.AuthEyebrow>Secure access</A.AuthEyebrow>
        <A.AuthTitle>Sign in</A.AuthTitle>
        <A.AuthSub>Enter your credentials to access the dashboard.</A.AuthSub>

        <A.AuthField>
          <span>Username</span>
          <input
            type="text"
            autoComplete="username"
            placeholder="your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </A.AuthField>
        <A.AuthField>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </A.AuthField>

        {error && <A.AuthError>{error}</A.AuthError>}

        <AuthSubmit type="submit" disabled={busy}>
          <LogIn size={16} strokeWidth={1.8} />
          {busy ? "Signing in…" : "Sign in"}
        </AuthSubmit>

        <A.AuthNav>
          <Link to="/recover">Forgot username or password?</Link>
        </A.AuthNav>
      </A.AuthForm>
    </AuthLayout>
  );
}
