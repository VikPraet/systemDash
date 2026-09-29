import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fetchNetUsage } from "../../api";
import type { ByteUnit, NetUsageBucket, NetUsageSeries } from "../../types";
import { UsageBarChart } from "../widgets/UsageBarChart";
import * as S from "./styles";

const UNIT_KEY = "beacon.netUsageUnit";
const RANGE_KEY = "beacon.netUsageRange";
const OPEN_KEY = "beacon.netUsageOpen";

type RangeId = "24h" | "7d" | "30d";

const RANGES: {
  id: RangeId;
  label: string;
  ms: number;
  bucket: NetUsageBucket;
}[] = [
  { id: "24h", label: "24h", ms: 24 * 3_600_000, bucket: "hour" },
  { id: "7d", label: "7d", ms: 7 * 86_400_000, bucket: "day" },
  { id: "30d", label: "30d", ms: 30 * 86_400_000, bucket: "day" },
];

const UNITS: ByteUnit[] = ["auto", "KB", "MB", "GB"];

function readStore<T extends string>(key: string, fallback: T, ok: T[]): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (ok as string[]).includes(v)) return v as T;
  } catch {
    /* private mode */
  }
  return fallback;
}

function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function formatBucketTime(ms: number, bucketMs: number): string {
  const d = new Date(ms);
  if (bucketMs >= 86_400_000) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UsageTimeline() {
  const [open, setOpen] = useState(
    () => readStore(OPEN_KEY, "1", ["0", "1"]) === "1"
  );
  const [rangeId, setRangeId] = useState<RangeId>(() =>
    readStore(RANGE_KEY, "24h", ["24h", "7d", "30d"])
  );
  const [unit, setUnit] = useState<ByteUnit>(() =>
    readStore(UNIT_KEY, "auto", UNITS)
  );
  const [data, setData] = useState<NetUsageSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0]!;

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const to = Date.now();
        const from = to - range.ms;
        const next = await fetchNetUsage(from, to, range.bucket, ctrl.signal);
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== "AbortError") {
          setError((err as Error)?.message || "Failed to load usage");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, [range.ms, range.bucket]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    writeStore(OPEN_KEY, next ? "1" : "0");
  }

  function pickRange(id: RangeId) {
    setRangeId(id);
    writeStore(RANGE_KEY, id);
  }

  function pickUnit(u: ByteUnit) {
    setUnit(u);
    writeStore(UNIT_KEY, u);
  }

  return (
    <S.UsageOverlay $open={open}>
      <S.UsageHead>
        <button type="button" className="usage-toggle" onClick={toggleOpen}>
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span>Data usage</span>
        </button>
        {open && (
          <S.UsageControls>
            <S.UsageChipGroup>
              {RANGES.map((r) => (
                <S.UsageChip
                  key={r.id}
                  type="button"
                  $active={r.id === rangeId}
                  onClick={() => pickRange(r.id)}
                >
                  {r.label}
                </S.UsageChip>
              ))}
            </S.UsageChipGroup>
            <S.UsageChipGroup>
              {UNITS.map((u) => (
                <S.UsageChip
                  key={u}
                  type="button"
                  $active={unit === u}
                  onClick={() => pickUnit(u)}
                >
                  {u === "auto" ? "Auto" : u}
                </S.UsageChip>
              ))}
            </S.UsageChipGroup>
          </S.UsageControls>
        )}
      </S.UsageHead>
      {open && (
        <S.UsageBody>
          {error ? (
            <S.UsageEmpty>Could not load usage: {error}</S.UsageEmpty>
          ) : loading && !data ? (
            <S.UsageEmpty>Loading usage…</S.UsageEmpty>
          ) : (
            <UsageBarChart
              data={data}
              unit={unit}
              height={168}
              formatTime={formatBucketTime}
              emptyLabel="Usage appears after the history recorder has run"
            />
          )}
        </S.UsageBody>
      )}
    </S.UsageOverlay>
  );
}
