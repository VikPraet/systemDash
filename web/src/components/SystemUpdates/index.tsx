import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { fetchUpdatesStatus, runSystemUpdates } from "../../api";
import type { UpdatesStatus } from "../../types";
import {
  DangerBtn,
  GhostBtn,
  ModalActions,
  ModalCard,
  ModalError,
  ModalHead,
  ModalMessage,
  ModalOverlay,
  ModalSub,
} from "../ui/styles";
import * as S from "./styles";

export function SystemUpdates() {
  const [status, setStatus] = useState<UpdatesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmScope, setConfirmScope] = useState<"packages" | "all" | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchUpdatesStatus());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onConfirmRun() {
    if (!confirmScope) return;
    setRunning(true);
    setRunError(null);
    setRunOutput(null);
    try {
      const result = await runSystemUpdates(confirmScope);
      setRunOutput(result.output || result.message);
      setConfirmScope(null);
      await reload();
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (loading && !status) {
    return <S.Wrap>Checking for updates…</S.Wrap>;
  }

  if (error && !status) {
    return (
      <S.Wrap>
        <S.ErrorText>{error}</S.ErrorText>
        <GhostBtn type="button" onClick={() => void reload()}>
          Retry
        </GhostBtn>
      </S.Wrap>
    );
  }

  if (!status?.available) {
    return (
      <S.Wrap>
        <S.Muted>{status?.hint ?? "Updates are not available on this platform."}</S.Muted>
      </S.Wrap>
    );
  }

  const pending =
    status.pendingCount === null
      ? "unknown"
      : status.pendingCount === 0
        ? "none"
        : String(status.pendingCount);

  const managerLabel =
    status.manager === "apt"
      ? "apt"
      : status.manager === "winget"
        ? "winget"
        : "softwareupdate";

  return (
    <>
      <S.Wrap>
        <S.Row>
          <S.Summary>
            <S.Label>Package manager</S.Label>
            <S.Value>{managerLabel}</S.Value>
          </S.Summary>
          <S.Summary>
            <S.Label>Pending</S.Label>
            <S.Value>{pending}</S.Value>
          </S.Summary>
          <GhostBtn type="button" onClick={() => void reload()} disabled={loading || running}>
            <RefreshCw size={14} />
            Refresh
          </GhostBtn>
        </S.Row>

        {status.hint && <S.Hint>{status.hint}</S.Hint>}

        {status.packages.length > 0 && (
          <S.PackageList>
            {status.packages.map((pkg) => (
              <li key={pkg}>{pkg}</li>
            ))}
            {status.pendingCount !== null && status.pendingCount > status.packages.length && (
              <li>…and {status.pendingCount - status.packages.length} more</li>
            )}
          </S.PackageList>
        )}

        {runOutput && <S.Output>{runOutput}</S.Output>}

        <S.Actions>
          <GhostBtn
            type="button"
            disabled={!status.canInstall || running}
            onClick={() => {
              setRunError(null);
              setConfirmScope("packages");
            }}
          >
            <Download size={14} />
            Update packages
          </GhostBtn>
          {status.manager === "apt" && (
            <DangerBtn
              type="button"
              disabled={!status.canInstall || running}
              onClick={() => {
                setRunError(null);
                setConfirmScope("all");
              }}
            >
              Update all (incl. OS)
            </DangerBtn>
          )}
        </S.Actions>

        {running && (
          <S.Muted>Running upgrade — this can take several minutes. Do not close the page.</S.Muted>
        )}
      </S.Wrap>

      {confirmScope && (
        <ModalOverlay onClick={() => !running && setConfirmScope(null)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalHead>
              {confirmScope === "all" ? "Update all packages and OS?" : "Update packages?"}
            </ModalHead>
            <ModalSub>
              {confirmScope === "all"
                ? "Runs apt full-upgrade (kernel and system components may change). A reboot may be required."
                : "Runs apt upgrade for installed packages."}
            </ModalSub>
            <ModalMessage>
              This uses {managerLabel} on the host and may take a long time.
            </ModalMessage>
            {runError && <ModalError>{runError}</ModalError>}
            <ModalActions>
              <GhostBtn type="button" disabled={running} onClick={() => setConfirmScope(null)}>
                Cancel
              </GhostBtn>
              <DangerBtn type="button" disabled={running} onClick={() => void onConfirmRun()}>
                {running ? "Updating…" : "Start update"}
              </DangerBtn>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
    </>
  );
}
