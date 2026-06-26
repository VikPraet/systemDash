import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAppUpdateStatus } from "../../api";
import type { AppUpdateStatus } from "../../types";
import * as S from "../../App.styles";

const POLL_MS = 5 * 60_000;

export function AppVersionLink({ version }: { version: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);

  const reload = useCallback(async () => {
    try {
      setStatus(await fetchAppUpdateStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  const updateAvailable = status?.updateAvailable ?? false;

  return (
    <S.Version
      as="button"
      type="button"
      $available={updateAvailable}
      onClick={() => navigate("/updates")}
      title={
        updateAvailable && status?.latestVersion
          ? `Update to v${status.latestVersion}`
          : "SystemDash version"
      }
    >
      v{version}
      {updateAvailable ? " · update" : ""}
    </S.Version>
  );
}
