import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { GeoLocation, NetworkConnection } from "../../types";
import { MAP_HEIGHT, MAP_WIDTH, WORLD_LAND_PATH, project } from "./worldPath";
import * as S from "./styles";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.28;
const DRAG_THRESHOLD = 4;

export interface MapDestination {
  key: string;
  lat: number;
  lon: number;
  label: string;
  count: number;
  outbound: number;
  inbound: number;
  peer: number;
  /** Relative traffic weight (rates when known, else connection count). */
  traffic: number;
  /** −1 = all inbound … 0 = mixed … +1 = all outbound */
  dirBias: number;
  x: number;
  y: number;
}

/** Map filter key for the host origin — opens all remote connections. */
export const HOST_FILTER = "__host__";

export function isHostFilter(key: string | null | undefined): boolean {
  return key === HOST_FILTER;
}

export function destinationKey(c: NetworkConnection): string | null {
  const loc = c.location;
  if (
    loc?.lat != null &&
    loc?.lon != null &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lon)
  ) {
    return `${loc.lat.toFixed(1)},${loc.lon.toFixed(1)}`;
  }
  if (c.peerAddress) return `ip:${c.peerAddress}`;
  return null;
}

function connTraffic(c: NetworkConnection): number {
  const rx = c.rxSec ?? 0;
  const tx = c.txSec ?? 0;
  if (rx > 0 || tx > 0) return rx + tx;
  // Fall back to lifetime bytes so Linux first-sample still differentiates.
  const bi = c.bytesIn ?? 0;
  const bo = c.bytesOut ?? 0;
  if (bi > 0 || bo > 0) return Math.log10(1 + bi + bo);
  return 1;
}

type DestBucket = {
  lat: number;
  lon: number;
  label: string;
  count: number;
  outbound: number;
  inbound: number;
  peer: number;
  traffic: number;
  outTraffic: number;
  inTraffic: number;
};

function dirBiasOf(b: DestBucket): number {
  const out = b.outTraffic + b.outbound;
  const inn = b.inTraffic + b.inbound;
  const denom = out + inn + b.peer;
  if (denom <= 0) return 0;
  return (out - inn) / denom;
}

export function aggregateDestinations(
  connections: NetworkConnection[]
): MapDestination[] {
  const buckets = new Map<string, DestBucket>();

  for (const c of connections) {
    if (c.kind !== "remote") continue;
    const loc = c.location;
    if (
      !loc ||
      loc.status !== "resolved" ||
      loc.lat == null ||
      loc.lon == null ||
      !Number.isFinite(loc.lat) ||
      !Number.isFinite(loc.lon)
    ) {
      continue;
    }
    const key = `${loc.lat.toFixed(1)},${loc.lon.toFixed(1)}`;
    const t = connTraffic(c);
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.traffic += t;
      if (c.direction === "outbound") {
        existing.outbound += 1;
        existing.outTraffic += t;
      } else if (c.direction === "inbound") {
        existing.inbound += 1;
        existing.inTraffic += t;
      } else {
        existing.peer += 1;
      }
    } else {
      buckets.set(key, {
        lat: loc.lat,
        lon: loc.lon,
        label: loc.label,
        count: 1,
        outbound: c.direction === "outbound" ? 1 : 0,
        inbound: c.direction === "inbound" ? 1 : 0,
        peer: c.direction === "peer" ? 1 : 0,
        traffic: t,
        outTraffic: c.direction === "outbound" ? t : 0,
        inTraffic: c.direction === "inbound" ? t : 0,
      });
    }
  }

  return [...buckets.entries()]
    .map(([key, b]) => {
      const { x, y } = project(b.lon, b.lat);
      return {
        key,
        lat: b.lat,
        lon: b.lon,
        label: b.label,
        count: b.count,
        outbound: b.outbound,
        inbound: b.inbound,
        peer: b.peer,
        traffic: b.traffic,
        dirBias: dirBiasOf(b),
        x,
        y,
      };
    })
    .sort((a, b) => b.traffic - a.traffic || b.count - a.count);
}

function arcPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1) || 1;
  const bow = Math.min(90, dist * 0.24);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${(my - bow).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Fixed screen radii (at zoom 1); scaled by markScale while zooming. */
const DOT_R_MIN = 2.2;
const DOT_R_MAX = 5.5;

/** 0..1 from connection count between current min/max on the map. */
function destWeight(count: number, minCount: number, maxCount: number): number {
  if (maxCount <= minCount) return 0.5;
  return Math.min(1, Math.max(0, (count - minCount) / (maxCount - minCount)));
}

function destRadius(weight: number, markScale: number): number {
  return (DOT_R_MIN + weight * (DOT_R_MAX - DOT_R_MIN)) * markScale;
}

type DestPhase = "enter" | "live" | "exit";

type PresentDest = MapDestination & { phase: DestPhase };

/** Color by direction only — weight no longer changes thickness/opacity. */
function arcStyle(
  dirBias: number,
  active: boolean,
  dimmed: boolean,
  markScale: number,
  phase: DestPhase
): CSSProperties {
  const out = "var(--warn)";
  const inn = "var(--good)";
  const mid = "var(--accent)";
  let stroke: string;
  if (dirBias >= 0.4) stroke = out;
  else if (dirBias <= -0.4) stroke = inn;
  else if (Math.abs(dirBias) < 0.12) stroke = mid;
  else if (dirBias > 0) {
    stroke = `color-mix(in srgb, ${out} ${Math.round(dirBias * 100)}%, ${mid})`;
  } else {
    stroke = `color-mix(in srgb, ${inn} ${Math.round(-dirBias * 100)}%, ${mid})`;
  }
  const style: CSSProperties = {
    stroke,
    strokeWidth: (active ? 0.85 : 0.7) * markScale,
    strokeDasharray: active
      ? `${1.4 * markScale} ${1.8 * markScale}`
      : `${1.2 * markScale} ${2.2 * markScale}`,
  };
  // Enter/exit keyframes own opacity; avoid fighting them with inline values.
  if (phase === "live") {
    style.opacity = active ? 0.95 : dimmed ? 0.14 : 0.72;
  }
  return style;
}

function mergePresent(
  prev: PresentDest[],
  next: MapDestination[],
  animate: boolean
): PresentDest[] {
  const prevByKey = new Map(prev.map((d) => [d.key, d]));
  const nextKeys = new Set(next.map((d) => d.key));
  const out: PresentDest[] = [];

  for (const d of next) {
    const old = prevByKey.get(d.key);
    if (!old || old.phase === "exit") {
      out.push({ ...d, phase: animate ? "enter" : "live" });
    } else {
      out.push({ ...d, phase: old.phase === "enter" ? "enter" : "live" });
    }
  }

  for (const old of prev) {
    if (nextKeys.has(old.key)) continue;
    out.push(old.phase === "exit" ? old : { ...old, phase: "exit" });
  }

  return out;
}

function dirFill(dirBias: number): string {
  if (dirBias >= 0.4) return "var(--warn)";
  if (dirBias <= -0.4) return "var(--good)";
  if (Math.abs(dirBias) < 0.12) return "var(--accent)";
  if (dirBias > 0) {
    return `color-mix(in srgb, var(--warn) ${Math.round(dirBias * 100)}%, var(--accent))`;
  }
  return `color-mix(in srgb, var(--good) ${Math.round(-dirBias * 100)}%, var(--accent))`;
}

function dirHint(d: MapDestination): string {
  if (d.outbound && !d.inbound && !d.peer) return "outbound";
  if (d.inbound && !d.outbound && !d.peer) return "inbound";
  if (d.outbound && d.inbound) return `${d.outbound} out · ${d.inbound} in`;
  if (d.dirBias > 0.2) return "mostly out";
  if (d.dirBias < -0.2) return "mostly in";
  return "mixed";
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** View size matching the screen aspect, never larger than the map. */
function viewSize(zoom: number, aspect: number) {
  // Fully zoomed out: always the whole map (letterboxed via meet if needed).
  if (zoom <= 1.001) {
    return { viewW: MAP_WIDTH, viewH: MAP_HEIGHT };
  }

  let viewH = MAP_HEIGHT / zoom;
  let viewW = viewH * aspect;

  if (viewW > MAP_WIDTH) {
    viewW = MAP_WIDTH;
    viewH = viewW / aspect;
  }
  if (viewH > MAP_HEIGHT) {
    viewH = MAP_HEIGHT;
    viewW = Math.min(MAP_WIDTH, viewH * aspect);
  }

  return { viewW, viewH };
}

function clampAxis(
  value: number,
  viewSizeAlong: number,
  mapSizeAlong: number
): number {
  if (viewSizeAlong >= mapSizeAlong) {
    return (mapSizeAlong - viewSizeAlong) / 2;
  }
  return Math.min(mapSizeAlong - viewSizeAlong, Math.max(0, value));
}

function normalizePan(
  x: number,
  y: number,
  viewW: number,
  viewH: number
) {
  return {
    x: clampAxis(x, viewW, MAP_WIDTH),
    y: clampAxis(y, viewH, MAP_HEIGHT),
  };
}

export function TrafficMap({
  origin,
  connections,
  selectedKey,
  onSelect,
}: {
  origin: GeoLocation | null;
  connections: NetworkConnection[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const destinations = useMemo(
    () => aggregateDestinations(connections),
    [connections]
  );
  const [present, setPresent] = useState<PresentDest[]>([]);
  const [hover, setHover] = useState<MapDestination | null>(null);
  const [hoverHost, setHoverHost] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ w: 1, h: 1 });

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const viewRef = useRef({ viewW: MAP_WIDTH, viewH: MAP_HEIGHT });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const primedRef = useRef(false);

  zoomRef.current = zoom;
  panRef.current = pan;

  useEffect(() => {
    setPresent((prev) => {
      const animate = primedRef.current;
      primedRef.current = true;
      return mergePresent(prev, destinations, animate);
    });
  }, [destinations]);

  function onDestAnimEnd(key: string, phase: DestPhase) {
    if (phase === "enter") {
      setPresent((prev) =>
        prev.map((d) =>
          d.key === key && d.phase === "enter" ? { ...d, phase: "live" } : d
        )
      );
    } else if (phase === "exit") {
      setPresent((prev) => prev.filter((d) => d.key !== key));
      if (selectedKey === key) onSelect(null);
      setHover((h) => (h?.key === key ? null : h));
    }
  }

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = size.w / size.h;
  const { viewW, viewH } = viewSize(zoom, aspect);
  viewRef.current = { viewW, viewH };
  const viewBox = `${pan.x} ${pan.y} ${viewW} ${viewH}`;
  // Keep markers/arcs screen-sized while the map zooms underneath.
  const markScale = viewH / MAP_HEIGHT;

  const originPt =
    origin?.lat != null &&
    origin?.lon != null &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lon)
      ? project(origin.lon, origin.lat)
      : null;

  const liveDests = present.filter((d) => d.phase !== "exit");
  const maxCount = Math.max(1, ...liveDests.map((d) => d.count), 1);
  const minCount = Math.min(
    maxCount,
    ...liveDests.map((d) => d.count),
    maxCount
  );
  const empty = destinations.length === 0 && present.length === 0;
  const hostSelected = isHostFilter(selectedKey);
  const destSelected = selectedKey != null && !hostSelected;
  const tip =
    hover ??
    present.find((d) => d.key === selectedKey && d.phase !== "exit") ??
    null;
  const remoteCount = connections.filter((c) => c.kind === "remote").length;

  const applyZoomAt = useCallback(
    (nextZoom: number, clientX: number, clientY: number) => {
      const svg = svgRef.current;
      const z = zoomRef.current;
      const p = panRef.current;
      const z2 = clampZoom(nextZoom);
      if (Math.abs(z2 - z) < 1e-6) return;

      const { viewW: curW, viewH: curH } = viewRef.current;
      const rect = svg?.getBoundingClientRect();
      const sx =
        rect && rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
      const sy =
        rect && rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;

      // Map point under the cursor before zoom.
      const focusX = p.x + sx * curW;
      const focusY = p.y + sy * curH;

      const nextAspect = curH > 0 ? curW / curH : 2;
      const next = viewSize(z2, nextAspect);

      setZoom(z2);
      setPan(
        normalizePan(
          focusX - sx * next.viewW,
          focusY - sy * next.viewH,
          next.viewW,
          next.viewH
        )
      );
    },
    []
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      applyZoomAt(
        zoomRef.current * factor,
        rect ? rect.left + rect.width / 2 : 0,
        rect ? rect.top + rect.height / 2 : 0
      );
    },
    [applyZoomAt]
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setPan((p) => {
      const next = normalizePan(p.x, p.y, viewW, viewH);
      return next.x === p.x && next.y === p.y ? p : next;
    });
  }, [viewW, viewH]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      applyZoomAt(zoomRef.current * factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoomAt]);

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originPanX: panRef.current.x,
      originPanY: panRef.current.y,
      moved: false,
    };
  }

  function cancelDrag(pointerId?: number) {
    const drag = dragRef.current;
    if (!drag) return;
    if (pointerId != null && drag.pointerId !== pointerId) return;
    const wasCaptured = drag.moved;
    dragRef.current = null;
    setDragging(false);
    if (wasCaptured) {
      try {
        svgRef.current?.releasePointerCapture(drag.pointerId);
      } catch {
        /* already released */
      }
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    // Pointer was released elsewhere (e.g. on a destination) — drop the drag.
    if (e.buttons === 0) {
      cancelDrag(e.pointerId);
      return;
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      svgRef.current?.setPointerCapture(e.pointerId);
      setDragging(true);
    }

    const rect = svgRef.current?.getBoundingClientRect();
    const { viewW: vw, viewH: vh } = viewRef.current;
    const w = rect && rect.width > 0 ? rect.width : 1;
    const h = rect && rect.height > 0 ? rect.height : 1;
    setPan(
      normalizePan(
        drag.originPanX - (dx / w) * vw,
        drag.originPanY - (dy / h) * vh,
        vw,
        vh
      )
    );
  }

  function endDrag(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.moved) suppressClickRef.current = true;
    cancelDrag(e.pointerId);
  }

  function onDestPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    // Don't let the map treat this as a pan gesture.
    e.stopPropagation();
    cancelDrag();
    suppressClickRef.current = false;
  }

  function onDestPointerUp(e: ReactPointerEvent, key: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    cancelDrag(e.pointerId);
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(selectedKey === key ? null : key);
  }

  function onHostPointerUp(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    cancelDrag(e.pointerId);
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(hostSelected ? null : HOST_FILTER);
  }

  return (
    <S.MapPanel>
      <S.MapStage>
        <S.MapSvg
          ref={svgRef}
          $dragging={dragging}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="World map of remote network destinations"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(e) => {
            e.preventDefault();
            applyZoomAt(zoomRef.current * ZOOM_STEP, e.clientX, e.clientY);
          }}
        >
          <rect
            x={0}
            y={0}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            className="map-ocean"
          />
          <path d={WORLD_LAND_PATH} className="map-land" />

          {originPt &&
            present.map((d) => {
              const active =
                d.phase !== "exit" &&
                (selectedKey === d.key || hover?.key === d.key);
              const dimmed = Boolean(
                d.phase === "live" && destSelected && selectedKey !== d.key
              );
              const dPath = arcPath(originPt.x, originPt.y, d.x, d.y);
              return (
                <g
                  key={`arc-${d.key}`}
                  className={`map-arc-lane${d.phase !== "live" ? ` ${d.phase}` : ""}`}
                  onMouseEnter={() => d.phase !== "exit" && setHover(d)}
                  onMouseLeave={() => setHover(null)}
                  onPointerDown={onDestPointerDown}
                  onPointerUp={(e) =>
                    d.phase !== "exit" && onDestPointerUp(e, d.key)
                  }
                >
                  <path
                    d={dPath}
                    className="map-arc-hit"
                    style={{ strokeWidth: Math.max(14, 18 * markScale) }}
                  />
                  <path
                    d={dPath}
                    className={`map-arc${active ? " active" : ""}`}
                    style={arcStyle(
                      d.dirBias,
                      active,
                      dimmed,
                      markScale,
                      d.phase
                    )}
                  />
                </g>
              );
            })}

          {present.map((d) => {
            const weight = destWeight(d.count, minCount, maxCount);
            const r = destRadius(weight, markScale);
            const hitR = Math.max(r + 5 * markScale, 12 * markScale);
            const fill = dirFill(d.dirBias);
            const active = d.phase !== "exit" && selectedKey === d.key;
            const dimmed = Boolean(
              d.phase === "live" && destSelected && selectedKey !== d.key
            );
            const baseOpacity = 0.65 + weight * 0.35;
            const animating = d.phase !== "live";
            return (
              <g
                key={d.key}
                className={`map-dest${active ? " active" : ""}${
                  animating ? ` ${d.phase}` : ""
                }`}
                transform={`translate(${d.x} ${d.y})`}
                onMouseEnter={() => d.phase !== "exit" && setHover(d)}
                onMouseLeave={() => setHover(null)}
                onPointerDown={onDestPointerDown}
                onPointerUp={(e) =>
                  d.phase !== "exit" && onDestPointerUp(e, d.key)
                }
                onAnimationEnd={() => onDestAnimEnd(d.key, d.phase)}
              >
                <circle r={hitR} className="map-dest-hit" />
                <g className="map-dest-mark">
                  {weight > 0.7 && (
                    <circle
                      r={r * 1.7}
                      className="map-dest-halo"
                      style={{
                        fill,
                        opacity: animating
                          ? undefined
                          : dimmed
                            ? 0.04
                            : 0.1 + weight * 0.15,
                      }}
                    />
                  )}
                  <circle
                    r={r}
                    className="map-dest-dot"
                    style={{
                      fill,
                      opacity: animating
                        ? undefined
                        : dimmed
                          ? 0.18
                          : active
                            ? 1
                            : baseOpacity,
                    }}
                  />
                </g>
              </g>
            );
          })}

          {originPt && (
            <g
              className={`map-origin${hostSelected ? " active" : ""}${
                hoverHost ? " hover" : ""
              }`}
              transform={`translate(${originPt.x} ${originPt.y})`}
              onMouseEnter={() => {
                setHoverHost(true);
                setHover(null);
              }}
              onMouseLeave={() => setHoverHost(false)}
              onPointerDown={onDestPointerDown}
              onPointerUp={onHostPointerUp}
            >
              <circle
                r={Math.max(14, 16 * markScale)}
                className="map-origin-hit"
              />
              <g className="map-origin-pulse-wrap">
                <circle r={4 * markScale} className="map-origin-pulse" />
              </g>
              <circle r={3.4 * markScale} className="map-origin-dot" />
            </g>
          )}
        </S.MapSvg>
      </S.MapStage>

      <S.MapZoomControls>
        <S.MapZoomBtn
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <Plus size={15} strokeWidth={2} />
        </S.MapZoomBtn>
        <S.MapZoomBtn
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <Minus size={15} strokeWidth={2} />
        </S.MapZoomBtn>
        <S.MapZoomBtn
          type="button"
          aria-label="Reset map view"
          title="Reset view"
          disabled={zoom === 1 && pan.x === 0 && Math.abs(pan.y) < 0.5}
          onClick={resetView}
        >
          <RotateCcw size={14} strokeWidth={2} />
        </S.MapZoomBtn>
      </S.MapZoomControls>

      {empty && (
        <S.MapEmpty>No remote destinations with known locations</S.MapEmpty>
      )}

      {(hoverHost || (hostSelected && !hover)) && (
        <S.MapTooltip>
          <strong>{origin?.label ?? "This host"}</strong>
          <span>
            {remoteCount} remote connection{remoteCount === 1 ? "" : "s"} · all
          </span>
        </S.MapTooltip>
      )}

      {tip && !destSelected && !hoverHost && (
        <S.MapTooltip>
          <strong>{tip.label}</strong>
          <span>
            {tip.count} connection{tip.count === 1 ? "" : "s"} · {dirHint(tip)}
          </span>
        </S.MapTooltip>
      )}
    </S.MapPanel>
  );
}
