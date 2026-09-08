import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchAppUpdateStatus } from "../../api";
import type { AppUpdateStatus } from "../../types";
import { APP_NAME } from "../../brand";
import * as S from "./styles";

const POLL_MS = 5 * 60_000;

export function AppUpdatesOverview() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await fetchAppUpdateStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  function goToUpdates(): void {
    navigate("/updates");
  }

  if (loading && !status) {
    return (
      <S.OverviewTeaser type="button" disabled>
        <S.OverviewIcon>
          <Loader2 size={16} className="spin" />
        </S.OverviewIcon>
        <S.OverviewBody>
          <S.OverviewTitle>{APP_NAME} update</S.OverviewTitle>
          <S.OverviewMeta>Checking GitHub releases…</S.OverviewMeta>
        </S.OverviewBody>
      </S.OverviewTeaser>
    );
  }

  const accent = status?.updateAvailable ?? false;
  let meta = `${APP_NAME} is up to date`;

  if (status?.hint && !status.updateAvailable) {
    meta = status.hint;
  } else if (status?.updateAvailable && status.latestVersion) {
    meta = `v${status.currentVersion} → v${status.latestVersion}${status.prerelease ? " (beta)" : ""} available`;
  } else if (status?.latestVersion) {
    meta = `Running v${status.currentVersion}`;
  }

  return (
    <S.OverviewTeaser type="button" onClick={goToUpdates} $accent={accent}>
      <S.OverviewIcon $accent={accent}>
        <Sparkles size={16} />
      </S.OverviewIcon>
      <S.OverviewBody>
        <S.OverviewTitle>{APP_NAME} update</S.OverviewTitle>
        <S.OverviewMeta $good={accent}>{meta}</S.OverviewMeta>
      </S.OverviewBody>
      <ChevronRight size={16} className="chevron" />
    </S.OverviewTeaser>
  );
}
