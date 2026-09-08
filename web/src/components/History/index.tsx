import { useEffect, useMemo, useState } from "react";
import {
  clearHistory,
  fetchSettings,
  formatBytes,
  formatDate,
  saveSettings,
} from "../../api";
import { cache } from "../../cache";
import type { HistorySettings, HistoryStats, Settings } from "../../types";
import { Bar, Stat } from "../widgets";
import { useAuth, hasRole } from "../../auth/AuthContext";
import { ModalBtn } from "../ui/styles";
import { CardTitle } from "../widgets/styles";
import { DashboardGrid } from "../dashboard/DashboardGrid";
import { packDefaults } from "../dashboard/grid";
import { HISTORY_RANGES, useHistoryFeed } from "./useHistoryFeed";
import { buildHistoryCharts, formatResolution, makeTimeFmt } from "./charts";
import * as S from "./styles";

export function History() {
  const { user } = useAuth();
  const canWrite = hasRole(user, "user");
  const { rangeId, range, selectRange, data, stats, snap, error, refreshStats } =
    useHistoryFeed(true);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullscreenId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenId]);

  const timeFmt = useMemo(() => makeTimeFmt(range.ms), [range.ms]);
  const t = data?.t ?? [];
  const fsProps = (id: string, fs: boolean) => ({
    onFullscreen: fs ? undefined : () => setFullscreenId(id),
    onExitFullscreen: fs ? () => setFullscreenId(null) : undefined,
  });
  const charts = useMemo(
    () => buildHistoryCharts({ data, snap, timeFmt, fsProps }),
    [data, snap, timeFmt]
  );
  const fullscreenChart = fullscreenId ? charts.find((c) => c.id === fullscreenId) : null;
  const chartDefaults = packDefaults(
    charts.map((c) => c.id),
    { x: 0, y: 0, w: 6, h: 4 }
  );

  return (
    <S.HistoryRoot>
      <S.HistoryToolbar>
        <S.Seg>
          {HISTORY_RANGES.map((r) => (
            <button
              key={r.id}
              className={r.id === rangeId ? "active" : ""}
              onClick={() => selectRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </S.Seg>
        {(stats || (data && t.length > 0)) && (
          <S.HistoryMeta className="muted">
            {stats && (
              <>
                Recording every {stats.intervalSeconds}s
                {!stats.enabled && " (paused)"}
              </>
            )}
            {data && t.length > 0 && (
              <>
                {stats ? " · " : ""}chart {formatResolution(data.bucketMs)} · {t.length}{" "}
                pts
              </>
            )}
          </S.HistoryMeta>
        )}
      </S.HistoryToolbar>

      {error && <S.HistoryError>Could not load history: {error}</S.HistoryError>}

      {stats && !stats.enabled && (
        <S.HistoryNotice>
          Recording is currently <strong>off</strong>. Enable it below to start
          collecting metrics.
        </S.HistoryNotice>
      )}

      {charts.length > 0 && (
        <DashboardGrid
          pageId="history"
          items={charts.map((c) => ({
            id: c.id,
            label: c.label,
            minW: 4,
            minH: 3,
            default: chartDefaults[c.id] ?? { x: 0, y: 0, w: 6, h: 4 },
            node: c.render(false),
          }))}
        />
      )}

      {charts.length === 0 && (
        <S.HistoryNotice>No charts to show yet.</S.HistoryNotice>
      )}

      <StoragePanel stats={stats} canWrite={canWrite} onChanged={refreshStats} />

      {fullscreenChart && (
        <S.ChartFsOverlay
          role="dialog"
          aria-modal="true"
          onClick={() => setFullscreenId(null)}
        >
          <S.ChartFsBody onClick={(e) => e.stopPropagation()}>
            {fullscreenChart.render(true)}
          </S.ChartFsBody>
        </S.ChartFsOverlay>
      )}
    </S.HistoryRoot>
  );
}

function StoragePanel({
  stats,
  canWrite,
  onChanged,
}: {
  stats: HistoryStats | null;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<HistorySettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(cache.settings.history);
    fetchSettings()
      .then((s) => {
        cache.settings = s;
        setDraft(s.history);
      })
      .catch(() => {});
  }, []);

  if (!draft) return null;

  const dirty =
    !!stats &&
    (draft.enabled !== stats.enabled ||
      draft.intervalSeconds !== stats.intervalSeconds ||
      draft.retentionDays !== stats.retentionDays ||
      draft.maxSizeMb !== stats.maxSizeMb);

  async function save() {
    if (busy || !draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const next: Settings = { ...cache.settings, history: draft };
      const saved = await saveSettings(next);
      cache.settings = saved;
      setDraft(saved.history);
      onChanged();
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doClear() {
    setBusy(true);
    setMsg(null);
    try {
      await clearHistory();
      onChanged();
      setConfirmClear(false);
      setMsg("History cleared.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const usedPct =
    stats && stats.maxSizeMb > 0
      ? (stats.dbBytes / (stats.maxSizeMb * 1024 * 1024)) * 100
      : 0;

  return (
    <S.StoragePanel>
      <CardTitle as="h2">Storage &amp; recording</CardTitle>

      <S.StorageGrid>
        <S.StorageStats>
          {stats ? (
            <>
              <S.KvTight>
                <Stat label="On disk" value={formatBytes(stats.dbBytes)} />
                <Stat
                  label="Samples stored"
                  value={stats.rowCount.toLocaleString()}
                />
                <Stat
                  label="Per sample"
                  value={
                    stats.bytesPerSample > 0
                      ? formatBytes(stats.bytesPerSample)
                      : "—"
                  }
                />
                <Stat label="Oldest record" value={formatDate(stats.oldest)} />
                <Stat
                  label="Est. headroom"
                  value={
                    stats.estimatedDaysToFull != null
                      ? `~${stats.estimatedDaysToFull.toFixed(1)} days`
                      : "unlimited"
                  }
                />
              </S.KvTight>
              {stats.maxSizeMb > 0 && (
                <S.StorageBar>
                  <Bar value={usedPct} />
                  <S.StorageBarFoot className="muted">
                    {formatBytes(stats.dbBytes)} of {stats.maxSizeMb} MB cap (
                    {usedPct.toFixed(usedPct < 10 ? 1 : 0)}%)
                  </S.StorageBarFoot>
                </S.StorageBar>
              )}
            </>
          ) : (
            <div className="muted">Loading storage stats…</div>
          )}
        </S.StorageStats>

        {canWrite && (
          <S.StorageForm>
            <S.ToggleRow
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
            >
              <S.ToggleText>
                <S.ToggleLabel>Record metrics</S.ToggleLabel>
                <S.ToggleDesc>
                  Sample and store system stats in the background.
                </S.ToggleDesc>
              </S.ToggleText>
              <S.Switch $on={draft.enabled}>
                <S.SwitchKnob />
              </S.Switch>
            </S.ToggleRow>

            <NumberField
              label="Sample interval"
              unit="seconds"
              min={1}
              max={3600}
              value={draft.intervalSeconds}
              onChange={(v) => setDraft({ ...draft, intervalSeconds: v })}
            />
            <NumberField
              label="Keep history for"
              unit="days (0 = no age limit)"
              min={0}
              max={3650}
              value={draft.retentionDays}
              onChange={(v) => setDraft({ ...draft, retentionDays: v })}
            />
            <NumberField
              label="Max database size"
              unit="MB (0 = no size limit)"
              min={0}
              max={1048576}
              value={draft.maxSizeMb}
              onChange={(v) => setDraft({ ...draft, maxSizeMb: v })}
            />

            <S.StorageActions>
              <ModalBtn
                type="button"
                $variant="danger-ghost"
                onClick={() => setConfirmClear(true)}
                disabled={busy}
              >
                Clear history
              </ModalBtn>
              <S.StorageActionsRight>
                {msg && <S.StorageMsg className="muted">{msg}</S.StorageMsg>}
                <ModalBtn
                  type="button"
                  $variant="primary"
                  onClick={save}
                  disabled={busy || !dirty}
                >
                  {busy ? "Saving…" : "Save"}
                </ModalBtn>
              </S.StorageActionsRight>
            </S.StorageActions>
          </S.StorageForm>
        )}
      </S.StorageGrid>

      {confirmClear && (
        <S.StorageConfirm>
          <span>Permanently delete all recorded history?</span>
          <S.StorageConfirmActions>
            <ModalBtn
              type="button"
              onClick={() => setConfirmClear(false)}
              disabled={busy}
            >
              Cancel
            </ModalBtn>
            <ModalBtn
              type="button"
              $variant="danger"
              onClick={doClear}
              disabled={busy}
            >
              Delete everything
            </ModalBtn>
          </S.StorageConfirmActions>
        </S.StorageConfirm>
      )}
    </S.StoragePanel>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <S.NumField>
      <S.NumFieldLabel>{label}</S.NumFieldLabel>
      <S.NumFieldInput>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.max(min, Math.min(max, Math.round(n))));
          }}
        />
        <S.NumFieldUnit className="muted">{unit}</S.NumFieldUnit>
      </S.NumFieldInput>
    </S.NumField>
  );
}
