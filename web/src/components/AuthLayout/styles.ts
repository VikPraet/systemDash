import styled from "styled-components";

export const AuthScreen = styled.div`
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: ${({ theme }) => theme.color.bg};
  background-image: radial-gradient(
    900px 640px at 50% 50%,
    ${({ theme }) => theme.color.authGlow},
    transparent 62%
  );

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0.28;
    background-image: radial-gradient(var(--auth-dot) 0.6px, transparent 0.7px);
    background-size: 3px 3px;
  }
`;

export const AuthBackdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
`;

export const AuthShell = styled.div`
  position: relative;
  z-index: 2;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  background: transparent;

  @media (max-width: 900px) {
    padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  }
`;

export const AuthBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;

  span {
    background: linear-gradient(
      120deg,
      ${({ theme }) => theme.color.text},
      ${({ theme }) => theme.color.accent}
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

export const AuthPanelForm = styled.div`
  position: relative;
  width: min(380px, 100%);
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 26px 28px 20px;
  overflow-y: auto;
  max-height: min(92vh, 920px);
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  background: ${({ theme }) => theme.color.authPanel};
  box-shadow: ${({ theme }) => theme.elev};
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);

  @media (max-width: 900px) {
    padding: 22px 20px 18px;
  }

  @media (max-height: 700px) {
    padding-top: 18px;
    padding-bottom: 16px;
  }
`;

export const AuthPanelFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
  padding-top: 14px;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10.5px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const AuthFootMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 180px;
  gap: 12px;
`;

export const AuthFootHost = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: none;
  letter-spacing: 0.2px;
`;

export const AuthMatrix = styled.canvas`
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

/* ---- Form primitives shared by Login + Setup + Recover ------------------ */
export const AuthForm = styled.form`
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: auto 0;
  padding: 16px 0 4px;
`;

export const AuthEyebrow = styled.span`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.accent};

  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      ${({ theme }) => theme.color.hairline},
      transparent
    );
  }
`;

export const AuthTitle = styled.h2`
  margin: 2px 0 0;
  font-size: 32px;
  line-height: 1.02;
  font-weight: 600;
  letter-spacing: -0.7px;

  @media (max-height: 700px) {
    font-size: 30px;
  }
`;

export const AuthSub = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.5;
`;

export const AuthHint = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.5;
`;

export const AuthOk = styled.p`
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.color.good};
  background: color-mix(in srgb, ${({ theme }) => theme.color.good} 10%, transparent);
  border: 1px solid
    color-mix(in srgb, ${({ theme }) => theme.color.good} 35%, transparent);
`;

export const AuthUsernameReveal = styled.p`
  margin: 4px 0 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.4px;
  font-family: ${({ theme }) => theme.font.mono};
`;

export const AuthField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.accent};

  input {
    padding: 12px 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
    border-radius: 0;
    color: ${({ theme }) => theme.color.text};
    font-size: 15px;
    font-weight: 400;
    letter-spacing: 0.2px;
    text-transform: none;
    outline: none;
    transition: border-color 0.18s ease;
  }

  input::placeholder {
    color: ${({ theme }) => theme.color.placeholder};
  }

  input:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;

export const AuthModes = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin-top: 4px;
  border-bottom: 1px solid ${({ theme }) => theme.color.hairline};
`;

export const AuthMode = styled.button<{ $active?: boolean }>`
  padding: 10px 8px 12px;
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${({ $active, theme }) => ($active ? theme.color.accent : "transparent")};
  color: ${({ $active, theme }) =>
    $active ? theme.color.text : theme.color.muted};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  cursor: pointer;
  margin-bottom: -1px;

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
`;

export const AuthNav = styled.p`
  margin: 2px 0 0;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.5;

  a {
    color: ${({ theme }) => theme.color.accent};
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

// Shared with modals (Processes / Activity); defined once in the ui layer.
export { AuthError } from "../ui/styles";
