import styled, { keyframes } from "styled-components";

const scan = keyframes`
  0% { transform: translateY(-30%); opacity: 0; }
  12% { opacity: 0.28; }
  100% { transform: translateY(130%); opacity: 0; }
`;

const livePulse = keyframes`
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(51, 201, 142, 0.55); }
  50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(51, 201, 142, 0); }
`;

export const AuthScreen = styled.div`
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.color.bg};
  background-image:
    radial-gradient(
      ellipse 80% 70% at 50% 42%,
      transparent 38%,
      rgba(0, 0, 0, 0.45) 100%
    ),
    radial-gradient(
      920px 520px at 82% 12%,
      rgba(79, 140, 255, 0.2),
      transparent 62%
    ),
    radial-gradient(
      740px 500px at 8% 92%,
      rgba(51, 201, 142, 0.08),
      transparent 58%
    );
  background-repeat: no-repeat;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(79, 140, 255, 0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(79, 140, 255, 0.055) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(
      ellipse 72% 62% at 50% 46%,
      #000 18%,
      transparent 78%
    );
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.015) 0px,
      rgba(255, 255, 255, 0.015) 1px,
      transparent 1px,
      transparent 3px
    );
    opacity: 0.35;
  }

  > * {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 860px) {
    padding: 16px;
  }
`;

export const AuthWindow = styled.div`
  position: relative;
  width: 78vw;
  height: 78vh;
  display: grid;
  grid-template-columns: minmax(360px, 480px) 1fr;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
  background: linear-gradient(
    180deg,
    rgba(10, 16, 26, 0.72),
    rgba(7, 11, 19, 0.55)
  );

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    width: 92vw;
    height: auto;
    min-height: min(84vh, 720px);
    max-height: 92vh;
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
    rgba(4, 6, 11, 0.82),
    rgba(4, 6, 11, 0.7)
  );
  backdrop-filter: blur(18px) saturate(120%);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  border-right: 1px solid rgba(255, 255, 255, 0.06);

  @media (max-width: 860px) {
    padding: 32px 28px;
    border-right: none;
  }
`;

// Right decorative telemetry panel (hidden on narrow screens).
export const AuthHero = styled.div`
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  overflow: hidden;
  background:
    radial-gradient(
      480px 320px at 70% 30%,
      rgba(79, 140, 255, 0.12),
      transparent 70%
    ),
    linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.03),
      rgba(255, 255, 255, 0) 58%
    );

  @media (max-width: 860px) {
    display: none;
  }
`;

export const AuthHeroFrame = styled.div`
  position: relative;
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 28px 26px 22px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(5, 9, 16, 0.35);
  overflow: hidden;

  &::before,
  &::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    border: 1px solid ${({ theme }) => theme.color.accent};
    opacity: 0.7;
  }

  &::before {
    top: -1px;
    left: -1px;
    border-right: none;
    border-bottom: none;
  }

  &::after {
    top: -1px;
    right: -1px;
    border-left: none;
    border-bottom: none;
  }
`;

export const AuthHeroScan = styled.span`
  position: absolute;
  left: 0;
  right: 0;
  height: 42%;
  background: linear-gradient(
    180deg,
    transparent,
    rgba(79, 140, 255, 0.08),
    transparent
  );
  animation: ${scan} 9s linear infinite;
  pointer-events: none;
`;

export const AuthHeroMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 2.4px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
`;

export const AuthHeroLive = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: ${({ theme }) => theme.color.good};

  &::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${({ theme }) => theme.color.good};
    animation: ${livePulse} 2.2s ease-out infinite;
  }
`;

export const AuthHeroGauges = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`;

export const AuthHeroGauge = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;

  svg {
    width: 88px;
    height: 88px;
    transform: rotate(-90deg);
  }

  circle.track {
    fill: none;
    stroke: ${({ theme }) => theme.color.track};
    stroke-width: 6;
  }

  circle.arc {
    fill: none;
    stroke: ${({ theme }) => theme.color.accent};
    stroke-width: 6;
    stroke-linecap: round;
  }

  strong {
    position: absolute;
    top: 0;
    left: 50%;
    width: 88px;
    height: 88px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translateX(-50%);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: ${({ theme }) => theme.color.text};
    pointer-events: none;
  }

  span {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: ${({ theme }) => theme.color.muted};
  }
`;

export const AuthHeroBars = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const AuthHeroBar = styled.div<{ $pct: number }>`
  display: grid;
  grid-template-columns: 46px 1fr 36px;
  align-items: center;
  gap: 10px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};

  i {
    display: block;
    height: 4px;
    border-radius: 99px;
    background: ${({ theme }) => theme.color.track};
    overflow: hidden;

    &::after {
      content: "";
      display: block;
      width: ${({ $pct }) => $pct}%;
      height: 100%;
      background: linear-gradient(
        90deg,
        ${({ theme }) => theme.color.accent},
        ${({ theme }) => theme.color.good}
      );
    }
  }

  b {
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    text-align: right;
    color: ${({ theme }) => theme.color.text};
  }
`;

export const AuthHeroFoot = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.color.muted};
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

/* ---- Form primitives shared by Login + Setup + Recover ------------------ */
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

export const AuthModes = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin-top: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
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
