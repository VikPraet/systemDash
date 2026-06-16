import type { ReactNode } from "react";

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
    <div className="auth-screen">
      <div className="auth-window">
        <div className="auth-panel auth-panel--form">
          <div className="auth-brand">
            <span className="brand-dot" />
            <h1>SystemDash</h1>
          </div>
          {children}
        </div>
        <div className="auth-panel auth-panel--glass" aria-hidden="true" />
      </div>
    </div>
  );
}
