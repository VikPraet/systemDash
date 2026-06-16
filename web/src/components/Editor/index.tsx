import { useEffect, useRef, useState } from "react";
import { readTextFile, writeTextFile } from "../../api";
import type { FsEntry } from "../../types";
import { ModalBtn } from "../ui/styles";
import * as S from "./styles";

export function FileEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: FsEntry;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const dirty = content !== original;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    readTextFile(entry.path)
      .then((r) => {
        if (!cancelled) {
          setContent(r.content);
          setOriginal(r.content);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [entry.path]);

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await writeTextFile(entry.path, content);
      setOriginal(content);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }

  // Bind Ctrl/Cmd+S to save and Esc to close. No dep array: re-bind each render
  // so the handlers always see the latest content/dirty state.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape") {
        requestClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <S.EditorOverlay>
      <S.EditorPanel>
        <S.EditorHead>
          <S.EditorTitle>
            <S.EditorName>
              {entry.name}
              {dirty && (
                <S.EditorDirty title="Unsaved changes"> ●</S.EditorDirty>
              )}
            </S.EditorName>
            <S.EditorPath>{entry.path}</S.EditorPath>
          </S.EditorTitle>
          <S.EditorActions>
            {saved && !dirty && <S.EditorSaved>Saved</S.EditorSaved>}
            <ModalBtn
              $variant="primary"
              onClick={save}
              disabled={!dirty || saving || loading}
            >
              {saving ? "Saving…" : "Save"}
            </ModalBtn>
            <ModalBtn onClick={requestClose}>Close</ModalBtn>
          </S.EditorActions>
        </S.EditorHead>
        {error && <S.EditorError>{error}</S.EditorError>}
        {loading ? (
          <S.EditorMessage>Loading…</S.EditorMessage>
        ) : (
          <S.EditorArea
            ref={taRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSaved(false);
            }}
            spellCheck={false}
            autoFocus
          />
        )}
      </S.EditorPanel>
    </S.EditorOverlay>
  );
}
