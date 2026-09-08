import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Folder, HardDrive, Monitor, Network, X } from "lucide-react";
import { fetchListing, fetchRoots } from "../../api";
import type { DirListing, FsRoot } from "../../types";
import { AuthError, ModalActions, ModalBtn, ModalClose, ModalHead, ModalSub } from "../ui/styles";
import * as S from "./styles";

export function FolderPicker({
  initialPath,
  onPick,
  onClose,
}: {
  initialPath: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [roots, setRoots] = useState<FsRoot[]>([]);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchRoots()
      .then((next) => {
        if (!cancelled) setRoots(next);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const start = initialPath.trim();
    if (!start) {
      setPath(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    async function openNearest(dir: string): Promise<void> {
      let cur = dir;
      for (let i = 0; i < 8; i++) {
        try {
          const list = await fetchListing(cur);
          if (cancelled) return;
          setPath(list.path);
          setListing(list);
          setError(null);
          return;
        } catch {
          const cut = cur.replace(/[\\/][^\\/]+[\\/]?$/, "");
          if (!cut || cut === cur) break;
          cur = cut;
        }
      }
      if (!cancelled) setPath(null);
    }

    void openNearest(start).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialPath]);

  useEffect(() => {
    if (path === null) {
      setListing(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    void fetchListing(path, ctrl.signal)
      .then((list) => {
        if (cancelled) return;
        setListing(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled || (e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setListing(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [path]);

  const folders = (listing?.entries ?? []).filter((e) => e.type === "dir");
  const atRoots = path === null;
  const atDriveRoot =
    !!path &&
    roots.some(
      (r) =>
        r.path === path &&
        (r.kind === "drive" || r.kind === "root" || r.kind === "network")
    );

  return createPortal(
    <S.PickerOverlay onClick={onClose}>
      <S.WideModal onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>Choose folder</h3>
          <ModalClose type="button" onClick={onClose} aria-label="Close">
            <X size={14} />
          </ModalClose>
        </ModalHead>
        <ModalSub>
          {atDriveRoot
            ? "Open a folder on this drive — the drive root itself cannot be a project path."
            : "Same filesystem as the Files tab. Pick a folder to clone into or attach."}
        </ModalSub>
        <S.PickerNav>
          <S.IconBtn
            type="button"
            title="This PC"
            onClick={() => {
              setError(null);
              setPath(null);
            }}
          >
            <Monitor size={14} />
          </S.IconBtn>
          <S.IconBtn
            type="button"
            title="Up"
            disabled={atRoots}
            onClick={() => setPath(listing?.parent ?? null)}
          >
            <ChevronUp size={14} />
          </S.IconBtn>
          <S.PickerPath>{atRoots ? "This PC" : listing?.path ?? path}</S.PickerPath>
        </S.PickerNav>
        {error && <AuthError>{error}</AuthError>}
        <S.PickerList>
          {loading && !listing && atRoots && roots.length === 0 ? (
            <S.PickerEmpty>Loading drives…</S.PickerEmpty>
          ) : atRoots ? (
            roots.map((r) => (
              <S.PickerRow key={r.shareId ?? r.path} type="button" onClick={() => setPath(r.path)}>
                {r.kind === "network" ? <Network size={16} /> : <HardDrive size={16} />}
                <span>{r.label ? `${r.name} (${r.label})` : r.name}</span>
                <span className="muted">
                  {r.kind === "network" && r.connected === false
                    ? r.error ?? "Offline"
                    : r.path}
                </span>
              </S.PickerRow>
            ))
          ) : loading && !listing ? (
            <S.PickerEmpty>Loading…</S.PickerEmpty>
          ) : folders.length === 0 ? (
            <S.PickerEmpty>No folders here.</S.PickerEmpty>
          ) : (
            folders.map((f) => (
              <S.PickerRow key={f.path} type="button" onClick={() => setPath(f.path)}>
                <Folder size={16} />
                <span>{f.name}</span>
              </S.PickerRow>
            ))
          )}
        </S.PickerList>
        <ModalActions>
          <ModalBtn type="button" onClick={onClose}>
            Cancel
          </ModalBtn>
          <ModalBtn
            type="button"
            $variant="primary"
            disabled={atRoots || atDriveRoot || !path}
            onClick={() => path && onPick(path)}
          >
            Use this folder
          </ModalBtn>
        </ModalActions>
      </S.WideModal>
    </S.PickerOverlay>,
    document.body
  );
}
