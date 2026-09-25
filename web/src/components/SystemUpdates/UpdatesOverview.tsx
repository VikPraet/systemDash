import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchUpdatesJob, fetchUpdatesStatus } from "../../api";
import type { UpdatesStatus } from "../../types";
import { TeaserSkeleton } from "../ui/Skeleton";
import { parsePhasedDeferred } from "./phasing";
import * as S from "./styles";

export function UpdatesOverview() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<UpdatesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [jobLog, setJobLog] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, job] = await Promise.all([
        fetchUpdatesStatus({ descriptions: false }),
        fetchUpdatesJob().catch(() => null),
      ]);
      setStatus(next);
      setJobRunning(job?.running ?? false);
      setJobLog(job?.log ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function goToUpdates(): void {
    navigate("/updates");
  }

  if (loading && !status) {
    return <TeaserSkeleton title="Package updates" />;
  }

  if (!status?.available) {
    return (
      <S.OverviewTeaser type="button" onClick={goToUpdates}>
        <S.OverviewIcon>
          <Download size={16} />
        </S.OverviewIcon>
        <S.OverviewBody>
          <S.OverviewTitle>Package updates</S.OverviewTitle>
          <S.OverviewMeta $muted>
            {status?.hint ?? error ?? "Not available on this platform"}
          </S.OverviewMeta>
        </S.OverviewBody>
        <ChevronRight size={16} className="chevron" />
      </S.OverviewTeaser>
    );
  }

  const listed = status.items ?? [];
  const phased = new Set(parsePhasedDeferred(jobLog));
  const serverSplit = Array.isArray(status.deferred);
  const installable = serverSplit ? listed : listed.filter((pkg) => !phased.has(pkg.name));
  const pending = installable.length;
  const deferred = serverSplit
    ? (status.deferred?.length ?? 0)
    : listed.filter((pkg) => phased.has(pkg.name)).length;
  const preview = installable.slice(0, 3).map((p) => p.name);

  let meta: string;
  let accent = false;

  if (jobRunning) {
    meta = "Update in progress — view live log";
    accent = true;
  } else if (error) {
    meta = error;
  } else if (status.hint) {
    meta = status.hint;
  } else if (pending === 0) {
    meta = deferred
      ? `Up to date · ${deferred} waiting on Ubuntu's phased rollout`
      : "All packages are up to date";
  } else {
    meta =
      preview.length > 0
        ? `${pending} update${pending === 1 ? "" : "s"} — ${preview.join(", ")}${pending > 3 ? "…" : ""}`
        : `${pending} package update${pending === 1 ? "" : "s"} available`;
    accent = pending > 0;
  }

  return (
    <S.OverviewTeaser type="button" onClick={goToUpdates} $accent={accent}>
      <S.OverviewIcon $accent={accent}>
        <Download size={16} />
      </S.OverviewIcon>
      <S.OverviewBody>
        <S.OverviewTitle>Package updates</S.OverviewTitle>
        <S.OverviewMeta $good={accent && !status.hint}>{meta}</S.OverviewMeta>
      </S.OverviewBody>
      <ChevronRight size={16} className="chevron" />
    </S.OverviewTeaser>
  );
}
