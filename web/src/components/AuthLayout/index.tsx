import type { ReactNode } from "react";
import { BrandDot } from "../ui/styles";
import * as S from "./styles";

interface AuthLayoutProps {
  readonly children: ReactNode;
}

const HERO_GAUGES = [
  { label: "CPU", value: 42 },
  { label: "MEM", value: 61 },
  { label: "DSK", value: 28 },
] as const;

function HeroGauge({ label, value }: { label: string; value: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return (
    <S.AuthHeroGauge>
      <svg viewBox="0 0 88 88" aria-hidden="true">
        <circle className="track" cx="44" cy="44" r={radius} />
        <circle
          className="arc"
          cx="44"
          cy="44"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <strong>{value}%</strong>
      <span>{label}</span>
    </S.AuthHeroGauge>
  );
}

/**
 * Auth shell: CSS-drawn telemetry backdrop with a glass window. The left
 * pane holds the form; the right pane is a decorative host readout so login
 * matches the dashboard instead of a stock photo.
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
        <S.AuthHero aria-hidden="true">
          <S.AuthHeroFrame>
            <S.AuthHeroScan />
            <S.AuthHeroMeta>
              <span>Host telemetry</span>
              <S.AuthHeroLive>Online</S.AuthHeroLive>
            </S.AuthHeroMeta>
            <S.AuthHeroGauges>
              {HERO_GAUGES.map((g) => (
                <HeroGauge key={g.label} label={g.label} value={g.value} />
              ))}
            </S.AuthHeroGauges>
            <S.AuthHeroBars>
              <S.AuthHeroBar $pct={42}>
                CPU
                <i />
                <b>42%</b>
              </S.AuthHeroBar>
              <S.AuthHeroBar $pct={61}>
                MEM
                <i />
                <b>61%</b>
              </S.AuthHeroBar>
              <S.AuthHeroBar $pct={28}>
                DSK
                <i />
                <b>28%</b>
              </S.AuthHeroBar>
            </S.AuthHeroBars>
            <S.AuthHeroFoot>local host · encrypted session</S.AuthHeroFoot>
          </S.AuthHeroFrame>
        </S.AuthHero>
      </S.AuthWindow>
    </S.AuthScreen>
  );
}
