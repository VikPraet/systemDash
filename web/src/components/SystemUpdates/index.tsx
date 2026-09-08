import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  fetchUpdatesJob,
  fetchUpdatesStatus,
  startSystemUpdates,
} from "../../api";
import type { PendingPackage, UpdateJob, UpdatesStatus } from "../../types";
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

  if (loading && !status) {
    return (
      <S.Root>
        <BackupPanel />
        <Loading>Fetching package lists — this can take a minute…</Loading>
      </S.Root>
    );
  }

  if (error && !status) {
    return (
      <S.Root>
        <BackupPanel />
        <S.Banner $bad>{error}</S.Banner>
        <S.Empty>
          <GhostBtn type="button" onClick={() => void reload()}>
            Retry
          </GhostBtn>
        </S.Empty>
      </S.Root>
    );
  }

  if (!status?.available) {
    return (
      <S.Root>
        <BackupPanel />
        <AppUpdatePanel />
        <S.Banner $bad>{status?.hint ?? "Updates are not available on this platform."}</S.Banner>
      </S.Root>
    );
  }

  const busy = job?.running ?? false;
  const pending = status.pendingCount ?? 0;

  return (
    <S.Root>
      <BackupPanel />
      <AppUpdatePanel />
      <S.SectionHead>OS packages</S.SectionHead>
      <S.Toolbar>
        <S.ToolbarTop>
          <S.Search
            type="text"
            placeholder="Find packages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy}
          />
          <S.Summary>
            <span>
              <strong>{pending}</strong> updates
            </span>
            <span>
              <strong>{selected.size}</strong> selected
            </span>
          </S.Summary>
        </S.ToolbarTop>
        <S.ToolbarActions>
          <Tooltip label="Refresh package lists from apt (can take a minute)">
            <GhostBtn type="button" onClick={() => void reload(true, true)} disabled={loading || busy}>
              <RefreshCw size={14} />
              Refresh
            </GhostBtn>
          </Tooltip>
          <GhostBtn type="button" onClick={() => void reload(false, true)} disabled={loading || busy}>
            Load descriptions
          </GhostBtn>
          <GhostBtn
            type="button"
            disabled={!status.canInstall || busy || pending === 0}
            onClick={() => void runUpdate("packages", true)}
          >
            <Download size={14} />
            Update selected
          </GhostBtn>
          <DangerBtn
            type="button"
            disabled={!status.canInstall || busy || pending === 0}
            onClick={() => void runUpdate("packages", false)}
          >
            Update all packages
          </DangerBtn>
          {status.manager === "apt" && (
            <DangerBtn
              type="button"
              disabled={!status.canInstall || busy || pending === 0}
              onClick={() => void runUpdate("all", false)}
            >
              Full upgrade (incl. OS)
            </DangerBtn>
          )}
        </S.ToolbarActions>
      </S.Toolbar>

      {status.hint && <S.Banner $bad>{status.hint}</S.Banner>}
      {loading && <S.Banner>Refreshing package lists…</S.Banner>}

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

      {showLog && job?.log && <S.LogPanel ref={logRef}>{job.log}</S.LogPanel>}
      {job?.error && <S.Banner $bad>{job.error}</S.Banner>}

      <S.Body>
        {pending === 0 && !loading ? (
          <S.Empty>All packages are up to date.</S.Empty>
        ) : (
          <S.Table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    disabled={busy || rows.length === 0}
                  />
                </th>
                <th>Package</th>
                <th>Description</th>
                <th>Status</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pkg: PendingPackage) => (
                <tr key={pkg.name}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(pkg.name)}
                      onChange={(e) => toggleOne(pkg.name, e.target.checked)}
                      disabled={busy}
                    />
                  </td>
                  <td className="mono">{pkg.name}</td>
                  <td className="desc muted">{pkg.description ?? "—"}</td>
                  <td className="status">
                    {pkg.currentVersion
                      ? `${pkg.currentVersion} → ${pkg.newVersion}`
                      : `New version ${pkg.newVersion}`}
                  </td>
                  <td className="mono muted">{pkg.source}</td>
                </tr>
              ))}
            </tbody>
          </S.Table>
        )}
      </S.Body>
    </S.Root>
  );
}
