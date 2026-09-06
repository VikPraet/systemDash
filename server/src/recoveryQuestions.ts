// Keep IDs in sync with web/src/auth/recoveryQuestions.ts
export const RECOVERY_QUESTIONS = [
  { id: "pet", label: "Name of your first pet" },
  { id: "city", label: "City you grew up in" },
  { id: "school", label: "Name of the first school you attended" },
  { id: "machine", label: "Nickname of your first computer" },
  { id: "street", label: "Street you grew up on" },
] as const;

export type RecoveryQuestionId = (typeof RECOVERY_QUESTIONS)[number]["id"];

export function isRecoveryQuestionId(value: unknown): value is RecoveryQuestionId {
  return (
    typeof value === "string" &&
    RECOVERY_QUESTIONS.some((q) => q.id === value)
  );
}

/** Answers are compared case-insensitively with collapsed whitespace. */
export function normalizeRecoveryAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}
