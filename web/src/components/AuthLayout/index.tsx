import type { ReactNode } from "react";
import { APP_NAME } from "../../brand";
import { Logo } from "../ui/Logo";
import { MatrixRain } from "./MatrixRain";
import { ThemeToggle } from "../ui/ThemeToggle";
import * as S from "./styles";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

/**
 * Auth shell: full-bleed matrix field with a centered, frosted login rail.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <S.AuthScreen>
      <S.AuthBackdrop aria-hidden="true">
        <MatrixRain />
      </S.AuthBackdrop>
      <S.AuthShell>
        <S.AuthPanelForm>
          <S.AuthBrand>
            <Logo size={22} />
            <span>{APP_NAME}</span>
          </S.AuthBrand>
          {children}
          <S.AuthPanelFoot>
            <ThemeToggle />
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
