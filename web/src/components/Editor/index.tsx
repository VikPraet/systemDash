import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { keymap, EditorView } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { readTextFile, writeTextFile } from "../../api";
import type { FsEntry } from "../../types";
import {
  Modal,
  ModalActions,
  ModalBtn,
  ModalMessage,
  ModalTitle,
} from "../ui/styles";
import { languageForFile } from "./language";
import { isMarkdownFile, type MarkdownView } from "./markdown";
import { MarkdownPreview } from "./MarkdownPreview";
import { editorHighlight, editorTheme } from "./theme";
import * as S from "./styles";

export type FileEditorMode = "view" | "edit";

type DiscardAction = "close" | "view";

export function FileEditor({
  entry,
  mode,
  canEdit,
  onModeChange,
  onClose,
  onSaved,
}: {
  entry: FsEntry;
  mode: FileEditorMode;
  canEdit: boolean;
  onModeChange: (mode: FileEditorMode) => void;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [discardAction, setDiscardAction] = useState<DiscardAction | null>(null);
  const [editorHeight, setEditorHeight] = useState(0);
  const [markdownView, setMarkdownView] = useState<MarkdownView>("preview");
  const bodyRef = useRef<HTMLDivElement>(null);
  const dirty = content !== original;
  const editing = mode === "edit";
  const isMarkdown = useMemo(() => isMarkdownFile(entry.name), [entry.name]);
  const showPreview = isMarkdown && markdownView === "preview";

  const language = useMemo(() => languageForFile(entry.name), [entry.name]);

  useEffect(() => {
    setMarkdownView("preview");
  }, [entry.path]);

  useEffect(() => {
    if (editing) setMarkdownView("source");
  }, [editing]);

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

  // CodeMirror needs a concrete pixel height; percentage height alone does not
  // constrain the scroller, so long files expand past the panel with no scroll.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || loading) return;
    const measure = () => setEditorHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, showPreview]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!editing || saving || content === original) return true;
    setSaving(true);
    setError(null);
    try {
      await writeTextFile(entry.path, content);
      setOriginal(content);
      setSaved(true);
      onSaved?.();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [content, editing, entry.path, onSaved, original, saving]);

  const finishAction = useCallback(
    (action: DiscardAction) => {
      if (action === "close") onClose();
      else {
        setContent(original);
        onModeChange("view");
      }
    },
    [onClose, onModeChange, original]
  );

  const requestAction = useCallback(
    (action: DiscardAction) => {
      if (editing && dirty) {
        setDiscardAction(action);
        return;
      }
      finishAction(action);
    },
    [dirty, editing, finishAction]
  );

  const requestClose = useCallback(() => requestAction("close"), [requestAction]);
  const switchToView = useCallback(() => requestAction("view"), [requestAction]);

  const switchToEdit = useCallback(() => {
    if (!canEdit) return;
    onModeChange("edit");
  }, [canEdit, onModeChange]);

  const confirmDiscard = useCallback(() => {
    const action = discardAction;
    if (!action) return;
    setDiscardAction(null);
    finishAction(action);
  }, [discardAction, finishAction]);

  const saveAndContinue = useCallback(async () => {
    const action = discardAction;
    if (!action) return;
    const ok = await save();
    if (!ok) return;
    setDiscardAction(null);
    finishAction(action);
  }, [discardAction, finishAction, save]);

  const saveRef = useRef(save);
  const closeRef = useRef(requestClose);
  saveRef.current = save;
  closeRef.current = requestClose;

  const extensions = useMemo(() => {
    const keys = editing
      ? [
          indentWithTab,
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void saveRef.current();
              return true;
            },
          },
          {
            key: "Escape",
            run: () => {
              closeRef.current();
              return true;
            },
          },
        ]
      : [
          {
            key: "Escape",
            run: () => {
              closeRef.current();
              return true;
            },
          },
        ];
    return [
      language.extension,
      editorTheme,
      editorHighlight,
      // Focusable in view mode so mouse-wheel / trackpad scroll works on hover.
      EditorView.contentAttributes.of({ tabindex: "0" }),
      keymap.of(keys),
    ];
  }, [editing, language.extension]);

  const discardMessage =
    discardAction === "view"
      ? "Switch to view mode without saving?"
      : "Close without saving?";

  return (
    <S.EditorOverlay
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <S.EditorPanel onMouseDown={(e) => e.stopPropagation()}>
        <S.EditorHead>
          <S.EditorTitle>
            <S.EditorNameRow>
              <S.EditorName>
                {entry.name}
                {editing && dirty && (
                  <S.EditorDirty title="Unsaved changes"> ●</S.EditorDirty>
                )}
              </S.EditorName>
              {!loading && (
                <>
                  <S.EditorMode $view={!editing}>
                    {editing ? "Edit" : "View"}
                  </S.EditorMode>
                  <S.EditorLang>{language.label}</S.EditorLang>
                </>
              )}
            </S.EditorNameRow>
            <S.EditorPath>{entry.path}</S.EditorPath>
          </S.EditorTitle>
          <S.EditorActions>
            {isMarkdown && (
              <S.MarkdownToggle>
                <button
                  type="button"
                  className={markdownView === "source" ? "active" : ""}
                  onClick={() => setMarkdownView("source")}
                >
                  Source
                </button>
                <button
                  type="button"
                  className={markdownView === "preview" ? "active" : ""}
                  onClick={() => setMarkdownView("preview")}
                >
                  Preview
                </button>
              </S.MarkdownToggle>
            )}
            {editing && saved && !dirty && <S.EditorSaved>Saved</S.EditorSaved>}
            {editing ? (
              <ModalBtn onClick={switchToView}>View</ModalBtn>
            ) : (
              canEdit && (
                <ModalBtn $variant="primary" onClick={switchToEdit}>
                  Edit
                </ModalBtn>
              )
            )}
            {editing && (
              <ModalBtn
                $variant="primary"
                onClick={() => void save()}
                disabled={!dirty || saving || loading}
              >
                {saving ? "Saving…" : "Save"}
              </ModalBtn>
            )}
            <ModalBtn onClick={requestClose}>Close</ModalBtn>
          </S.EditorActions>
        </S.EditorHead>
        {error && <S.EditorError>{error}</S.EditorError>}
        {loading ? (
          <S.EditorMessage>Loading…</S.EditorMessage>
        ) : (
          <S.EditorBody ref={bodyRef} $readOnly={!editing}>
            {showPreview ? (
              <MarkdownPreview content={content} />
            ) : (
              editorHeight > 0 && (
                <CodeMirror
                  value={content}
                  height={`${editorHeight}px`}
                  theme="none"
                  extensions={extensions}
                  editable={editing}
                  readOnly={!editing}
                  onChange={(value) => {
                    if (!editing) return;
                    setContent(value);
                    setSaved(false);
                  }}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    bracketMatching: true,
                    highlightActiveLine: editing,
                    highlightActiveLineGutter: editing,
                    indentOnInput: editing,
                    tabSize: 4,
                    autocompletion: false,
                  }}
                  autoFocus
                />
              )
            )}
          </S.EditorBody>
        )}
      </S.EditorPanel>

      {discardAction && (
        <S.EditorDiscardOverlay
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDiscardAction(null);
          }}
        >
          <Modal
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="editor-discard-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ModalTitle id="editor-discard-title" as="h3">
              Unsaved changes
            </ModalTitle>
            <ModalMessage>
              <strong>{entry.name}</strong> has unsaved changes.{" "}
              {discardMessage}
            </ModalMessage>
            <ModalActions>
              <ModalBtn type="button" onClick={() => setDiscardAction(null)}>
                Keep editing
              </ModalBtn>
              <ModalBtn
                type="button"
                $variant="danger"
                onClick={confirmDiscard}
                disabled={saving}
              >
                Discard
              </ModalBtn>
              <ModalBtn
                type="button"
                $variant="primary"
                onClick={() => void saveAndContinue()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </ModalBtn>
            </ModalActions>
          </Modal>
        </S.EditorDiscardOverlay>
      )}
    </S.EditorOverlay>
  );
}
