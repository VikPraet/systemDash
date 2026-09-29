import { useEffect, useMemo, useRef, useState } from "react";
import { fetchHistory, fetchHistoryStats } from "../../api";
import { cache } from "../../cache";
import { subscribeSystemSnapshot } from "../../systemStream";
import type { HistorySeries, HistoryStats, SystemSnapshot } from "../../types";
import { liveSnapshots, overlayLiveHistory, pushLiveSnapshot } from "./liveOverlay";

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

function historyCacheMatchesRange(): boolean {
  return cache.history.data != null && cache.history.dataRangeId === cache.history.rangeId;
}

export function useHistoryFeed(enabled = true) {
  const [rangeId, setRangeId] = useState<string>(() => cache.history.rangeId);
  const [recorded, setRecorded] = useState<HistorySeries | null>(() => cache.history.data);
  const [data, setData] = useState<HistorySeries | null>(() => cache.history.data);
  const [stats, setStats] = useState<HistoryStats | null>(() => cache.history.stats);
  const [snap, setSnap] = useState<SystemSnapshot | null>(() => cache.snapshot);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !historyCacheMatchesRange());
  const recordedRef = useRef<HistorySeries | null>(recorded);
  const rangeIdRef = useRef(rangeId);
  /** Range id whose series is currently on screen. Null until that range has loaded. */
  const shownRangeRef = useRef<string | null>(
    historyCacheMatchesRange() ? cache.history.rangeId : null
  );

  const range = useMemo(
    () => HISTORY_RANGES.find((r) => r.id === rangeId) ?? HISTORY_RANGES[0],
    [rangeId]
  );

  function selectRange(id: string) {
    if (id === rangeIdRef.current) return;
    cache.history.rangeId = id;
    rangeIdRef.current = id;
    setLoading(true);
    setRangeId(id);
  }

  useEffect(() => {
    recordedRef.current = recorded;
  }, [recorded]);

  useEffect(() => {
    rangeIdRef.current = rangeId;
  }, [rangeId]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeSystemSnapshot({
      onSnapshot(s) {
        cache.snapshot = s;
        setSnap(s);
        pushLiveSnapshot(s);
        if (rangeIdRef.current !== "live") return;
        const next = overlayLiveHistory(
          recordedRef.current,
          liveSnapshots(),
          HISTORY_RANGES[0].ms,
          Date.now()
        );
        cache.history.data = next;
        setData(next);
      },
    });
  }, [enabled]);

  const intervalSeconds = stats?.intervalSeconds ?? 5;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const intervalMs = Math.max(1000, intervalSeconds * 1000);
    const points = Math.min(range.points, Math.max(2, Math.floor(range.ms / intervalMs)));
    // Live charts get 1s samples from SSE. The recorder still writes at
    // intervalSeconds; we only refresh that SQLite series at the save cadence.
    const refreshMs = range.id === "live" ? intervalMs : range.refreshMs;

    function applyRecorded(series: HistorySeries, st: HistoryStats) {
      recordedRef.current = series;
      setRecorded(series);
      cache.history.stats = st;
      setStats(st);
      const next =
        range.id === "live"
          ? overlayLiveHistory(series, liveSnapshots(), range.ms, Date.now())
          : series;
      cache.history.data = next;
      cache.history.dataRangeId = range.id;
      shownRangeRef.current = range.id;
      setData(next);
      setError(null);
      setLoading(false);
    }

    // A newer load (range change, or the next poll) supersedes an older one so
    // a slow 30-day query can't land after the user has already moved on.
    let seq = 0;

    async function load() {
      const mine = ++seq;
      try {
        const now = Date.now();
        const [series, st] = await Promise.all([
          fetchHistory(now - range.ms, now, points, ctrl.signal),
          fetchHistoryStats(ctrl.signal),
        ]);
        if (cancelled || mine !== seq) return;
        applyRecorded(series, st);
      } catch (e) {
        if (cancelled || mine !== seq) return;
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setLoading(false);
      }
    }

    if (shownRangeRef.current !== range.id) setLoading(true);

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

  return { rangeId, range, selectRange, data, stats, snap, error, loading, refreshStats };
}
