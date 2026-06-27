import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Power, RefreshCw, Skull, X } from "lucide-react";
import { fetchPowerCapabilities, runPowerAction } from "../../api";
import type { PowerAction, PowerCapabilities } from "../../types";
import {
  AuthError,
  DangerBtn,
  GhostBtn,
  Loading,
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

const ACTION_META: Record<
  PowerAction,
  { label: string; title: string; detail: string; confirm: string; icon: typeof Power }
> = {
  reboot: {
    label: "Restart",
    title: "Restart system",
    detail: "Reboots the host. All services stop and the machine comes back up.",
    confirm: "REBOOT",
    icon: RefreshCw,
  },
  shutdown: {
    label: "Shut down",
    title: "Shut down system",
    detail: "Gracefully stops the host. Running apps get a chance to close.",
    confirm: "SHUTDOWN",
    icon: Power,
  },
  poweroff: {
    label: "Force power off",
    title: "Force power off",
    detail: "Immediately cuts power to the host. Unsaved work may be lost.",
    confirm: "POWEROFF",
    icon: Skull,
  },
};

export function PowerControl() {
  const [caps, setCaps] = useState<PowerCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<PowerAction | null>(null);
  const [scheduled, setScheduled] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCaps(await fetchPowerCapabilities());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !caps) {
    return (
      <S.PowerRoot>
        <Loading>Checking power controls…</Loading>
      </S.PowerRoot>
    );
  }

  if (!caps?.available) {
    return (
      <S.PowerRoot>
        <S.PowerHead>
          <h3>Power</h3>
        </S.PowerHead>
        <S.PowerHint className="muted">
          {caps?.hint ?? error ?? "Power control is not available on this host."}
        </S.PowerHint>
      </S.PowerRoot>
    );
  }

  return (
    <S.PowerRoot>
      <S.PowerHead>
        <h3>Power</h3>
      </S.PowerHead>
      {caps.hint && <S.PowerHint>{caps.hint}</S.PowerHint>}
      {error && <AuthError $inline>{error}</AuthError>}
      {scheduled && <S.PowerScheduled>{scheduled}</S.PowerScheduled>}
      <S.PowerActions>
        {caps.actions.map((action) => {
          const meta = ACTION_META[action];
          const Icon = meta.icon;
          const Btn = action === "poweroff" ? DangerBtn : GhostBtn;
          return (
            <Tooltip key={action} label={meta.detail}>
              <Btn type="button" onClick={() => setTarget(action)}>
                <Icon size={14} />
                {meta.label}
              </Btn>
            </Tooltip>
          );
        })}
      </S.PowerActions>

      {target && (
        <PowerConfirmModal
          action={target}
          delaySeconds={caps.defaultDelaySeconds}
          onClose={() => setTarget(null)}
          onSuccess={(message) => {
            setTarget(null);
            setScheduled(message);
            setError(null);
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </S.PowerRoot>
  );
}

function PowerConfirmModal({
  action,
  delaySeconds,
  onClose,
  onSuccess,
  onError,
}: {
  action: PowerAction;
  delaySeconds: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const meta = ACTION_META[action];
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    if (confirm.trim().toUpperCase() !== meta.confirm) {
      setLocalError(`Type ${meta.confirm} to confirm`);
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const result = await runPowerAction({
        action,
        confirm: meta.confirm,
        delaySeconds,
      });
      onSuccess(result.message);
    } catch (e) {
      const msg = (e as Error).message;
      setLocalError(msg);
      onError(msg);
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClick={onClose} role="presentation">
      <ModalCard onClick={(e) => e.stopPropagation()}>
        <ModalHead>
          <h3>{meta.title}</h3>
          <ModalClose type="button" onClick={onClose}>
            <X size={16} strokeWidth={1.8} />
          </ModalClose>
        </ModalHead>
        <ModalSub>{meta.detail}</ModalSub>
        <RevokeWarn>
          <AlertTriangle size={15} strokeWidth={1.8} />
          This affects the entire machine, not just SystemDash. You will lose access
          until the host is back online.
        </RevokeWarn>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
          The action runs in <strong>{delaySeconds} seconds</strong> after you confirm.
        </p>
        <S.ConfirmField>
          Type {meta.confirm} to confirm
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={meta.confirm}
            autoComplete="off"
            spellCheck={false}
          />
        </S.ConfirmField>
        {(localError || busy) && localError && <AuthError>{localError}</AuthError>}
        <ModalActions>
          <GhostBtn type="button" onClick={onClose} disabled={busy}>
            Cancel
          </GhostBtn>
          <DangerBtn
            type="button"
            onClick={() => void submit()}
            disabled={busy || confirm.trim().toUpperCase() !== meta.confirm}
          >
            {busy ? "Scheduling…" : meta.label}
          </DangerBtn>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}
