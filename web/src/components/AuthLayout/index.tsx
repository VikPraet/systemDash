import { useEffect, useRef, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { APP_NAME } from "../../brand";
import { applyConnectionFavicon } from "../../connectionFavicon";
import { MatrixRain } from "./MatrixRain";
import { ThemeToggle } from "../ui/ThemeToggle";
import { PaletteToggle } from "../ui/PaletteToggle";
import * as S from "./styles";

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

  useEffect(() => {
    prevPath.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    applyConnectionFavicon("idle");
    let cancelled = false;
    fetch("/api/health")
      .then((res) => {
        if (!cancelled) applyConnectionFavicon(res.ok ? "idle" : "bad");
      })
      .catch(() => {
        if (!cancelled) applyConnectionFavicon("bad");
      });
    return () => {
      cancelled = true;
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
              <PaletteToggle />
            </S.AuthFootToggles>
            <S.AuthFootMeta>
              <span>encrypted session</span>
              <S.AuthFootHost title={window.location.origin}>{authHostLabel()}</S.AuthFootHost>
            </S.AuthFootMeta>
          </S.AuthPanelFoot>
        </S.AuthPanelForm>
      </S.AuthShell>
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
