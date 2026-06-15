import { useEffect, useRef, useState } from "react";
import { readTextFile, writeTextFile } from "../api";
import type { FsEntry } from "../types";

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
    <div className="editor-overlay">
      <div className="editor">
        <div className="editor-head">
          <div className="editor-title">
            <span className="editor-name">
              {entry.name}
              {dirty && (
                <span className="editor-dirty" title="Unsaved changes">
                  {" "}
                  ●
                </span>
              )}
            </span>
            <span className="editor-path muted">{entry.path}</span>
          </div>
          <div className="editor-actions">
            {saved && !dirty && <span className="editor-saved muted">Saved</span>}
            <button
              className="modal-btn primary"
              onClick={save}
              disabled={!dirty || saving || loading}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="modal-btn" onClick={requestClose}>
              Close
            </button>
          </div>
        </div>
        {error && <div className="editor-error">{error}</div>}
        {loading ? (
          <div className="files-message muted">Loading…</div>
        ) : (
          <textarea
            ref={taRef}
            className="editor-area"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSaved(false);
            }}
            spellCheck={false}
            autoFocus
          />
        )}
      </div>
    </div>
  );
}
