import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import {
  fetchAppUpdateJob,
  fetchAppUpdateStatus,
  startAppUpdate,
} from "../../api";
import type { AppUpdateJob, AppUpdateStatus } from "../../types";
import { Dropdown } from "../Dropdown";
import { DangerBtn, GhostBtn } from "../ui/styles";
import { Tooltip } from "../ui/Tooltip";
import { APP_NAME } from "../../brand";
import * as S from "./styles";

const JOB_POLL_MS = 800;
const STATUS_POLL_MS = 5 * 60_000;

function phaseLabel(phase: AppUpdateJob["phase"]): string {
  switch (phase) {
    case "download":
      return "Downloading release…";
    case "extract":
      return "Extracting files…";
    case "finalize":
      return "Switching install…";
    case "restart":
      return "Restarting service…";
    case "done":
      return "Update complete — reconnecting…";
    case "error":
      return "Update failed";
    default:
      return "";
  }
}

export function AppUpdatePanel() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [picked, setPicked] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<AppUpdateJob | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const reload = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAppUpdateStatus({ refresh });
      setStatus(next);
      setPicked((prev) => {
        if (prev && next.releases?.some((r) => r.version === prev)) return prev;
        return next.latestVersion ?? "";
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(() => void reload(), STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (!job?.running) return;
    const id = setInterval(async () => {
      try {
        const next = await fetchAppUpdateJob();
        setJob(next);
      } catch {
        // ignore transient poll errors
      }
    }, JOB_POLL_MS);
    return () => clearInterval(id);
  }, [job?.running]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log]);

  async function runUpdate(): Promise<void> {
    setJob({
      running: true,
      phase: "download",
      progress: 4,
      log: "",
      error: null,
    });
    try {
      await startAppUpdate(picked || undefined);
      const first = await fetchAppUpdateJob();
      setJob(first);
    } catch (e) {
      setJob({
        running: false,
        phase: "error",
        progress: 0,
        log: "",
        error: (e as Error).message,
      });
    }
  }

  const busy = job?.running ?? false;
  const current = status?.currentVersion ?? "—";
  const releases = status?.releases ?? [];
  const selected = releases.find((r) => r.version === picked) ?? null;
  const canInstall =
    !!status?.enabled &&
    !!status.installRoot &&
    !!picked &&
    picked !== current &&
    !busy;

  return (
    <S.AppPanel>
      <S.AppPanelHead>
        <S.AppPanelTitle>
          <Sparkles size={16} />
          {APP_NAME}
        </S.AppPanelTitle>
        <S.AppPanelActions>
          <Tooltip label="Check GitHub for a new release">
            <GhostBtn type="button" onClick={() => void reload(true)} disabled={loading || busy}>
              <RefreshCw size={14} />
              Check
            </GhostBtn>
          </Tooltip>
          {canInstall && (
            <DangerBtn type="button" disabled={busy} onClick={() => void runUpdate()}>
              Install v{picked}
            </DangerBtn>
          )}
        </S.AppPanelActions>
      </S.AppPanelHead>

      <S.AppPanelMeta>
        <span>
          Installed <strong>v{current}</strong>
        </span>
        {status?.releaseUrl && (
          <a href={status.releaseUrl} target="_blank" rel="noreferrer">
            Releases <ExternalLink size={12} />
          </a>
        )}
      </S.AppPanelMeta>

      {releases.length > 0 && (
        <S.AppPanelSelect>
          Version
          <Dropdown
            value={picked}
            options={releases.map((r) => ({
              value: r.version,
              label: r.prerelease ? `v${r.version} (beta)` : `v${r.version}`,
            }))}
            onChange={setPicked}
            variant="underline"
            ariaLabel={`${APP_NAME} version`}
          />
        </S.AppPanelSelect>
      )}

      {loading && !status && (
        <S.Banner>Checking GitHub releases…</S.Banner>
      )}
      {error && !status && <S.Banner $bad>{error}</S.Banner>}
      {status?.hint && <S.Banner $bad={!status.enabled}>{status.hint}</S.Banner>}
      {canInstall && selected && (
        <S.Banner>
          {selected.prerelease ? "Beta" : "Release"} v{picked} is selected
          {picked === status?.latestVersion ? " (newest)." : "."} Click Install to
          switch without using the terminal.
        </S.Banner>
      )}
      {picked === current && status?.enabled && !status.hint && !loading && (
        <S.Banner>
          {APP_NAME} v{current} is already installed.
        </S.Banner>
      )}

      {(job?.running || job?.phase === "done" || job?.phase === "error") && (
        <S.ProgressWrap>
          <S.ProgressLabel>
            <span>{phaseLabel(job.phase)}</span>
            <span>{job.progress}%</span>
          </S.ProgressLabel>
          <S.ProgressTrack>
            <S.ProgressFill $value={job.progress} />
          </S.ProgressTrack>
        </S.ProgressWrap>
      )}

      {job?.log && <S.LogPanel ref={logRef}>{job.log}</S.LogPanel>}
      {job?.error && <S.Banner $bad>{job.error}</S.Banner>}
    </S.AppPanel>
  );
}
