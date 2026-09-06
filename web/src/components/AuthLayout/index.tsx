import type { ReactNode } from "react";
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
          {children}
          <S.AuthPanelFoot>
            <ThemeToggle />
            <S.AuthFootMeta>
              <span>encrypted session</span>
              <span>local host</span>
            </S.AuthFootMeta>
          </S.AuthPanelFoot>
        </S.AuthPanelForm>
      </S.AuthShell>
    </S.AuthScreen>
  );
}
