import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { APP_NAME } from "../../brand";
import { fetchHealth, formatRelative } from "../../api";
import { GhostBtn } from "./styles";
import { mobile } from "../../theme/media";

const OVERLAY_DELAY_MS = 1400;
const VERSION_POLL_MS = 2000;

/** Shows the reconnect overlay after a short delay so brief blips don't flash. */
export function useReconnectGate(disconnected: boolean): {
  visible: boolean;
  since: number | null;
} {
  const [visible, setVisible] = useState(false);
  const [since, setSince] = useState<number | null>(null);

  useEffect(() => {
    if (!disconnected) {
      setVisible(false);
      setSince(null);
      return;
    }
    const started = Date.now();
    setSince(started);
    const id = window.setTimeout(() => setVisible(true), OVERLAY_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [disconnected]);

  return { visible, since };
}

/**
 * Reloads once the host answers again on a different version. An in-app update
 * swaps the build under a page that is still running the old assets, so without
 * this the tab silently keeps talking to a server it was not built against.
 */
export function useReloadOnNewVersion(disconnected: boolean): void {
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchHealth()
      .then((health) => {
        if (!cancelled && loaded.current === null) loaded.current = health.version;
      })
      .catch(() => {
        // Offline at boot; the first poll below records the version instead.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!disconnected) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      void fetchHealth()
        .then((health) => {
          if (cancelled || !health.version) return;
          if (loaded.current === null) {
            loaded.current = health.version;
            return;
          }
          if (health.version !== loaded.current) window.location.reload();
        })
        .catch(() => {
          // Still down; keep waiting.
        });
    }, VERSION_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [disconnected]);
}

function formatWait(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function ReconnectOverlay({
  since,
  lastSeen,
}: {
  since: number;
  lastSeen?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = `Reconnecting · ${APP_NAME}`;
    return () => {
      document.title = prev;
    };
  }, []);

  const title = online ? "Reconnecting" : "You're offline";
  const detail = online
    ? "The host isn't responding. If it's restarting, this page will come back on its own."
    : "This browser lost its network. We'll reconnect when you're back online.";

  const wait = formatWait(now - since);
  const last =
    lastSeen != null ? `Last update ${formatRelative(lastSeen, now)}` : null;

  return (
    <Overlay role="status" aria-live="polite" aria-label={title}>
      <Card>
        <Meter aria-hidden="true" $offline={!online}>
          <i />
          <i />
          <i />
          <i />
        </Meter>
        <h2>{title}</h2>
        <p>{detail}</p>
        <Meta>
          <span>Waiting {wait}</span>
          {last && (
            <>
              <span aria-hidden="true">·</span>
              <span>{last}</span>
            </>
          )}
        </Meta>
        <GhostBtn type="button" onClick={() => window.location.reload()}>
          Reload page
        </GhostBtn>
      </Card>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${({ theme }) => theme.color.overlay};
  backdrop-filter: blur(8px);
  animation: modal-fade 0.18s ease;

  @media ${mobile} {
    padding: 16px;
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }
`;

const Card = styled.div`
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 24px 22px;
  text-align: center;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.color.panel2},
    ${({ theme }) => theme.color.panel}
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: 0 24px 70px ${({ theme }) => theme.color.shadow};
  animation: modal-pop 0.18s ease;

  h2 {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: ${({ theme }) => theme.color.muted};
  }

  ${GhostBtn} {
    margin-top: 6px;
  }
`;

const Meter = styled.div<{ $offline?: boolean }>`
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  height: 32px;
  margin: 4px 0 2px;

  i {
    display: block;
    width: 5px;
    border-radius: 1px;
    background: ${({ theme }) => theme.color.track};
    html[data-bars="square"] & {
      border-radius: 2px;
    }
  }

  i:nth-child(1) { height: 10px; }
  i:nth-child(2) { height: 16px; }
  i:nth-child(3) { height: 24px; }
  i:nth-child(4) { height: 32px; }

  ${({ $offline, theme }) =>
    $offline
      ? `
    i:nth-child(1) {
      background: ${theme.color.bad};
    }
  `
      : `
    i:nth-child(1),
    i:nth-child(2),
    i:nth-child(3) {
      background: ${theme.color.warn};
      animation: meter-reconnect 1.15s ease-in-out infinite;
    }
    i:nth-child(2) { animation-delay: 0.18s; }
    i:nth-child(3) { animation-delay: 0.36s; }
  `}

  @media (prefers-reduced-motion: reduce) {
    i {
      animation: none;
    }
  }
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 8px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.color.muted};
`;
