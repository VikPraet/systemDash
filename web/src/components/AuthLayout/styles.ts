import styled from "styled-components";

export const AuthScreen = styled.div`
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow: hidden;
  /* Full-bleed themed background image, anchored on the CRT focal point. */
  background: linear-gradient(
      90deg,
      rgba(5, 7, 12, 0.72),
      rgba(5, 7, 12, 0.15) 55%
    ),
    url("/login-bg.png") 70% 50% / cover no-repeat ${({ theme }) => theme.color.bg};
`;

export const AuthWindow = styled.div`
  position: relative;
  width: 78vw;
  height: 78vh;
  display: grid;
  grid-template-columns: auto 1fr;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    width: 88vw;
    height: 84vh;
  }
`;

// Left frosted-glass panel holding the form.
export const AuthPanelForm = styled.div`
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 48px 44px;
  overflow-y: auto;
  background: linear-gradient(
    180deg,
    rgba(4, 6, 11, 0.78),
    rgba(4, 6, 11, 0.66)
  );
  backdrop-filter: blur(18px) saturate(120%);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  border-right: 1px solid rgba(255, 255, 255, 0.06);

  @media (max-width: 860px) {
    padding: 32px 28px;
    border-right: none;
  }
`;

// Right clear-glass panel (decorative; hidden on narrow screens).
export const AuthPanelGlass = styled.div`
  position: relative;
  min-width: 0;
  background: linear-gradient(
    120deg,
    rgba(255, 255, 255, 0.04),
    rgba(255, 255, 255, 0) 60%
  );

  @media (max-width: 860px) {
    display: none;
  }
`;

export const AuthBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 4px;

  h1 {
    font-size: 16px;
    margin: 0;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
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

/* ---- Form primitives shared by Login + Setup ---------------------------- */
export const AuthForm = styled.form`
  width: 340px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: auto 0;
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
      rgba(255, 255, 255, 0.18),
      rgba(255, 255, 255, 0)
    );
  }
`;

export const AuthTitle = styled.h2`
  margin: 2px 0 0;
  font-size: 34px;
  line-height: 1.05;
  font-weight: 600;
  letter-spacing: -0.5px;
`;

export const AuthSub = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.5;
`;

export const AuthHint = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.muted};
  line-height: 1.5;
`;

export const AuthField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};

  input {
    padding: 11px 2px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.18);
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
    color: rgba(230, 237, 246, 0.35);
  }

  input:focus {
    border-bottom-color: ${({ theme }) => theme.color.accent};
  }
`;

// Shared with modals (Processes / Activity); defined once in the ui layer.
export { AuthError } from "../ui/styles";
