import { useId } from "react";
import styled, { keyframes } from "styled-components";

const pulseCore = keyframes`
  0%,
  100% { opacity: 1; }
  50% { opacity: 0.72; }
`;

const Svg = styled.svg`
  display: block;
  flex-shrink: 0;
  border-radius: 7px;

  .core {
    animation: ${pulseCore} 2.4s ease-in-out infinite;
  }
`;

export function Logo({ size = 28 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const core = `logo-core-${uid}`;
  const glow = `logo-glow-${uid}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={core} x1="16" y1="9" x2="16" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--good)" />
        </linearGradient>
        <radialGradient id={glow} cx="16" cy="16" r="11" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.38" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        fill="var(--panel-2)"
        stroke="var(--border)"
        strokeWidth="1"
      />
      <circle cx="16" cy="16" r="11" fill={`url(#${glow})`} />
      <circle
        cx="16"
        cy="16"
        r="10.15"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.15"
        opacity="0.42"
      />
      <circle cx="16" cy="16" r="7.05" fill="none" stroke="var(--accent)" strokeWidth="1.9" />
      <circle className="core" cx="16" cy="16" r="3.35" fill={`url(#${core})`} />
    </Svg>
  );
}
