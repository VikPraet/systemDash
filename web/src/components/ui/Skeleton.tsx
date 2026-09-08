import type { ReactNode } from "react";
import styled, { css } from "styled-components";
import { ChartCardRoot } from "../widgets/styles";
import { mobile } from "../../theme/media";

export const shineOverlay = css`
  background-color: color-mix(in srgb, ${({ theme }) => theme.color.text} 8%, transparent);
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, ${({ theme }) => theme.color.text} 24%, transparent) 50%,
    transparent 100%
  );
  background-size: 220% 100%;
  background-repeat: no-repeat;
  animation: skeleton-shine 1.55s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: skeleton-pulse 1.6s ease-in-out infinite;
    background-image: none;
  }
`;

export const Shine = styled.div`
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  pointer-events: none;
`;

export const Bone = styled.div<{
  $w?: string;
  $h?: number | string;
  $r?: string;
  $flex?: boolean;
}>`
  ${shineOverlay}
  width: ${({ $w }) => $w ?? "100%"};
  height: ${({ $h }) => (typeof $h === "number" ? `${$h}px` : $h ?? "10px")};
  border-radius: ${({ $r, theme }) => $r ?? theme.radius.sm};
  flex-shrink: 0;
  ${({ $flex }) => $flex && "flex: 1; min-height: 0;"}
`;

const KvGrid = styled.div<{ $cols?: number; $tight?: boolean }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 2}, minmax(0, 1fr));
  gap: ${({ $tight }) => ($tight ? "10px 20px" : "12px 24px")};

  @media ${mobile} {
    grid-template-columns: 1fr;
  }
`;

const StatCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Split = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;

  @media ${mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
`;

const Readouts = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const GaugeRing = styled.div`
  ${shineOverlay}
  width: 120px;
  height: 120px;
  flex-shrink: 0;
  border-radius: 50%;
  box-sizing: border-box;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 11px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 11px));
`;

const Stack = styled.div<{ $gap?: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => $gap ?? 12}px;
  min-height: 0;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
`;

const Cores = styled.div`
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 46px;
  margin-top: 4px;
`;

const Core = styled.div<{ $h: number }>`
  ${shineOverlay}
  flex: 1;
  height: ${({ $h }) => $h}%;
  border-radius: 0;
`;

const Teaser = styled.div<{ $nested?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.color.panel2};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};

  ${({ $nested }) =>
    !$nested &&
    css`
      & + & {
        margin-top: 10px;
      }
    `}
`;

const TeaserTitle = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`;

const ChartPlot = styled.div`
  ${shineOverlay}
  flex: 1;
  min-height: 88px;
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const Caption = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const LoadingFrame = styled.div`
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: ${({ theme }) => theme.elev};
  padding: 22px 20px 18px;
  color: ${({ theme }) => theme.color.muted};
`;

const LoadingCaption = styled.div`
  margin-top: 14px;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.color.muted};
`;

const CORE_HEIGHTS = [42, 68, 35, 80, 54, 72, 28, 90, 48, 63, 77, 40, 58, 85, 33, 70];

function StatBones({ n, tight }: { n: number; tight?: boolean }) {
  const widths = ["72%", "58%", "84%", "46%", "66%", "78%", "52%", "70%"];
  return (
    <KvGrid $cols={tight ? 1 : 2} $tight={tight}>
      {Array.from({ length: n }, (_, i) => (
        <StatCol key={i}>
          <Bone $w="38%" $h={8} />
          <Bone $w={widths[i % widths.length]} $h={12} />
        </StatCol>
      ))}
    </KvGrid>
  );
}

function BarBone() {
  return (
    <Stack $gap={6}>
      <Row>
        <Bone $w="28%" $h={8} />
        <Bone $w="18%" $h={8} style={{ marginLeft: "auto" }} />
      </Row>
      <Bone $h={10} $r="var(--bar-radius)" />
    </Stack>
  );
}

function GaugeBlock({ readouts = 2 }: { readouts?: number }) {
  return (
    <Split>
      <GaugeRing />
      <Readouts>
        {Array.from({ length: readouts }, (_, i) => (
          <StatCol key={i}>
            <Bone $w={i === 0 ? "56%" : "40%"} $h={i === 0 ? 26 : 16} />
            <Bone $w="32%" $h={8} />
          </StatCol>
        ))}
      </Readouts>
    </Split>
  );
}

export function TeaserSkeleton({
  title,
  nested = false,
}: {
  title?: string;
  nested?: boolean;
}) {
  return (
    <Teaser $nested={nested} data-skel-teaser role="status" aria-busy="true">
      <Bone $w="32px" $h={32} $r="var(--radius-sm)" />
      <Stack $gap={8} style={{ flex: 1 }}>
        {title ? <TeaserTitle>{title}</TeaserTitle> : <Bone $w="44%" $h={11} />}
        <Bone $w="62%" $h={9} />
      </Stack>
    </Teaser>
  );
}

function ChartSkeleton() {
  return (
    <ChartCardRoot className="chart-card" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Stack $gap={8} style={{ marginBottom: 14 }}>
        <Bone $w="34%" $h={12} />
        <Bone $w="48%" $h={8} />
      </Stack>
      <ChartPlot />
    </ChartCardRoot>
  );
}

function bodyFor(kind: string): ReactNode {
  if (kind === "cpu") {
    return (
      <>
        <GaugeBlock />
        <StatBones n={2} tight />
        <BarBone />
        <Cores>
          {CORE_HEIGHTS.map((h, i) => (
            <Core key={i} $h={h} />
          ))}
        </Cores>
      </>
    );
  }
  if (kind === "memory") {
    return (
      <>
        <GaugeBlock readouts={1} />
        <BarBone />
        <BarBone />
        <StatBones n={1} tight />
      </>
    );
  }
  if (kind === "storage") {
    return (
      <Stack $gap={16}>
        {["42%", "28%", "36%"].map((w) => (
          <Stack $gap={6} key={w}>
            <Row>
              <Bone $w={w} $h={10} />
              <Bone $w="12%" $h={8} style={{ marginLeft: "auto" }} />
            </Row>
            <Bone $h={10} $r="var(--bar-radius)" />
            <Bone $w="64%" $h={8} />
          </Stack>
        ))}
      </Stack>
    );
  }
  if (kind === "gpu") {
    return (
      <Stack $gap={14}>
        <Bone $w="46%" $h={12} />
        <BarBone />
        <BarBone />
        <BarBone />
        <StatBones n={4} />
      </Stack>
    );
  }
  if (kind === "updates") {
    return (
      <>
        <TeaserSkeleton nested />
        <TeaserSkeleton nested />
      </>
    );
  }
  if (kind === "power") {
    return (
      <Stack $gap={14}>
        <Bone $w="88%" $h={8} />
        <Bone $w="64%" $h={8} />
        <Row>
          <Bone $w="96px" $h={32} $r="var(--radius-sm)" />
          <Bone $w="108px" $h={32} $r="var(--radius-sm)" />
          <Bone $w="128px" $h={32} $r="var(--radius-sm)" />
        </Row>
      </Stack>
    );
  }
  if (kind === "access") {
    return (
      <Stack $gap={14}>
        <Row>
          <Bone $w="28%" $h={12} />
          <Bone $w="72px" $h={22} $r="var(--radius-sm)" style={{ marginLeft: "auto" }} />
        </Row>
        <Bone $w="92%" $h={8} />
        <Bone $w="74%" $h={8} />
        <Bone $w="100%" $h={34} $r="var(--radius-sm)" />
        <Bone $w="56%" $h={8} />
        <Bone $w="40%" $h={8} />
      </Stack>
    );
  }
  if (kind === "chart" || kind.startsWith("chart:")) {
    return <ChartSkeleton />;
  }
  return <StatBones n={kind === "system" ? 6 : 4} />;
}

export function WidgetSkeleton({
  kind,
  label,
}: {
  kind: string;
  label?: string;
}) {
  const inner = bodyFor(kind);
  const framed = kind === "chart" || kind.startsWith("chart:");
  return (
    <Shine aria-hidden>
      {framed ? inner : <Stack $gap={14}>{inner}</Stack>}
      <Caption>{label ? `Loading ${label}` : "Loading"}</Caption>
    </Shine>
  );
}

export function PanelSkeleton({
  label,
  variant = "lines",
}: {
  label?: string;
  variant?: "lines" | "buttons" | "teasers" | "gauge";
}) {
  return (
    <Shine role="status" aria-busy="true" aria-label={label ?? "Loading"}>
      <Stack $gap={14}>
        {variant === "buttons" && bodyFor("power")}
        {variant === "teasers" && bodyFor("updates")}
        {variant === "gauge" && bodyFor("memory")}
        {variant === "lines" && bodyFor("access")}
      </Stack>
      {label ? <Caption>{label}</Caption> : null}
    </Shine>
  );
}

export function Loading({ children }: { children?: ReactNode }) {
  return (
    <LoadingFrame role="status" aria-live="polite" aria-busy="true">
      <Stack $gap={10}>
        <Bone $w="34%" $h={11} />
        <Bone $w="92%" />
        <Bone $w="76%" />
        <Bone $w="84%" />
        <Bone $w="58%" />
      </Stack>
      {children ? <LoadingCaption>{children}</LoadingCaption> : null}
    </LoadingFrame>
  );
}
