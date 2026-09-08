import { useEffect, useMemo, useRef, useState } from "react";
import { fetchHistory, fetchHistoryStats, fetchSnapshot } from "../../api";
import { cache } from "../../cache";
import type { HistorySeries, HistoryStats, SystemSnapshot } from "../../types";

export interface RangePreset {
  id: string;
  label: string;
  ms: number;
  points: number;
  refreshMs: number;
}

export const HISTORY_RANGES: RangePreset[] = [
  { id: "live", label: "Live", ms: 5 * 60_000, points: 300, refreshMs: 1_500 },
  { id: "15m", label: "15 min", ms: 15 * 60_000, points: 900, refreshMs: 2_000 },
  { id: "1h", label: "1 hour", ms: 60 * 60_000, points: 720, refreshMs: 5_000 },
  { id: "6h", label: "6 hours", ms: 6 * 3_600_000, points: 480, refreshMs: 15_000 },
  { id: "24h", label: "24 hours", ms: 24 * 3_600_000, points: 480, refreshMs: 30_000 },
  { id: "7d", label: "7 days", ms: 7 * 86_400_000, points: 500, refreshMs: 60_000 },
  { id: "30d", label: "30 days", ms: 30 * 86_400_000, points: 500, refreshMs: 120_000 },
];

export function useHistoryFeed(enabled = true) {
  const [rangeId, setRangeId] = useState<string>(() => cache.history.rangeId);
  const [data, setData] = useState<HistorySeries | null>(() => cache.history.data);
  const [stats, setStats] = useState<HistoryStats | null>(() => cache.history.stats);
  const [snap, setSnap] = useState<SystemSnapshot | null>(() => cache.snapshot);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const range = useMemo(
    () => HISTORY_RANGES.find((r) => r.id === rangeId) ?? HISTORY_RANGES[0],
    [rangeId]
  );

  function selectRange(id: string) {
    cache.history.rangeId = id;
    setRangeId(id);
  }

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    fetchSnapshot(ctrl.signal)
      .then((s) => {
        cache.snapshot = s;
        setSnap(s);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [enabled]);

  const intervalSeconds = stats?.intervalSeconds ?? 5;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const intervalMs = Math.max(1000, intervalSeconds * 1000);
    const points = Math.min(range.points, Math.max(2, Math.floor(range.ms / intervalMs)));
    const refreshMs =
      range.id === "live" ? Math.min(10_000, Math.max(1000, intervalMs)) : range.refreshMs;

    async function load() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const now = Date.now();
        const [series, st] = await Promise.all([
          fetchHistory(now - range.ms, now, points, ctrl.signal),
          fetchHistoryStats(ctrl.signal),
        ]);
        if (!cancelled) {
          cache.history.data = series;
          cache.history.stats = st;
          setData(series);
          setStats(st);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError((e as Error).message);
        }
      } finally {
        inFlight.current = false;
      }
    }

    load();
    const id = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(id);
    };
  }, [enabled, range, intervalSeconds]);

  function refreshStats() {
    fetchHistoryStats()
      .then((st) => {
        cache.history.stats = st;
        setStats(st);
      })
      .catch(() => {});
  }

  return { rangeId, range, selectRange, data, stats, snap, error, refreshStats };
}
