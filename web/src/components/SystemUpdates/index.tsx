import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  Download,
  PackageX,
  RefreshCw,
  Search as SearchIcon,
  Text,
  X,
} from "lucide-react";
import {
  fetchUpdatesJob,
  fetchUpdatesStatus,
  startSystemUpdates,
} from "../../api";
import type { PendingPackage, UpdateJob, UpdatesStatus } from "../../types";
import { APP_NAME } from "../../brand";
import { DangerBtn, GhostBtn, Loading } from "../ui/styles";
import { Tooltip } from "../ui/Tooltip";
import { AppUpdatePanel } from "./AppUpdatePanel";
import { BackupPanel } from "./BackupPanel";
import * as S from "./styles";

const JOB_POLL_MS = 800;

function phaseLabel(phase: UpdateJob["phase"]): string {
  switch (phase) {
    case "refresh":
      return "Refreshing package lists…";
    case "apply":
      return "Installing updates…";
    case "done":
      return "Update finished";
    case "error":
      return "Update failed";
    default:
      return "";
  }
}

export function SystemUpdates() {
  return (
    <S.Page>
      <S.Head>
        <S.HeadLeft>
          <h2>Updates</h2>
          <S.HeadSub>
            Keep {APP_NAME} and this host&apos;s packages current, with a snapshot to
            fall back on.
          </S.HeadSub>
        </S.HeadLeft>
      </S.Head>

      <AppUpdatePanel />
      <PackagesCard />
      <BackupPanel />
    </S.Page>
  );
}

function PackagesCard() {
  const [status, setStatus] = useState<UpdatesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const reload = useCallback(async (refresh = false, descriptions = false) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchUpdatesStatus({ refresh, descriptions });
      setStatus(next);
      setSelected(new Set((next.items ?? []).map((p) => p.name)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(false, false);
  }, [reload]);

  useEffect(() => {
    if (!job?.running && job?.phase !== "refresh" && job?.phase !== "apply") {
      return;
    }

    const id = setInterval(async () => {
      try {
        const next = await fetchUpdatesJob();
        setJob(next);
        setShowLog(true);
        if (!next.running && (next.phase === "done" || next.phase === "error")) {
          await reload();
        }
      } catch {
        // ignore transient poll errors
      }
    }, JOB_POLL_MS);

    return () => clearInterval(id);
  }, [job?.running, job?.phase, reload]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log]);

  const rows = useMemo(() => {
    const items = status?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.source.toLowerCase().includes(q)
    );
  }, [status?.items, query]);

  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.name));

  function toggleAll(checked: boolean): void {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((p) => p.name)));
  }

  function toggleOne(name: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  async function runUpdate(scope: "packages" | "all", onlySelected: boolean): Promise<void> {
    if (!status?.canInstall) return;
    const packages =
      onlySelected && selected.size > 0 && selected.size < (status.items.length ?? 0)
        ? [...selected]
        : undefined;

    setShowLog(true);
    setJob({
      running: true,
      phase: "refresh",
      progress: 5,
      log: "",
      error: null,
    });

    try {
      await startSystemUpdates({ scope, packages });
      const first = await fetchUpdatesJob();
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
  const pending = status?.pendingCount ?? status?.items.length ?? 0;
  const available = status?.available ?? false;
  const items = status?.items ?? [];
  const missingDescriptions = items.some((p) => p.description === null);

  return (
    <S.Card>
      <S.CardHead>
        <S.CardTitle>OS packages</S.CardTitle>
        {busy ? (
          <S.Pill $tone="accent">Installing</S.Pill>
        ) : !available ? (
          <S.Pill>Unavailable</S.Pill>
        ) : pending > 0 ? (
          <S.Pill $tone="warn">
            {pending} pending
          </S.Pill>
        ) : (
          <S.Pill $tone="good">Up to date</S.Pill>
        )}
        {available && (
          <S.CardActions>
            <Tooltip label="Refresh package lists from the package manager (can take a minute)">
              <GhostBtn
                type="button"
                onClick={() => void reload(true, true)}
                disabled={loading || busy}
              >
                <RefreshCw size={14} />
                Refresh
              </GhostBtn>
            </Tooltip>
            {missingDescriptions && (
              <GhostBtn
                type="button"
                onClick={() => void reload(false, true)}
                disabled={loading || busy}
              >
                <Text size={14} />
                Load descriptions
              </GhostBtn>
            )}
          </S.CardActions>
        )}
      </S.CardHead>

      <S.Body>
        {status?.manager && (
          <S.CardNote>
            Pending updates reported by <strong>{status.manager}</strong> on{" "}
            {status.platform}.
          </S.CardNote>
        )}

        {loading && !status ? (
          <Loading>Fetching package lists — this can take a minute…</Loading>
        ) : error && !status ? (
          <>
            <S.Banner $bad>{error}</S.Banner>
            <S.Empty>
              <PackageX size={20} strokeWidth={1.6} />
              <strong>Couldn&apos;t read package lists</strong>
              <GhostBtn type="button" onClick={() => void reload()}>
                Retry
              </GhostBtn>
            </S.Empty>
          </>
        ) : !available ? (
          <S.Empty>
            <PackageX size={20} strokeWidth={1.6} />
            <strong>No package manager here</strong>
            {status?.hint ?? "Updates are not available on this platform."}
          </S.Empty>
        ) : (
          <>
            {status?.hint && <S.Banner $bad>{status.hint}</S.Banner>}

            {items.length > 0 && (
              <>
                <S.Toolbar>
                  <S.Search>
                    <SearchIcon size={14} strokeWidth={1.8} />
                    <input
                      type="text"
                      placeholder="Find packages…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={busy}
                    />
                    {query && (
                      <Tooltip label="Clear">
                        <S.SearchClear type="button" onClick={() => setQuery("")}>
                          <X size={13} strokeWidth={2} />
                        </S.SearchClear>
                      </Tooltip>
                    )}
                  </S.Search>
                  <S.SelectAll>
                    <S.Check
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      disabled={busy || rows.length === 0}
                    />
                    Select all{query ? " shown" : ""}
                  </S.SelectAll>
                </S.Toolbar>

                <S.ActionBar>
                  <S.ActionBarInfo>
                    <strong>{selected.size}</strong> of <strong>{pending}</strong>{" "}
                    {pending === 1 ? "update" : "updates"} selected
                  </S.ActionBarInfo>
                  <S.ActionBarButtons>
                    <GhostBtn
                      type="button"
                      disabled={!status?.canInstall || busy || selected.size === 0}
                      onClick={() => void runUpdate("packages", true)}
                    >
                      <Download size={14} />
                      Update selected
                    </GhostBtn>
                    <DangerBtn
                      type="button"
                      disabled={!status?.canInstall || busy}
                      onClick={() => void runUpdate("packages", false)}
                    >
                      Update all
                    </DangerBtn>
                    {status?.manager === "apt" && (
                      <Tooltip label="Runs a full upgrade, which may install or remove OS packages">
                        <DangerBtn
                          type="button"
                          disabled={!status.canInstall || busy}
                          onClick={() => void runUpdate("all", false)}
                        >
                          Full upgrade
                        </DangerBtn>
                      </Tooltip>
                    )}
                  </S.ActionBarButtons>
                </S.ActionBar>
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
            {loading && <S.Banner>Refreshing package lists…</S.Banner>}

            {rows.length > 0 ? (
              <S.PkgList>
                {rows.map((pkg: PendingPackage) => (
                  <S.PkgRow key={pkg.name} $selected={selected.has(pkg.name)}>
                    <S.Check
                      checked={selected.has(pkg.name)}
                      onChange={(e) => toggleOne(pkg.name, e.target.checked)}
                      disabled={busy}
                    />
                    <S.PkgTop>
                      <S.PkgName>{pkg.name}</S.PkgName>
                      <S.SourceChip>{pkg.source}</S.SourceChip>
                      <S.Delta>
                        {pkg.currentVersion ? (
                          <>
                            <span className="from">{pkg.currentVersion}</span>
                            <ArrowRight size={12} strokeWidth={2} />
                            <span>{pkg.newVersion}</span>
                          </>
                        ) : (
                          <span>new · {pkg.newVersion}</span>
                        )}
                      </S.Delta>
                    </S.PkgTop>
                    {pkg.description && <S.PkgDesc>{pkg.description}</S.PkgDesc>}
                  </S.PkgRow>
                ))}
              </S.PkgList>
            ) : query ? (
              <S.Empty>
                <SearchIcon size={20} strokeWidth={1.6} />
                <strong>No packages match “{query}”</strong>
              </S.Empty>
            ) : loading ? null : pending > 0 ? (
              <S.Empty>
                <PackageX size={20} strokeWidth={1.6} />
                <strong>
                  {pending} {pending === 1 ? "update" : "updates"} pending
                </strong>
                The package list came back empty — refresh to load it.
              </S.Empty>
            ) : (
              <S.Empty>
                <CircleCheck size={20} strokeWidth={1.6} />
                <strong>All packages are up to date</strong>
                Refresh to check the package lists again.
              </S.Empty>
            )}
          </>
        )}
      </S.Body>
    </S.Card>
  );
}
