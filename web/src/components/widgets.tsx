import type { ReactNode } from "react";

export function Card({
  title,
  span = 1,
  children,
}: {
  title: string;
  span?: number;
  children: ReactNode;
}) {
  return (
    <section className="card" style={{ gridColumn: `span ${span}` }}>
      <h2 className="card-title">{title}</h2>
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function colorFor(value: number): string {
  if (value >= 85) return "var(--bad)";
  if (value >= 60) return "var(--warn)";
  return "var(--good)";
}

export function Gauge({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = colorFor(clamped);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="gauge">
      <svg className="gauge-svg" viewBox="0 0 120 120">
        <circle className="gauge-track" cx="60" cy="60" r={radius} />
        <circle
          className="gauge-arc"
          cx="60"
          cy="60"
          r={radius}
          style={{
            stroke: color,
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="gauge-inner">
        <span className="gauge-value">{Math.round(clamped)}%</span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  );
}

export function Bar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="bar">
      <div
        className="bar-fill"
        style={{ width: `${clamped}%`, background: colorFor(clamped) }}
      />
    </div>
  );
}

export function LabeledBar({
  label,
  value,
  max,
  valueText,
}: {
  label: string;
  value: number;
  max: number;
  valueText: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="lbar">
      <div className="lbar-head">
        <span className="lbar-label">{label}</span>
        <span className="lbar-value">{valueText}</span>
      </div>
      <div className="bar">
        <div
          className="bar-fill"
          style={{ width: `${percent}%`, background: colorFor(percent) }}
        />
      </div>
    </div>
  );
}
