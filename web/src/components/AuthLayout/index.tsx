import { useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { APP_NAME } from "../../brand";
import { applyConnectionFavicon } from "../../connectionFavicon";
import { MatrixRain } from "./MatrixRain";
import { ThemeToggle } from "../ui/ThemeToggle";
import { ReconnectOverlay, useReconnectGate } from "../ui/ReconnectOverlay";
import * as S from "./styles";

const HEALTH_OK_MS = 8000;
const HEALTH_DOWN_MS = 1500;
const HEALTH_TIMEOUT_MS = 4000;

interface AuthLayoutProps {
  readonly children?: ReactNode;
}

/**
 * Auth shell: full-bleed matrix field with a centered, frosted login rail.
 * Used as a layout route for login/recover so the rain stays mounted while
 * the form pane swaps.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const location = useLocation();
  const prevPath = useRef(location.pathname);
  const fromRecover = prevPath.current === "/recover";
  const dir = location.pathname === "/recover" ? 1 : fromRecover ? -1 : 1;
  const pane = children ?? <Outlet />;
  const paneKey = children ? "nested" : location.pathname;
  const [unreachable, setUnreachable] = useState(false);
  const reconnect = useReconnectGate(unreachable);

  useEffect(() => {
    prevPath.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    applyConnectionFavicon("idle");
    let cancelled = false;
    let timer = 0;
    let tickCtrl: AbortController | null = null;
    const downRef = { current: false };

    async function check() {
      tickCtrl = new AbortController();
      const timeout = window.setTimeout(() => tickCtrl?.abort(), HEALTH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/health", { signal: tickCtrl.signal });
        if (cancelled) return;
        downRef.current = !res.ok;
        setUnreachable(!res.ok);
        applyConnectionFavicon(res.ok ? "idle" : "bad");
      } catch {
        if (cancelled) return;
        downRef.current = true;
        setUnreachable(true);
        applyConnectionFavicon("bad");
      } finally {
        window.clearTimeout(timeout);
      }
      if (!cancelled) {
        timer = window.setTimeout(check, downRef.current ? HEALTH_DOWN_MS : HEALTH_OK_MS);
      }
    }

    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      tickCtrl?.abort();
    };
  }, []);

  return (
    <S.AuthScreen>
      <S.AuthBackdrop aria-hidden="true">
        <MatrixRain />
      </S.AuthBackdrop>
      <S.AuthShell>
        <S.AuthPanelForm>
          <S.AuthBrand>
            <span>{APP_NAME}</span>
          </S.AuthBrand>
          <S.AuthSwap key={paneKey} $dir={dir}>
            {pane}
          </S.AuthSwap>
          <S.AuthPanelFoot>
            <S.AuthFootToggles>
              <ThemeToggle />
            </S.AuthFootToggles>
            <S.AuthFootMeta>
              <span>encrypted session</span>
              <S.AuthFootHost title={window.location.origin}>{authHostLabel()}</S.AuthFootHost>
            </S.AuthFootMeta>
          </S.AuthPanelFoot>
        </S.AuthPanelForm>
      </S.AuthShell>
      {reconnect.visible && reconnect.since != null && (
        <ReconnectOverlay since={reconnect.since} />
      )}
    </S.AuthScreen>
  );
}

function authHostLabel(): string {
  const { hostname, port, protocol } = window.location;
  const defaultPort =
    port === "" ||
    (protocol === "https:" && port === "443") ||
    (protocol === "http:" && port === "80");
  return defaultPort ? hostname : `${hostname}:${port}`;
}
