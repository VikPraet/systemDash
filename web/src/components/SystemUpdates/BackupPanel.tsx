import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, RefreshCw, Upload, X, AlertTriangle } from "lucide-react";
import {
  backupDownloadUrl,
  createBackup,
  fetchBackups,
  formatBytes,
  formatDate,
  restoreBackup,
  restoreBackupUpload,
} from "../../api";
import type { BackupReason, BackupSnapshot } from "../../types";
import { APP_NAME } from "../../brand";
import {
  AuthError,
  DangerBtn,
  GhostBtn,
  ModalActions,
  ModalCard,
  ModalClose,
  ModalHead,
  ModalOverlay,
  ModalSub,
  RevokeWarn,
} from "../ui/styles";
import { Tooltip } from "../ui/Tooltip";
import * as S from "./styles";

const HEALTH_TRIES = 40;
const HEALTH_WAIT_MS = 1500;

function reasonLabel(reason: BackupReason): string {
  switch (reason) {
    case "pre-update":
      return "Before update";
    case "pre-restore":
      return "Before restore";
    default:
      return "Manual";
  }
}

async function waitForRestart(): Promise<void> {
  for (let i = 0; i < HEALTH_TRIES; i++) {
    await new Promise((r) => setTimeout(r, HEALTH_WAIT_MS));
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        window.location.reload();
        return;
      }
    } catch {
      // Server is bouncing.
    }
  }
}

export function BackupPanel() {
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<
    { kind: "id"; id: string } | { kind: "upload"; file: File } | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshots(await fetchBackups());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createNow(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await createBackup();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <S.AppPanel>
      <S.AppPanelHead>
        <S.AppPanelTitle>
          <Archive size={16} />
          Backup
        </S.AppPanelTitle>
        <S.AppPanelActions>
          <Tooltip label="Refresh snapshot list">
            <GhostBtn type="button" onClick={() => void reload()} disabled={loading || busy}>
              <RefreshCw size={14} />
              Refresh
            </GhostBtn>
          </Tooltip>
          <GhostBtn type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={14} />
            Restore file
          </GhostBtn>
          <GhostBtn type="button" onClick={() => void createNow()} disabled={busy}>
            Create backup
          </GhostBtn>
        </S.AppPanelActions>
      </S.AppPanelHead>
      <S.AppPanelMeta>
        <span>
          Copies of {APP_NAME} accounts, settings, projects, and history. Host
          files are not included. Last 7 snapshots are kept on this machine.
        </span>
      </S.AppPanelMeta>
      {error && (
        <S.Banner $bad style={{ margin: "0 16px 12px" }}>
          {error}
        </S.Banner>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".tar.gz,.tgz,application/gzip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setRestoreTarget({ kind: "upload", file });
        }}
      />
      {loading && snapshots.length === 0 ? (
        <S.BackupEmpty>Loading snapshots…</S.BackupEmpty>
      ) : snapshots.length === 0 ? (
        <S.BackupEmpty>No snapshots yet. Create one before an update or restore.</S.BackupEmpty>
      ) : (
        <S.BackupList>
        <S.BackupTable>
          <thead>
            <tr>
              <th>When</th>
              <th>Reason</th>
              <th className="ta-right">Size</th>
              <th className="ta-right"></th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td>{formatDate(s.createdAt)}</td>
                <td className="muted">{reasonLabel(s.reason)}</td>
                <td className="ta-right muted">{formatBytes(s.sizeBytes)}</td>
                <td className="ta-right">
                  <S.AppPanelActions style={{ justifyContent: "flex-end", padding: 0 }}>
                    <GhostBtn
                      type="button"
                      onClick={() => {
                        window.location.href = backupDownloadUrl(s.id);
                      }}
                    >
                      <Download size={14} />
                      Download
                    </GhostBtn>
                    <DangerBtn
                      type="button"
                      disabled={busy}
                      onClick={() => setRestoreTarget({ kind: "id", id: s.id })}
                    >
                      Restore
                    </DangerBtn>
                  </S.AppPanelActions>
                </td>
              </tr>
            ))}
          </tbody>
        </S.BackupTable>
        </S.BackupList>
      )}
      {restoreTarget && (
        <RestoreModal
          target={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onBusy={setBusy}
          onError={setError}
        />
      )}
    </S.AppPanel>
  );
}

function RestoreModal({
  target,
  onClose,
  onBusy,
  onError,
}: {
  target: { kind: "id"; id: string } | { kind: "upload"; file: File };
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const label = target.kind === "id" ? target.id : target.file.name;

  async function submit() {
    if (confirm.trim().toUpperCase() !== "RESTORE") {
      setLocalError("Type RESTORE to confirm");
      return;
    }
    setBusy(true);
    onBusy(true);
    setLocalError(null);
    try {
      if (target.kind === "id") {
        await restoreBackup(target.id, "RESTORE");
      } else {
        await restoreBackupUpload(target.file, "RESTORE");
      }
      setRestarting(true);
      await waitForRestart();
    } catch (e) {
      const msg = (e as Error).message;
      setLocalError(msg);
      onError(msg);
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <ModalOverlay onClick={restarting ? undefined : onClose} role="presentation">
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>Restore backup</h3>
          {!restarting && (
            <ModalClose type="button" onClick={onClose}>
              <X size={16} strokeWidth={1.8} />
            </ModalClose>
          )}
        </ModalHead>
        <ModalSub>
          Restore <strong>{label}</strong>? This replaces {APP_NAME} users,
          sessions, settings, projects config, and history, then restarts the
          service. Files on the host are not in the archive.
        </ModalSub>
        <RevokeWarn>
          <AlertTriangle size={15} strokeWidth={1.8} />
          Signed-in sessions will drop. A safety snapshot is taken first.
        </RevokeWarn>
        {restarting ? (
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
            Restored — waiting for {APP_NAME} to come back…
          </p>
        ) : (
          <>
            <S.ConfirmField>
              Type RESTORE to confirm
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="RESTORE"
                autoComplete="off"
                spellCheck={false}
              />
            </S.ConfirmField>
            {localError && <AuthError>{localError}</AuthError>}
            <ModalActions>
              <GhostBtn type="button" onClick={onClose} disabled={busy}>
                Cancel
              </GhostBtn>
              <DangerBtn
                type="button"
                onClick={() => void submit()}
                disabled={busy || confirm.trim().toUpperCase() !== "RESTORE"}
              >
                {busy ? "Restoring…" : "Restore"}
              </DangerBtn>
            </ModalActions>
          </>
        )}
      </ModalCard>
    </ModalOverlay>
  );
}
