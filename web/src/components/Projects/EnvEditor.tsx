import { Eye, EyeOff, Plus, X } from "lucide-react";
import type { ProjectEnvVar } from "../../types";
import * as S from "./styles";

export interface EnvDraftRow {
  id?: number;
  key: string;
  value: string;
  secret: boolean;
  kept?: boolean;
}

export function envDraftFrom(env: ProjectEnvVar[] | undefined): EnvDraftRow[] {
  return (env ?? []).map((e) => ({
    id: e.id,
    key: e.key,
    value: e.secret ? "" : e.value ?? "",
    secret: e.secret,
    kept: e.secret,
  }));
}

export function EnvEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: EnvDraftRow[];
  onChange: (rows: EnvDraftRow[]) => void;
  disabled?: boolean;
}) {
  const patch = (i: number, next: Partial<EnvDraftRow>) => {
    onChange(rows.map((row, j) => (j === i ? { ...row, ...next } : row)));
  };
  return (
    <S.Field as="div">
      {rows.length === 0 && (
        <S.FieldHint>
          No variables yet. These are injected into the worker every time it starts.
        </S.FieldHint>
      )}
      {rows.map((row, i) => (
        <S.EnvRow key={row.id ?? `new-${i}`}>
          <input
            value={row.key}
            disabled={disabled}
            placeholder="KEY"
            onChange={(e) => patch(i, { key: e.target.value })}
          />
          <input
            type={row.secret ? "password" : "text"}
            value={row.value}
            disabled={disabled}
            placeholder={row.secret && row.kept && !row.value ? "unchanged" : "value"}
            onChange={(e) => patch(i, { value: e.target.value, kept: false })}
          />
          <S.IconBtn
            type="button"
            disabled={disabled}
            title={row.secret ? "Stored as a secret" : "Stored as plain text"}
            onClick={() => patch(i, { secret: !row.secret })}
          >
            {row.secret ? <EyeOff size={14} /> : <Eye size={14} />}
          </S.IconBtn>
          <S.IconBtn
            type="button"
            $danger
            disabled={disabled}
            title="Remove variable"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <X size={14} />
          </S.IconBtn>
        </S.EnvRow>
      ))}
      <div>
        <S.Btn
          type="button"
          disabled={disabled}
          onClick={() => onChange([...rows, { key: "", value: "", secret: false }])}
        >
          <Plus size={14} />
          Add variable
        </S.Btn>
      </div>
      {rows.some((r) => r.secret) && (
        <S.FieldHint>
          Secrets stay masked after save. Leave the value blank to keep the stored one.
        </S.FieldHint>
      )}
    </S.Field>
  );
}
