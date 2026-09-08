import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  fetchShares,
  formatBytes,
  formatDate,
  addNetworkShare,
  connectNetworkShare,
  removeNetworkShare,
  moveEntry,
  renameEntry,
  saveSettings,
  uploadFile,
  fetchTrash,
  restoreTrashItem,
  purgeTrashItem,
  emptyTrash,
} from "../../api";
import type {
  DirListing,
  FileManagerSettings,
  FsEntry,
  FsRoot,
  Settings,
  ShareProtocol,
  SharesStatus,
  TrashItem,
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
import { Tooltip } from "../ui/Tooltip";
import { DiskMap, type DiskMapHandle } from "./DiskMap";
import { DashboardGrid } from "../dashboard/DashboardGrid";
import { packDefaults } from "../dashboard/grid";
import * as S from "./styles";

// `null` path = the "This PC" overview that lists drives.
type Path = string | null;

type Dialog =
  | { kind: "newFolder" }
  | { kind: "newFile" }
  | { kind: "rename"; entry: FsEntry }
  | { kind: "delete"; entry: FsEntry }
  | { kind: "deleteForever"; item: TrashItem }
  | { kind: "emptyTrash" }
  | { kind: "addShare" }
  | { kind: "removeShare"; root: FsRoot }
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
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [settings, setSettings] = useState<Settings>(() => cache.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filePanel, setFilePanel] = useState<{
    entry: FsEntry;
    mode: FileEditorMode;
  } | null>(null);
  const [view, setView] = useState<"list" | "map">(() => cache.files.view);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<DiskMapHandle>(null);

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
    cache.files.view = view;
  }, [view]);

  const reloadRoots = useCallback(async () => {
    const r = await fetchRoots();
    cache.files.roots = r;
    setRoots(r);
    return r;
  }, []);

  useEffect(() => {
    let cancelled = false;
    reloadRoots().catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [reloadRoots]);

  useEffect(() => {
    if (path === null) {
      setListing(null);
      cache.files.listing = null;
      setTrashItems([]);
      return;
    }
    const trash = roots.find((r) => r.kind === "trash");
    const viewingTrash = !!(trash && path === trash.path);
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setQuery("");
    if (viewingTrash) {
      setListing(null);
      cache.files.listing = null;
      fetchTrash(ctrl.signal)
        .then((items) => {
          if (!cancelled) setTrashItems(items);
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
    }
    setTrashItems([]);
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
  }, [path, roots]);

  // After a listing loads, compute folder sizes in the background (bounded
  // concurrency) and fill them in as each completes. Sizes are cached per
  // listing so revisiting a folder doesn't recompute everything from scratch.
  useEffect(() => {
    if (view === "map") return;
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
  }, [listing, settings.files.showFolderSizes, view]);

  const homePath = useMemo(
    () => roots.find((r) => r.kind === "home")?.path ?? null,
    [roots]
  );
  const trashRoot = useMemo(
    () => roots.find((r) => r.kind === "trash") ?? null,
    [roots]
  );
  const inTrash = !!(path && trashRoot && path === trashRoot.path);
  const drives = useMemo(
    () => roots.filter((r) => r.kind === "drive" || r.kind === "root"),
    [roots]
  );
  const network = useMemo(
    () => roots.filter((r) => r.kind === "network"),
    [roots]
  );
  const trashCards = useMemo(
    () => roots.filter((r) => r.kind === "trash"),
    [roots]
  );

  const crumbs = useMemo(
    () =>
      inTrash && trashRoot
        ? [{ label: "Trash", path: trashRoot.path }]
        : path && listing
          ? breadcrumbs(listing.path, roots)
          : [],
    [path, listing, roots, inTrash, trashRoot]
  );

  const visibleTrash = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trashItems;
    return trashItems.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.originalPath.toLowerCase().includes(q)
    );
  }, [trashItems, query]);

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
    if (view === "map" && mapRef.current?.zoomed) {
      mapRef.current.zoomOut();
      return;
    }
    if (inTrash) setPath(null);
    else if (listing?.parent) setPath(listing.parent);
    else setPath(null);
  }

  async function openRoot(root: FsRoot) {
    if (root.kind === "network" && root.connected === false) {
      if (!canWrite || !root.shareId) {
        setActionError(root.error ?? "This network drive is offline.");
        return;
      }
      setBusy(true);
      setActionError(null);
      try {
        await connectNetworkShare(root.shareId);
        const next = await reloadRoots();
        const updated = next.find((r) => r.shareId === root.shareId) ?? root;
        setPath(updated.path);
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    setPath(root.path);
  }

  // Re-fetches the current folder after a mutation, without the navigation
  // loader flash (we already have content on screen).
  const reload = useCallback(async () => {
    if (path === null) return;
    try {
      const trash = roots.find((r) => r.kind === "trash");
      if (trash && path === trash.path) {
        setTrashItems(await fetchTrash());
        await reloadRoots();
        return;
      }
      const l = await fetchListing(path);
      cache.files.listing = l;
      setListing(l);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }, [path, roots, reloadRoots]);

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
  const showMap = view === "map" && !inTrash;

  return (
    <S.FilesRoot $map={showMap}>
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
        {!atThisPc && !showMap && (
          <S.FilesSearch
            type="text"
            placeholder={inTrash ? "Filter trash…" : "Filter in this folder…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <S.FilesToolbarEnd>
          <S.FilesViewToggle>
            <Tooltip label="File list">
              <button
                type="button"
                className={view === "list" || inTrash ? "active" : ""}
                onClick={() => setView("list")}
              >
                List
              </button>
            </Tooltip>
            <Tooltip label="WizTree-style size map">
              <button
                type="button"
                className={view === "map" && !inTrash ? "active" : ""}
                disabled={inTrash}
                onClick={() => setView("map")}
              >
                <MapIcon />
                Map
              </button>
            </Tooltip>
          </S.FilesViewToggle>
          {canWrite && (
            <Tooltip label="File manager settings">
              <S.FilesSettingsBtn onClick={() => setSettingsOpen(true)}>
                <GearIcon />
                Settings
              </S.FilesSettingsBtn>
            </Tooltip>
          )}
        </S.FilesToolbarEnd>
      </S.FilesToolbar>

      <S.FilesNav>
        <Tooltip label="Up one level">
          <S.FilesUp disabled={atThisPc} onClick={goUp}>
            ↑
          </S.FilesUp>
        </Tooltip>
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

      {atThisPc && actionError && (
        <S.FilesMessage $bad style={{ padding: "10px 18px", textAlign: "left" }}>
          {actionError}
        </S.FilesMessage>
      )}

      {!atThisPc && canWrite && !inTrash && !showMap && (
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

      {inTrash && canWrite && (
        <S.FilesActions>
          <button
            className="danger"
            onClick={() => setDialog({ kind: "emptyTrash" })}
            disabled={busy || trashItems.length === 0}
          >
            <TrashIcon /> Empty trash
          </button>
          <S.FilesActionsStatus>
            {actionError && <span className="bad">{actionError}</span>}
          </S.FilesActionsStatus>
        </S.FilesActions>
      )}

      <S.FilesBody $fill={showMap && !atThisPc}>
        {atThisPc ? (
          <>
            {showMap && (
              <S.FilesMapHint>
                Pick a drive or folder to see a size map. Rectangles are scaled by
                disk use, like WizTree. A whole drive can take a while to scan.
              </S.FilesMapHint>
            )}
            <ThisPc
            drives={drives}
            network={network}
            trash={trashCards}
            canWrite={canWrite}
            onOpen={openRoot}
            onAdd={() => setDialog({ kind: "addShare" })}
            onRemove={(root) => setDialog({ kind: "removeShare", root })}
          />
          </>
        ) : inTrash ? (
          error ? (
            <S.FilesMessage $bad>{error}</S.FilesMessage>
          ) : loading && trashItems.length === 0 ? (
            <S.FilesMessage className="muted">Loading…</S.FilesMessage>
          ) : (
            <S.FilesTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Deleted from</th>
                  <th className="ta-right">Deleted</th>
                  <th className="ta-right"></th>
                </tr>
              </thead>
              <tbody>
                {visibleTrash.map((item) => (
                  <TrashRow
                    key={item.id}
                    item={item}
                    busy={busy}
                    canWrite={canWrite}
                    onRestore={() => void run(() => restoreTrashItem(item.id))}
                    onDeleteForever={() =>
                      setDialog({ kind: "deleteForever", item })
                    }
                  />
                ))}
                {visibleTrash.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted proc-empty">
                      {trashItems.length > 0
                        ? "No matching items."
                        : "Trash is empty. Deleted files stay here for 30 days."}
                    </td>
                  </tr>
                )}
              </tbody>
            </S.FilesTable>
          )
        ) : error ? (
          <S.FilesMessage $bad>{error}</S.FilesMessage>
        ) : showMap && path ? (
          <DiskMap
            ref={mapRef}
            path={path}
            roots={roots}
            onOpenFolder={(next) => {
              setView("list");
              setPath(next);
            }}
            onOpenFile={(entry) => setFilePanel({ entry, mode: "view" })}
          />
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

      {dialog?.kind === "addShare" && (
        <AddShareDialog
          onCancel={() => setDialog(null)}
          onAdded={async () => {
            await reloadRoots();
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === "removeShare" && (
        <ConfirmDialog
          title="Remove network drive?"
          message={
            <>
              Disconnect <strong>{dialog.root.name}</strong>
              {dialog.root.label ? ` (${dialog.root.label})` : ""} from this
              dashboard? Files on the NAS are not deleted.
            </>
          }
          confirmLabel="Remove"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const id = dialog.root.shareId;
            if (!id) return "Missing share id";
            try {
              await removeNetworkShare(id);
              const rootPath = dialog.root.path;
              const sep = rootPath.includes("\\") ? "\\" : "/";
              const prefix = /[\\/]$/.test(rootPath) ? rootPath : rootPath + sep;
              if (path && (path === rootPath || path.startsWith(prefix))) setPath(null);
              await reloadRoots();
              setDialog(null);
              return null;
            } catch (e) {
              return (e as Error).message;
            }
          }}
        />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Move to Trash?"
          message={
            <>
              Move <strong>{dialog.entry.name}</strong> to Trash?
              {dialog.entry.type === "dir" && (
                <span className="modal-warn">
                  {" "}
                  The folder and everything inside it can be restored for 30 days.
                </span>
              )}
            </>
          }
          confirmLabel="Move to Trash"
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

      {dialog?.kind === "deleteForever" && (
        <ConfirmDialog
          title="Delete forever?"
          message={
            <>
              Permanently delete <strong>{dialog.item.name}</strong>? This cannot
              be undone.
            </>
          }
          confirmLabel="Delete forever"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const err = await doMutation(() => purgeTrashItem(dialog.item.id));
            if (!err) setDialog(null);
            return err;
          }}
        />
      )}

      {dialog?.kind === "emptyTrash" && (
        <ConfirmDialog
          title="Empty trash?"
          message="Permanently delete everything in Trash? This cannot be undone."
          confirmLabel="Empty trash"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const err = await doMutation(() => emptyTrash());
            if (!err) setDialog(null);
            return err;
          }}
        />
      )}
    </S.FilesRoot>
  );
}

function ThisPc({
  drives,
  network,
  trash,
  canWrite,
  onOpen,
  onAdd,
  onRemove,
}: {
  drives: FsRoot[];
  network: FsRoot[];
  trash: FsRoot[];
  canWrite: boolean;
  onOpen: (root: FsRoot) => void;
  onAdd: () => void;
  onRemove: (root: FsRoot) => void;
}) {
  if (drives.length === 0 && network.length === 0 && trash.length === 0 && !canWrite) {
    return <S.FilesMessage className="muted">Loading drives…</S.FilesMessage>;
  }

  const driveIds = drives.map((d) => `drive:${d.path}`);
  const driveDefaults = packDefaults(driveIds, { x: 0, y: 0, w: 4, h: 3 });
  const netItems = [
    ...network.map((d) => d.shareId ?? d.path),
    ...(canWrite ? ["add-network"] : []),
  ];
  const netIds = netItems.map((id) => (id === "add-network" ? id : `net:${id}`));
  const netDefaults = packDefaults(netIds, { x: 0, y: 0, w: 4, h: 3 });
  const trashIds = trash.map((d) => `trash:${d.path}`);
  const trashDefaults = packDefaults(trashIds, { x: 0, y: 0, w: 4, h: 3 });

  return (
    <>
      {drives.length > 0 && (
        <S.DriveSection>
          <S.DriveGridWrap>
            <DashboardGrid
              pageId="files-drives"
              items={drives.map((d) => ({
                id: `drive:${d.path}`,
                label: d.name || d.label || d.path,
                minW: 3,
                minH: 2,
                default: driveDefaults[`drive:${d.path}`] ?? { x: 0, y: 0, w: 4, h: 3 },
                node: <DriveCardView d={d} onOpen={() => onOpen(d)} />,
              }))}
            />
          </S.DriveGridWrap>
        </S.DriveSection>
      )}
      <S.DriveSection>
        <S.DriveSectionTitle>Network</S.DriveSectionTitle>
        <S.DriveGridWrap>
          <DashboardGrid
          pageId="files-network"
          items={[
            ...network.map((d) => ({
              id: `net:${d.shareId ?? d.path}`,
              label: d.name || d.label || d.path,
              minW: 3,
              minH: 2,
              default:
                netDefaults[`net:${d.shareId ?? d.path}`] ?? { x: 0, y: 0, w: 4, h: 3 },
              node: (
                <DriveCardView
                  d={d}
                  onOpen={() => onOpen(d)}
                  onRemove={
                    canWrite && d.shareId ? () => onRemove(d) : undefined
                  }
                />
              ),
            })),
            ...(canWrite
              ? [
                  {
                    id: "add-network",
                    label: "Add network drive",
                    minW: 3,
                    minH: 2,
                    default: netDefaults["add-network"] ?? { x: 0, y: 0, w: 4, h: 3 },
                    node: (
                      <S.AddDriveCard type="button" onClick={onAdd}>
                        <PlusIcon />
                        Add network drive
                      </S.AddDriveCard>
                    ),
                  },
                ]
              : []),
          ]}
        />
        </S.DriveGridWrap>
      </S.DriveSection>
      {trash.length > 0 && (
        <S.DriveSection>
          <S.DriveSectionTitle>Trash</S.DriveSectionTitle>
          <S.DriveGridWrap>
          <DashboardGrid
            pageId="files-trash"
            items={trash.map((d) => ({
              id: `trash:${d.path}`,
              label: d.name || d.label || d.path,
              minW: 3,
              minH: 2,
              default: trashDefaults[`trash:${d.path}`] ?? { x: 0, y: 0, w: 4, h: 3 },
              node: <DriveCardView d={d} onOpen={() => onOpen(d)} />,
            }))}
          />
          </S.DriveGridWrap>
        </S.DriveSection>
      )}
    </>
  );
}

function DriveCardView({
  d,
  onOpen,
  onRemove,
}: {
  d: FsRoot;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const offline = d.kind === "network" && d.connected === false;
  return (
    <S.DriveCard type="button" $offline={offline} onClick={onOpen}>
      {onRemove && (
        <S.DriveCardRemove
          type="button"
          title="Remove"
          aria-label={`Remove ${d.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </S.DriveCardRemove>
      )}
      <S.DriveCardHead>
        {d.kind === "trash" ? (
          <TrashDriveIcon />
        ) : d.kind === "network" ? (
          <NetworkIcon />
        ) : (
          <DriveIcon />
        )}
        <S.DriveName>
          {d.name}
          {d.label && <span className="drive-label muted"> {d.label}</span>}
        </S.DriveName>
      </S.DriveCardHead>
      {offline ? (
        <S.DriveMeta className="muted">
          {d.error ?? "Offline — click to reconnect"}
        </S.DriveMeta>
      ) : d.sizeBytes ? (
        <>
          <Bar value={d.usedPercent ?? 0} />
          <S.DriveMeta className="muted">
            {formatBytes(d.freeBytes ?? 0)} free of {formatBytes(d.sizeBytes)}
          </S.DriveMeta>
        </>
      ) : (
        <S.DriveMeta className="muted">{d.label ?? d.path}</S.DriveMeta>
      )}
    </S.DriveCard>
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
        {isDir ? (
          <button className="file-name" onClick={onOpen}>
            <FolderIcon />
            <span className="file-label" title={e.name}>
              {label}
            </span>
          </button>
        ) : (
          <Tooltip label="View file">
            <button className="file-name" onClick={onView}>
              <FileIcon ext={e.ext} />
              <span className="file-label" title={e.name}>
                {label}
              </span>
            </button>
          </Tooltip>
        )}
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
            <Tooltip label="View">
              <button className="row-act" onClick={onView} disabled={busy}>
                <EyeIcon />
              </button>
            </Tooltip>
          )}
          {!isDir && canWrite && (
            <Tooltip label="Edit">
              <button className="row-act" onClick={onEdit} disabled={busy}>
                <EditIcon />
              </button>
            </Tooltip>
          )}
          {!isDir && (
            <Tooltip label="Download">
              <a className="row-act" href={downloadUrl(e.path)} download>
                <DownloadIcon />
              </a>
            </Tooltip>
          )}
          {canWrite && (
            <>
              <Tooltip label="Rename">
                <button className="row-act" onClick={onRename} disabled={busy}>
                  <PencilIcon />
                </button>
              </Tooltip>
              <Tooltip label="Copy">
                <button className="row-act" onClick={onCopy} disabled={busy}>
                  <CopyIcon />
                </button>
              </Tooltip>
              <Tooltip label="Cut (move)">
                <button className="row-act" onClick={onCut} disabled={busy}>
                  <CutIcon />
                </button>
              </Tooltip>
              <Tooltip label="Move to Trash">
                <button className="row-act danger" onClick={onDelete} disabled={busy}>
                  <TrashIcon />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function TrashRow({
  item,
  busy,
  canWrite,
  onRestore,
  onDeleteForever,
}: {
  item: TrashItem;
  busy: boolean;
  canWrite: boolean;
  onRestore: () => void;
  onDeleteForever: () => void;
}) {
  return (
    <tr>
      <td>
        <span className="file-name">
          {item.type === "dir" ? <FolderIcon /> : <FileIcon ext={null} />}
          <span className="file-label" title={item.name}>
            {item.name}
          </span>
        </span>
      </td>
      <td className="muted" title={item.originalPath}>
        {item.originalPath}
      </td>
      <td className="ta-right muted">{formatDate(item.deletedAt)}</td>
      <td className="ta-right">
        {canWrite && (
          <div className="row-actions">
            <Tooltip label="Restore">
              <button className="row-act" onClick={onRestore} disabled={busy}>
                <RestoreIcon />
              </button>
            </Tooltip>
            <Tooltip label="Delete forever">
              <button
                className="row-act danger"
                onClick={onDeleteForever}
                disabled={busy}
              >
                <TrashIcon />
              </button>
            </Tooltip>
          </div>
        )}
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
  wide,
  children,
}: {
  onCancel: () => void;
  wide?: boolean;
  children: ReactNode;
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
      <Modal role="dialog" aria-modal="true" $wide={wide}>
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

function AddShareDialog({
  onCancel,
  onAdded,
}: {
  onCancel: () => void;
  onAdded: () => Promise<void>;
}) {
  const [caps, setCaps] = useState<SharesStatus | null>(null);
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<ShareProtocol>("smb");
  const [host, setHost] = useState("");
  const [share, setShare] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState("");
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShares()
      .then((s) => {
        if (cancelled) return;
        setCaps(s);
        if (!s.protocols.includes("smb") && s.protocols.includes("nfs")) {
          setProtocol("nfs");
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const protocols = caps?.protocols ?? ["smb"];
  const smb = protocol === "smb";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !host.trim() || !share.trim()) return;
    if (smb && !guest && !username.trim()) {
      setError("Enter the NAS username (the same one Windows asks for).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addNetworkShare({
        name: name.trim(),
        protocol,
        host: host.trim(),
        share: share.trim(),
        username: smb && !guest ? username.trim() : undefined,
        password: smb && !guest ? password : undefined,
        domain: smb && !guest ? domain.trim() || undefined : undefined,
      });
      await onAdded();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <ModalShell wide onCancel={onCancel}>
      <form onSubmit={submit}>
        <ModalTitle as="h3">Add network drive</ModalTitle>
        <S.ShareForm>
          {protocols.length > 1 && (
            <div>
              <ModalLabel>Protocol</ModalLabel>
              <S.ProtocolRow>
                {protocols.map((p) => (
                  <S.ProtocolBtn
                    key={p}
                    type="button"
                    $on={protocol === p}
                    onClick={() => setProtocol(p)}
                  >
                    {p === "smb" ? "SMB / CIFS" : "NFS"}
                  </S.ProtocolBtn>
                ))}
              </S.ProtocolRow>
            </div>
          )}
          <div>
            <ModalLabel>Display name</ModalLabel>
            <ModalInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={smb ? "Media" : "Backup"}
              autoComplete="off"
            />
          </div>
          <div>
            <ModalLabel>Host</ModalLabel>
            <ModalInput
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.10 or nas.local"
              spellCheck={false}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <ModalLabel>{smb ? "Share name" : "Export path"}</ModalLabel>
            <ModalInput
              value={share}
              onChange={(e) => setShare(e.target.value)}
              placeholder={smb ? "media" : "/volume1/media"}
              spellCheck={false}
              autoComplete="off"
              required
            />
          </div>
          {smb && (
            <S.ShareCreds>
              <S.ShareCredsTitle>Credentials</S.ShareCredsTitle>
              <S.ShareHint>
                Same username and password Windows asks for when you map this
                drive. Saved on the server so it can reconnect without prompting.
              </S.ShareHint>
              {guest ? (
                <S.ShareHint>Connecting as guest (no password).</S.ShareHint>
              ) : (
                <>
                  <div>
                    <ModalLabel>Username</ModalLabel>
                    <ModalInput
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="NAS user"
                      spellCheck={false}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <ModalLabel>Password</ModalLabel>
                    <ModalInput
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <ModalLabel>Domain (only if the NAS uses one)</ModalLabel>
                    <ModalInput
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="WORKGROUP"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </>
              )}
              <S.GuestToggle
                type="button"
                onClick={() => setGuest((g) => !g)}
              >
                {guest ? "Use a username and password" : "This share is public / guest"}
              </S.GuestToggle>
            </S.ShareCreds>
          )}
          {caps?.hint && !smb && <S.ShareHint>{caps.hint}</S.ShareHint>}
        </S.ShareForm>
        {error && <ModalError>{error}</ModalError>}
        <ModalActions>
          <ModalBtn type="button" onClick={onCancel}>
            Cancel
          </ModalBtn>
          <ModalBtn
            type="submit"
            $variant="primary"
            disabled={
              busy ||
              !host.trim() ||
              !share.trim() ||
              (smb && !guest && !username.trim())
            }
          >
            {busy ? "Connecting…" : "Connect"}
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
          desc="Ask before moving files or folders to Trash. Items stay recoverable for 30 days."
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

function breadcrumbs(
  p: string,
  roots: FsRoot[] = []
): { label: string; path: string }[] {
  const net = [...roots]
    .filter((r) => r.kind === "network")
    .sort((a, b) => b.path.length - a.path.length);
  const share = net.find(
    (r) => p === r.path || p.startsWith(r.path.endsWith("\\") ? r.path : r.path + (p.includes("\\") ? "\\" : "/"))
  );
  if (share) {
    const sep = share.path.includes("\\") ? "\\" : "/";
    const rest = p.slice(share.path.length).split(/[/\\]+/).filter(Boolean);
    const crumbs = [{ label: share.name, path: share.path }];
    let acc = share.path.replace(/[/\\]+$/, "");
    for (const part of rest) {
      acc = `${acc}${sep}${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }

  if (p.startsWith("\\\\")) {
    const parts = p.split(/\\+/).filter(Boolean);
    if (parts.length >= 2) {
      const root = `\\\\${parts[0]}\\${parts[1]}`;
      const crumbs = [{ label: `${parts[0]}\\${parts[1]}`, path: root }];
      let acc = root;
      for (let i = 2; i < parts.length; i++) {
        acc = `${acc}\\${parts[i]}`;
        crumbs.push({ label: parts[i], path: acc });
      }
      return crumbs;
    }
  }

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

function TrashDriveIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="14" width="6" height="6" rx="1" />
      <rect x="15" y="14" width="6" height="6" rx="1" />
      <rect x="9" y="4" width="6" height="6" rx="1" />
      <path d="M6 14v-2h12v2M12 10v2" />
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

function MapIcon() {
  return (
    <svg className="ficon-sm" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="8" height="11" rx="0.8" />
      <rect x="12" y="3" width="9" height="7" rx="0.8" />
      <rect x="12" y="11" width="5" height="10" rx="0.8" />
      <rect x="18" y="11" width="3" height="10" rx="0.8" />
      <rect x="3" y="15" width="8" height="6" rx="0.8" />
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

function RestoreIcon() {
  return (
    <svg className="act-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
    </svg>
  );
}
