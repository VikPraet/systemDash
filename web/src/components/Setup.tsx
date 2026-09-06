import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { RecoveryQuestionId } from "../auth/recoveryQuestions";
import { AuthLayout } from "./AuthLayout";
import { RecoveryFields } from "./AuthLayout/RecoveryFields";
import * as A from "./AuthLayout/styles";
import { AuthSubmit } from "./ui/styles";

export function Setup() {
  const { setup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [question, setQuestion] = useState<RecoveryQuestionId | "">("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("passwords do not match");
      return;
    }
    if (!question) {
      setError("choose a recovery question");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setup(username.trim(), password, { question, answer });
      navigate("/overview", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <A.AuthForm onSubmit={onSubmit}>
        <A.AuthEyebrow>First run</A.AuthEyebrow>
        <A.AuthTitle>Create admin</A.AuthTitle>
        <A.AuthSub>
          This is the first run. The account you create here is the
          administrator and can manage all other users.
        </A.AuthSub>

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
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
          />
        </A.AuthField>
        <RecoveryFields
          question={question}
          answer={answer}
          onQuestion={setQuestion}
          onAnswer={setAnswer}
        />
        <A.AuthHint>
          Use at least 8 characters. Username may use letters, numbers, dot, dash
          and underscore (3-32 chars). The recovery question lets you get back in
          if you forget your username or password — pick an answer only you know.
        </A.AuthHint>

        {error && <A.AuthError>{error}</A.AuthError>}

        <AuthSubmit type="submit" disabled={busy}>
          <ShieldCheck size={16} strokeWidth={1.8} />
          {busy ? "Creating…" : "Create admin & continue"}
        </AuthSubmit>
      </A.AuthForm>
    </AuthLayout>
  );
}
