import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  fetchAppUpdateJob,
  fetchAppUpdateStatus,
  formatDate,
  formatRelative,
  startAppUpdate,
} from "../../api";
import type { AppUpdateJob, AppUpdateStatus } from "../../types";
import { Dropdown } from "../Dropdown";
import { Markdown } from "../Editor/MarkdownPreview";
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

// Release timestamps arrive as ISO strings; everything else in the app formats
// epoch milliseconds.
function isoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatReleaseDate(iso: string | null | undefined): string | undefined {
  const ms = isoMs(iso);
  return ms ? formatDate(ms) : undefined;
}

function statusPill(status: AppUpdateStatus | null, busy: boolean) {
  if (busy) return <S.Pill $tone="accent">Installing</S.Pill>;
  if (!status) return <S.Pill>Checking</S.Pill>;
  if (!status.enabled) return <S.Pill>Updates off</S.Pill>;
  if (status.updateAvailable && status.latestVersion) {
    return (
      <S.Pill $tone="warn">
        v{status.latestVersion} available
      </S.Pill>
    );
  }
  return <S.Pill $tone="good">Up to date</S.Pill>;
}

export function AppUpdatePanel() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [picked, setPicked] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<AppUpdateJob | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showLog, setShowLog] = useState(false);
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
        setShowLog(true);
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
    setShowLog(true);
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
  const canInstall =
    !!status?.enabled &&
    !!status.installRoot &&
    !!picked &&
    picked !== current &&
    !busy;
  const publishedMs = isoMs(status?.publishedAt);
  const checkedMs = isoMs(status?.checkedAt);

  return (
    <S.Card>
      <S.CardHead>
        <S.CardTitle>{APP_NAME}</S.CardTitle>
        {statusPill(status, busy)}
        <S.CardActions>
          <Tooltip label="Check GitHub for a new release">
            <GhostBtn type="button" onClick={() => void reload(true)} disabled={loading || busy}>
              <RefreshCw size={14} />
              Check
            </GhostBtn>
          </Tooltip>
          {canInstall && (
            <DangerBtn type="button" disabled={busy} onClick={() => void runUpdate()}>
              <Download size={14} />
              Install v{picked}
            </DangerBtn>
          )}
        </S.CardActions>
      </S.CardHead>

      <S.Body>
        <S.Hero>
          <S.Versions>
            <S.VersionBlock>
              <S.VersionLabel>Installed</S.VersionLabel>
              <S.VersionValue>v{current}</S.VersionValue>
            </S.VersionBlock>
            {picked && picked !== current && (
              <>
                <ArrowRight size={18} strokeWidth={1.8} className="arrow" />
                <S.VersionBlock $accent>
                  <S.VersionLabel>Selected</S.VersionLabel>
                  <S.VersionValue>v{picked}</S.VersionValue>
                </S.VersionBlock>
              </>
            )}
          </S.Versions>
          <S.HeroSide>
            {releases.length > 0 && (
              <S.HeroField>
                Version
                <Dropdown
                  value={picked}
                  options={releases.map((r) => ({
                    value: r.version,
                    label: r.prerelease ? `v${r.version} (beta)` : `v${r.version}`,
                    hint: formatReleaseDate(r.publishedAt),
                  }))}
                  onChange={setPicked}
                  variant="underline"
                  ariaLabel={`${APP_NAME} version`}
                />
              </S.HeroField>
            )}
            {status?.releaseUrl && (
              <S.HeroLink href={status.releaseUrl} target="_blank" rel="noreferrer">
                All releases <ExternalLink size={12} />
              </S.HeroLink>
            )}
          </S.HeroSide>
        </S.Hero>

        <S.MetaRow>
          {status?.latestVersion && (
            <span>
              Latest <strong>v{status.latestVersion}</strong>
              {status.prerelease ? " (beta)" : ""}
            </span>
          )}
          {publishedMs && <span>Published {formatDate(publishedMs)}</span>}
          {checkedMs && <span>Checked {formatRelative(checkedMs, Date.now())}</span>}
          {status?.repo && <span>{status.repo}</span>}
        </S.MetaRow>

        {loading && !status && <S.Banner>Checking GitHub releases…</S.Banner>}
        {error && !status && <S.Banner $bad>{error}</S.Banner>}
        {status?.hint && <S.Banner $bad={!status.enabled}>{status.hint}</S.Banner>}

        {status?.releaseNotes && (
          <>
            <S.Disclosure
              type="button"
              aria-expanded={showNotes}
              onClick={() => setShowNotes((v) => !v)}
            >
              <ChevronRight size={13} strokeWidth={2} />
              What&apos;s new{status.latestVersion ? ` in v${status.latestVersion}` : ""}
            </S.Disclosure>
            {showNotes && (
              <S.Notes>
                <Markdown content={status.releaseNotes} />
              </S.Notes>
            )}
          </>
        )}

        {(job?.running || job?.phase === "done" || job?.phase === "error") && (
          <S.ProgressWrap>
            <S.ProgressLabel>
              <span>{phaseLabel(job.phase)}</span>
              <span>{job.progress}%</span>
            </S.ProgressLabel>
            <S.ProgressTrack>
              <S.ProgressFill
                $value={job.progress}
                $active={job.running}
                $bad={job.phase === "error"}
              />
            </S.ProgressTrack>
            {job.log && (
              <>
                <S.Disclosure
                  type="button"
                  aria-expanded={showLog}
                  onClick={() => setShowLog((v) => !v)}
                >
                  <ChevronRight size={13} strokeWidth={2} />
                  {showLog ? "Hide log" : "Show log"}
                </S.Disclosure>
                {showLog && <S.LogPanel ref={logRef}>{job.log}</S.LogPanel>}
              </>
            )}
          </S.ProgressWrap>
        )}

        {job?.error && <S.Banner $bad>{job.error}</S.Banner>}
      </S.Body>
    </S.Card>
  );
}
