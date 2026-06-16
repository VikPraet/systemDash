import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

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
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <span className="brand-dot" />
          <h1>SystemDash</h1>
        </div>
        <h2 className="auth-title">Sign in</h2>
        <p className="auth-sub">Enter your credentials to access the dashboard.</p>

        <label className="auth-field">
          <span>Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-submit" type="submit" disabled={busy}>
          <LogIn size={16} strokeWidth={1.8} />
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
