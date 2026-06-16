import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  copyEntry,
  createFile,
  createFolder,
  deleteEntry,
  downloadUrl,
  fetchDirSize,
  fetchListing,
  fetchRoots,
  fetchSettings,
  formatBytes,
  formatDate,
  moveEntry,
  renameEntry,
  saveSettings,
  uploadFile,
} from "../../api";
import type {
  DirListing,
  FileManagerSettings,
  FsEntry,
  FsRoot,
  Settings,
} from "../../types";
import { cache, type DirSize } from "../../cache";
import { Bar } from "../widgets";
import { FileEditor, type FileEditorMode } from "../Editor";
import { useAuth, hasRole } from "../../auth/AuthContext";
import {
  Modal,
  ModalActions,
  ModalBtn,
  ModalError,
  ModalInput,
  ModalLabel,
  ModalMessage,
  ModalOverlay,
  ModalTitle,
} from "../ui/styles";
import * as S from "./styles";

// `null` path = the "This PC" overview that lists drives.
type Path = string | null;

type Dialog =
  | { kind: "newFolder" }
  | { kind: "newFile" }
  | { kind: "rename"; entry: FsEntry }
  | { kind: "delete"; entry: FsEntry }
  | null;

const SIZE_CONCURRENCY = 4;

export function Files() {
  const { user } = useAuth();
  // Viewers get read-only access: browse, open folders, preview/download. All
  // mutating controls are hidden (the server also enforces this with 403s).
  const canWrite = hasRole(user, "user");
  const [roots, setRoots] = useState<FsRoot[]>(() => cache.files.roots);
  const [path, setPath] = useState<Path>(() => cache.files.path);
  const [listing, setListing] = useState<DirListing | null>(
    () => cache.files.listing
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [dirSizes, setDirSizes] = useState<Record<string, DirSize>>(
    () => cache.files.dirSizes
  );
  const [clipboard, setClipboard] = useState<{
    entry: FsEntry;
    op: "cut" | "copy";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ name: string; frac: number } | null>(
    null
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [settings, setSettings] = useState<Settings>(() => cache.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filePanel, setFilePanel] = useState<{
    entry: FsEntry;
    mode: FileEditorMode;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((s) => {
        if (!cancelled) {
          cache.settings = s;
          setSettings(s);
        }
      })
      .catch(() => {
        // Keep cached/default settings if the request fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the current path in the cache so we return to the same folder.
  useEffect(() => {
    cache.files.path = path;
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    fetchRoots()
      .then((r) => {
        if (!cancelled) {
          cache.files.roots = r;
          setRoots(r);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (path === null) {
      setListing(null);
      cache.files.listing = null;
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    // Only show the loader when there's nothing to display yet; if we already
    // have this folder cached we keep showing it while refreshing.
    setLoading(true);
    setError(null);
    setQuery("");
    fetchListing(path, ctrl.signal)
      .then((l) => {
        if (!cancelled) {
          cache.files.listing = l;
          setListing(l);
        }
      })
      .catch((e) => {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [path]);

  // After a listing loads, compute folder sizes in the background (bounded
  // concurrency) and fill them in as each completes. Sizes are cached per
  // listing so revisiting a folder doesn't recompute everything from scratch.
  useEffect(() => {
    if (!listing || !settings.files.showFolderSizes) {
      setDirSizes({});
      cache.files.dirSizes = {};
      cache.files.dirSizesPath = null;
      return;
    }
    const dirs = listing.entries.filter((e) => e.type === "dir");

    // Reuse already-computed sizes for this exact listing; only (re)compute the
    // ones that are missing or were still loading when we last left.
    const reuse = cache.files.dirSizesPath === listing.path;
    const sizes: Record<string, DirSize> = reuse
      ? { ...cache.files.dirSizes }
      : {};
    const pending = dirs.filter((d) => {
      const s = sizes[d.path];
      return !s || s.state === "loading";
    });
    for (const d of pending) sizes[d.path] = { state: "loading" };
    cache.files.dirSizes = sizes;
    cache.files.dirSizesPath = listing.path;
    setDirSizes(sizes);

    if (pending.length === 0) return;

    let cancelled = false;
    const ctrl = new AbortController();
    let next = 0;

    function store(path: string, val: DirSize) {
      cache.files.dirSizes = { ...cache.files.dirSizes, [path]: val };
      setDirSizes(cache.files.dirSizes);
    }

    async function worker() {
      while (!cancelled && next < pending.length) {
        const entry = pending[next++];
        try {
          const r = await fetchDirSize(entry.path, ctrl.signal);
          if (!cancelled) {
            store(entry.path, { state: "done", bytes: r.bytes, partial: r.partial });
          }
        } catch (e) {
          if (!cancelled && (e as Error).name !== "AbortError") {
            store(entry.path, { state: "error" });
          }
        }
      }
    }

    for (let i = 0; i < Math.min(SIZE_CONCURRENCY, pending.length); i++) worker();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [listing, settings.files.showFolderSizes]);

  const homePath = useMemo(
    () => roots.find((r) => r.kind === "home")?.path ?? null,
    [roots]
  );
  const drives = useMemo(
    () => roots.filter((r) => r.kind === "drive" || r.kind === "root"),
    [roots]
  );

  const crumbs = useMemo(
    () => (path && listing ? breadcrumbs(listing.path) : []),
    [path, listing]
  );

  const entries = useMemo(() => {
    if (!listing) return [];
    let list = listing.entries;
    if (!settings.files.showHiddenFiles) {
      list = list.filter((e) => !isHidden(e.name));
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    return list;
  }, [listing, query, settings.files.showHiddenFiles]);

  function goUp() {
    if (listing?.parent) setPath(listing.parent);
    else setPath(null);
  }

  // Re-fetches the current folder after a mutation, without the navigation
  // loader flash (we already have content on screen).
  const reload = useCallback(async () => {
    if (path === null) return;
    try {
      const l = await fetchListing(path);
      cache.files.listing = l;
      setListing(l);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }, [path]);

  // Runs a mutation, surfaces any error, and refreshes the listing on success.
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Runs a mutation for the dialogs: refreshes on success and returns an error
  // message (or null) so the dialog can show it inline and stay open.
  async function doMutation(fn: () => Promise<unknown>): Promise<string | null> {
    try {
      await fn();
      await reload();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  function handleNewFolder() {
    if (path !== null) setDialog({ kind: "newFolder" });
  }

  function handleNewFile() {
    if (path !== null) setDialog({ kind: "newFile" });
  }

  function handleRename(e: FsEntry) {
    setDialog({ kind: "rename", entry: e });
  }

  function handleDelete(e: FsEntry) {
    if (!settings.files.confirmDelete) {
      void doMutation(() => deleteEntry(e.path)).then((err) => {
        if (err) setActionError(err);
        else if (clipboard?.entry.path === e.path) setClipboard(null);
      });
      return;
    }
    setDialog({ kind: "delete", entry: e });
  }

  async function handlePaste() {
    if (path === null || !clipboard) return;
    const { entry, op } = clipboard;
    const ok = await run(() =>
      op === "cut" ? moveEntry(entry.path, path) : copyEntry(entry.path, path)
    );
    if (ok && op === "cut") setClipboard(null);
  }

  async function handleFilesSelected(
    ev: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = ev.target.files;
    if (!files || files.length === 0 || path === null) return;
    setBusy(true);
    setActionError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(path, file, (frac) =>
          setUpload({ name: file.name, frac })
        );
      }
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
      setUpload(null);
      ev.target.value = "";
    }
  }

  const atThisPc = path === null;

  return (
    <S.FilesRoot>
      <S.FilesToolbar>
        <S.FilesRoots>
          <button className={atThisPc ? "active" : ""} onClick={() => setPath(null)}>
            <PcIcon />
            This PC
          </button>
          {homePath && (
            <button
              className={listing?.path === homePath ? "active" : ""}
              onClick={() => setPath(homePath)}
            >
              <HomeIcon />
              Home
            </button>
          )}
        </S.FilesRoots>
        {!atThisPc && (
          <S.FilesSearch
            type="text"
            placeholder="Filter in this folder…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {canWrite && (
          <S.FilesSettingsBtn
            title="File manager settings"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
            Settings
          </S.FilesSettingsBtn>
        )}
      </S.FilesToolbar>

      <S.FilesNav>
        <S.FilesUp disabled={atThisPc} onClick={goUp} title="Up one level">
          ↑
        </S.FilesUp>
        <S.Crumbs>
          <S.Crumb>
            <button onClick={() => setPath(null)}>This PC</button>
          </S.Crumb>
          {crumbs.map((c) => (
            <S.Crumb key={c.path}>
              <span className="crumb-sep">/</span>
              <button onClick={() => setPath(c.path)}>{c.label}</button>
            </S.Crumb>
          ))}
        </S.Crumbs>
      </S.FilesNav>

      {!atThisPc && canWrite && (
        <S.FilesActions>
          <button onClick={handleNewFolder} disabled={busy}>
            <PlusIcon /> New folder
          </button>
          <button onClick={handleNewFile} disabled={busy}>
            <PlusIcon /> New file
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <UploadIcon /> Upload
          </button>
          {clipboard && (
            <button className="paste" onClick={handlePaste} disabled={busy}>
              <PasteIcon />
              Paste {clipboard.op === "cut" ? "(move)" : "(copy)"} “
              {clipboard.entry.name}”
            </button>
          )}
          <S.FilesActionsStatus>
            {upload && (
              <span className="muted">
                Uploading {upload.name}… {Math.round(upload.frac * 100)}%
              </span>
            )}
            {actionError && <span className="bad">{actionError}</span>}
          </S.FilesActionsStatus>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={handleFilesSelected}
          />
        </S.FilesActions>
      )}

      <S.FilesBody>
        {atThisPc ? (
          <ThisPc drives={drives} onOpen={setPath} />
        ) : error ? (
          <S.FilesMessage $bad>{error}</S.FilesMessage>
        ) : loading && !listing ? (
          <S.FilesMessage className="muted">Loading…</S.FilesMessage>
        ) : (
          <S.FilesTable>
            <thead>
              <tr>
                <th>Name</th>
                <th className="ta-right">Size</th>
                <th className="ta-right">Modified</th>
                <th className="ta-right"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <FileRow
                  key={e.path}
                  e={e}
                  dirSize={e.type === "dir" ? dirSizes[e.path] : undefined}
                  busy={busy}
                  canWrite={canWrite}
                  cut={clipboard?.op === "cut" && clipboard.entry.path === e.path}
                  showExtensions={settings.files.showFileExtensions}
                  showFolderSizes={settings.files.showFolderSizes}
                  onOpen={() => setPath(e.path)}
                  onView={() => setFilePanel({ entry: e, mode: "view" })}
                  onEdit={() => setFilePanel({ entry: e, mode: "edit" })}
                  onRename={() => handleRename(e)}
                  onDelete={() => handleDelete(e)}
                  onCut={() => setClipboard({ entry: e, op: "cut" })}
                  onCopy={() => setClipboard({ entry: e, op: "copy" })}
                />
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted proc-empty">
                    {listing && listing.entries.length > 0
                      ? "No matching items."
                      : "This folder is empty."}
                  </td>
                </tr>
              )}
            </tbody>
          </S.FilesTable>
        )}
      </S.FilesBody>

      {dialog?.kind === "newFolder" && (
        <PromptDialog
          title="New folder"
          label="Folder name"
          confirmLabel="Create"
          onCancel={() => setDialog(null)}
          onSubmit={async (name) => {
            if (path === null) return "No folder selected";
            const err = await doMutation(() => createFolder(path, name));
            if (!err) setDialog(null);
            return err;
          }}
        />
      )}

      {dialog?.kind === "newFile" && (
        <PromptDialog
          title="New file"
          label="File name"
          initial="New File.txt"
          confirmLabel="Create"
          onCancel={() => setDialog(null)}
          onSubmit={async (name) => {
            if (path === null) return "No folder selected";
            const err = await doMutation(() => createFile(path, name));
            if (!err) setDialog(null);
            return err;
          }}
        />
      )}

      {dialog?.kind === "rename" && (
        <PromptDialog
          title="Rename"
          label="New name"
          initial={dialog.entry.name}
          confirmLabel="Rename"
          onCancel={() => setDialog(null)}
          onSubmit={async (name) => {
            const entry = dialog.entry;
            if (name === entry.name) {
              setDialog(null);
              return null;
            }
            const err = await doMutation(() => renameEntry(entry.path, name));
            if (!err) setDialog(null);
            return err;
          }}
        />
      )}

      {filePanel && (
        <FileEditor
          entry={filePanel.entry}
          mode={filePanel.mode}
          canEdit={canWrite}
          onModeChange={(mode) =>
            setFilePanel((prev) => (prev ? { ...prev, mode } : null))
          }
          onClose={() => setFilePanel(null)}
          onSaved={reload}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onCancel={() => setSettingsOpen(false)}
          onSaved={(s) => {
            cache.settings = s;
            setSettings(s);
            setSettingsOpen(false);
          }}
        />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.entry.type === "dir" ? "folder" : "file"}?`}
          message={
            <>
              Are you sure you want to delete <strong>{dialog.entry.name}</strong>?
              {dialog.entry.type === "dir" && (
                <span className="modal-warn">
                  {" "}
                  This permanently deletes everything inside it.
                </span>
              )}
            </>
          }
          confirmLabel="Delete"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const entry = dialog.entry;
            const err = await doMutation(() => deleteEntry(entry.path));
            if (!err) {
              if (clipboard?.entry.path === entry.path) setClipboard(null);
              setDialog(null);
            }
            return err;
          }}
        />
      )}
    </S.FilesRoot>
  );
}

function ThisPc({
  drives,
  onOpen,
}: {
  drives: FsRoot[];
  onOpen: (path: string) => void;
}) {
  if (drives.length === 0) {
    return <S.FilesMessage className="muted">Loading drives…</S.FilesMessage>;
  }
  return (
    <S.Drives>
      {drives.map((d) => (
        <S.DriveCard key={d.path} onClick={() => onOpen(d.path)}>
          <S.DriveCardHead>
            <DriveIcon />
            <S.DriveName>
              {d.name}
              {d.label && <span className="drive-label muted"> {d.label}</span>}
            </S.DriveName>
          </S.DriveCardHead>
          {d.sizeBytes ? (
            <>
              <Bar value={d.usedPercent ?? 0} />
              <S.DriveMeta className="muted">
                {formatBytes(d.freeBytes ?? 0)} free of {formatBytes(d.sizeBytes)}
              </S.DriveMeta>
            </>
          ) : (
            <S.DriveMeta className="muted">{d.path}</S.DriveMeta>
          )}
        </S.DriveCard>
      ))}
    </S.Drives>
  );
}

function FileRow({
  e,
  dirSize,
  busy,
  canWrite,
  cut,
  showExtensions,
  showFolderSizes,
  onOpen,
  onView,
  onEdit,
  onRename,
  onDelete,
  onCut,
  onCopy,
}: {
  e: FsEntry;
  dirSize?: DirSize;
  busy: boolean;
  canWrite: boolean;
  cut: boolean;
  showExtensions: boolean;
  showFolderSizes: boolean;
  onOpen: () => void;
  onView: () => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCut: () => void;
  onCopy: () => void;
}) {
  const isDir = e.type === "dir";
  const label = showExtensions ? e.name : displayName(e);
  return (
    <tr className={`${isDir ? "row-dir" : ""}${cut ? " row-cut" : ""}`}>
      <td>
        <button
          className="file-name"
          onClick={isDir ? onOpen : onView}
          title={isDir ? undefined : "View file"}
        >
          {isDir ? <FolderIcon /> : <FileIcon ext={e.ext} />}
          <span className="file-label" title={e.name}>
            {label}
          </span>
        </button>
      </td>
      <td className="ta-right muted">
        {isDir ? (
          showFolderSizes ? (
            <DirSizeCell size={dirSize} />
          ) : (
            "—"
          )
        ) : (
          formatBytes(e.size ?? 0)
        )}
      </td>
      <td className="ta-right muted">{formatDate(e.modifiedMs)}</td>
      <td className="ta-right">
        <div className="row-actions">
          {!isDir && (
            <button
              className="row-act"
              title="View"
              onClick={onView}
              disabled={busy}
            >
              <EyeIcon />
            </button>
          )}
          {!isDir && canWrite && (
            <button
              className="row-act"
              title="Edit"
              onClick={onEdit}
              disabled={busy}
            >
              <EditIcon />
            </button>
          )}
          {!isDir && (
            <a
              className="row-act"
              href={downloadUrl(e.path)}
              title="Download"
              download
            >
              <DownloadIcon />
            </a>
          )}
          {canWrite && (
            <>
              <button
                className="row-act"
                title="Rename"
                onClick={onRename}
                disabled={busy}
              >
                <PencilIcon />
              </button>
              <button
                className="row-act"
                title="Copy"
                onClick={onCopy}
                disabled={busy}
              >
                <CopyIcon />
              </button>
              <button
                className="row-act"
                title="Cut (move)"
                onClick={onCut}
                disabled={busy}
              >
                <CutIcon />
              </button>
              <button
                className="row-act danger"
                title="Delete"
                onClick={onDelete}
                disabled={busy}
              >
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function DirSizeCell({ size }: { size?: DirSize }) {
  if (!size || size.state === "loading") {
    return <span className="size-loading" title="Calculating…" />;
  }
  if (size.state === "error") return <>—</>;
  if (size.bytes === 0) return <>—</>;
  return (
    <>
      {size.partial ? "≥ " : ""}
      {formatBytes(size.bytes)}
    </>
  );
}

function ModalShell({
  onCancel,
  children,
}: {
  onCancel: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <ModalOverlay
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <Modal role="dialog" aria-modal="true">
        {children}
      </Modal>
    </ModalOverlay>
  );
}

function PromptDialog({
  title,
  label,
  initial,
  confirmLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  onCancel: () => void;
  // Returns an error message to display, or null on success (parent closes).
  onSubmit: (value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Pre-select the name (minus extension for files) for quick renaming.
    const dot = el.value.lastIndexOf(".");
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit(v);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <ModalShell onCancel={onCancel}>
      <form onSubmit={submit}>
        <ModalTitle as="h3">{title}</ModalTitle>
        <ModalLabel>{label}</ModalLabel>
        <ModalInput
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        {error && <ModalError>{error}</ModalError>}
        <ModalActions>
          <ModalBtn type="button" onClick={onCancel}>
            Cancel
          </ModalBtn>
          <ModalBtn
            type="submit"
            $variant="primary"
            disabled={!value.trim() || busy}
          >
            {busy ? "Working…" : confirmLabel}
          </ModalBtn>
        </ModalActions>
      </form>
    </ModalShell>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm();
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <ModalShell onCancel={onCancel}>
      <ModalTitle as="h3">{title}</ModalTitle>
      <ModalMessage>{message}</ModalMessage>
      {error && <ModalError>{error}</ModalError>}
      <ModalActions>
        <ModalBtn type="button" onClick={onCancel}>
          Cancel
        </ModalBtn>
        <ModalBtn
          type="button"
          $variant={danger ? "danger" : "primary"}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? "Working…" : confirmLabel}
        </ModalBtn>
      </ModalActions>
    </ModalShell>
  );
}

function SettingsDialog({
  settings,
  onCancel,
  onSaved,
}: {
  settings: Settings;
  onCancel: () => void;
  onSaved: (s: Settings) => void;
}) {
  const [files, setFiles] = useState<FileManagerSettings>(settings.files);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: keyof FileManagerSettings) {
    setFiles((f) => ({ ...f, [key]: !f[key] }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveSettings({ ...settings, files });
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <ModalShell onCancel={onCancel}>
      <ModalTitle as="h3">File manager settings</ModalTitle>
      <S.SettingsList>
        <ToggleRow
          label="Show file extensions"
          desc="Display the .ext suffix on file names."
          checked={files.showFileExtensions}
          onChange={() => toggle("showFileExtensions")}
        />
        <ToggleRow
          label="Show hidden files"
          desc="Include dotfiles and hidden entries."
          checked={files.showHiddenFiles}
          onChange={() => toggle("showHiddenFiles")}
        />
        <ToggleRow
          label="Calculate folder sizes"
          desc="Compute folder sizes in the background (slower on large trees)."
          checked={files.showFolderSizes}
          onChange={() => toggle("showFolderSizes")}
        />
        <ToggleRow
          label="Confirm before deleting"
          desc="Ask before deleting files or folders."
          checked={files.confirmDelete}
          onChange={() => toggle("confirmDelete")}
        />
      </S.SettingsList>
      {error && <ModalError>{error}</ModalError>}
      <ModalActions>
        <ModalBtn type="button" onClick={onCancel}>
          Cancel
        </ModalBtn>
        <ModalBtn type="button" $variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </ModalBtn>
      </ModalActions>
    </ModalShell>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <S.ToggleRow
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
    >
      <S.ToggleText>
        <S.ToggleLabel>{label}</S.ToggleLabel>
        <S.ToggleDesc>{desc}</S.ToggleDesc>
      </S.ToggleText>
      <S.Switch $on={checked}>
        <S.SwitchKnob $on={checked} />
      </S.Switch>
    </S.ToggleRow>
  );
}

/** Whether an entry is treated as hidden (dotfile) for the show-hidden toggle. */
function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/** A file's name with its final extension stripped (for "hide extensions"). */
function displayName(e: FsEntry): string {
  if (e.type === "dir" || !e.ext) return e.name;
  const dot = e.name.lastIndexOf(".");
  return dot > 0 ? e.name.slice(0, dot) : e.name;
}

function GearIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4z" />
    </svg>
  );
}

function breadcrumbs(p: string): { label: string; path: string }[] {
  const isWin = p.includes("\\");
  if (isWin) {
    const parts = p.split(/\\+/).filter(Boolean);
    const crumbs: { label: string; path: string }[] = [];
    let acc = "";
    parts.forEach((part, i) => {
      acc = i === 0 ? `${part}\\` : `${acc.replace(/\\$/, "")}\\${part}`;
      crumbs.push({ label: part, path: acc });
    });
    return crumbs;
  }
  const parts = p.split("/").filter(Boolean);
  const crumbs = [{ label: "/", path: "/" }];
  let acc = "";
  parts.forEach((part) => {
    acc += `/${part}`;
    crumbs.push({ label: part, path: acc });
  });
  return crumbs;
}

function FolderIcon() {
  return (
    <svg className="ficon folder" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
    </svg>
  );
}

function FileIcon({ ext }: { ext: string | null }) {
  return (
    <svg className="ficon file" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      {ext && (
        <text x="12" y="16" textAnchor="middle" className="ficon-ext">
          {ext.slice(0, 3)}
        </text>
      )}
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <circle cx="17" cy="12" r="1.2" />
    </svg>
  );
}

function PcIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    </svg>
  );
}

function PasteIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 4h6v3H9zM7 5H5v15h14V5h-2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 20h16M6 16l9-9 3 3-9 9H6v-3z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5a1 1 0 0 1 1-1h9" />
    </svg>
  );
}

function CutIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 8l12 8M8 16L20 8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}
