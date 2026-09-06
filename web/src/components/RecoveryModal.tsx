import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  isRecoveryQuestionId,
  type RecoveryQuestionId,
} from "../auth/recoveryQuestions";
import { RecoveryFields } from "./AuthLayout/RecoveryFields";
import {
  AuthError,
  AuthSubmit,
  GhostBtn,
  ModalActions,
  ModalCard,
  ModalClose,
  ModalHead,
  ModalOverlay,
  ModalSub,
} from "./ui/styles";

export function RecoveryModal({ onClose }: { onClose: () => void }) {
  const { user, saveRecovery } = useAuth();
  const initial = isRecoveryQuestionId(user?.recoveryQuestion)
    ? user.recoveryQuestion
    : "";
  const [question, setQuestion] = useState<RecoveryQuestionId | "">(initial);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!question) {
      setError("choose a recovery question");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveRecovery({ question, answer });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClick={onClose} role="presentation">
      <ModalCard as="form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <ModalHead>
          <h3>Account recovery</h3>
          <ModalClose type="button" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </ModalClose>
        </ModalHead>
        <ModalSub>
          {user?.hasRecovery
            ? "Update the question and answer used to recover your username or password from the sign-in screen."
            : "Set a question only you can answer so you can recover your username or password if you forget them."}
        </ModalSub>
        <RecoveryFields
          question={question}
          answer={answer}
          onQuestion={setQuestion}
          onAnswer={setAnswer}
          autoFocus
        />
        {error && <AuthError>{error}</AuthError>}
        <ModalActions>
          <GhostBtn type="button" onClick={onClose}>
            Cancel
          </GhostBtn>
          <AuthSubmit type="submit" $compact disabled={busy}>
            {busy ? "Saving…" : user?.hasRecovery ? "Update" : "Save"}
          </AuthSubmit>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}
