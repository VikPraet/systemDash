import type { ReactNode } from "react";
import { BrandDot } from "../ui/styles";
import * as S from "./styles";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

/**
 * Auth shell: a full-bleed themed background image with a glass "window" on top.
 * The left portion is frosted glass holding the form; the right portion stays
 * clear so the background image's focal point shows through. Login and Setup
 * render their form fields as children.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <S.AuthScreen>
      <S.AuthWindow>
        <S.AuthPanelForm>
          <S.AuthBrand>
            <BrandDot />
            <h1>SystemDash</h1>
          </S.AuthBrand>
          {children}
        </S.AuthPanelForm>
        <S.AuthPanelGlass aria-hidden="true" />
      </S.AuthWindow>
    </S.AuthScreen>
  );
}
