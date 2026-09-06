import { RECOVERY_QUESTIONS, type RecoveryQuestionId } from "../../auth/recoveryQuestions";
import { Dropdown } from "../Dropdown";
import * as A from "./styles";

const QUESTION_OPTIONS = RECOVERY_QUESTIONS.map((q) => ({
  value: q.id,
  label: q.label,
}));

export function RecoveryFields({
  question,
  answer,
  onQuestion,
  onAnswer,
  autoFocus,
}: {
  question: RecoveryQuestionId | "";
  answer: string;
  onQuestion: (id: RecoveryQuestionId) => void;
  onAnswer: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <A.AuthField>
        <span>Recovery question</span>
        <Dropdown
          value={question}
          options={QUESTION_OPTIONS}
          onChange={onQuestion}
          placeholder="Choose a question"
          ariaLabel="Recovery question"
          variant="underline"
          autoFocus={autoFocus}
        />
      </A.AuthField>
      <A.AuthField>
        <span>Recovery answer</span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="something only you would know"
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
          required
          minLength={4}
        />
      </A.AuthField>
    </>
  );
}
