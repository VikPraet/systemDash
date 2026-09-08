import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatBytes, scanUsageTree } from "../../../api";
import { cache } from "../../../cache";
import type { FsEntry, FsRoot, UsageProgress, UsageTree } from "../../../types";
import { usageFill, usageStroke } from "./colors";
import * as S from "./styles";
import {
  findNodeByPath,
  hitTest,
  hydrateUsageTree,
  isSynthetic,
  layoutTreemap,
  nodeKey,
  withFreeSpace,
  type HydratedNode,
  type LayoutCell,
} from "./treemap";

export interface DiskMapHandle {
  zoomed: boolean;
  zoomOut: () => void;
}

export const DiskMap = forwardRef<
  DiskMapHandle,
  {
    path: string;
    roots: FsRoot[];
    onOpenFolder: (path: string) => void;
    onOpenFile: (entry: FsEntry) => void;
  }
>(function DiskMap({ path, roots, onOpenFolder, onOpenFile }, ref) {
  const [usage, setUsage] = useState<UsageTree | null>(
    () => (cache.files.usagePath === path ? cache.files.usage : null)
  );
  const [progress, setProgress] = useState<UsageProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(
    () => !(cache.files.usagePath === path && cache.files.usage)
  );
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    cell: LayoutCell;
    x: number;
    y: number;
  } | null>(null);
  const [tab, setTab] = useState<"folder" | "largest">("folder");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const scanGen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const runScan = useCallback((target: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const gen = ++scanGen.current;
    setScanning(true);
    setError(null);
    setProgress({ bytes: 0, files: 0, dirs: 0, scanning: target });
    setFocusKey(null);
    setSelectedKey(null);
    if (cache.files.usagePath !== target) setUsage(null);

    scanUsageTree(
      target,
      (p) => {
        if (gen === scanGen.current) setProgress(p);
      },
      ctrl.signal
    )
      .then((result) => {
        if (gen !== scanGen.current) return;
        cache.files.usage = result;
        cache.files.usagePath = result.path;
        setUsage(result);
        setScanning(false);
        setProgress(null);
      })
      .catch((e) => {
        if (gen !== scanGen.current || (e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setScanning(false);
      });
  }, []);

  useEffect(() => {
    const cached = cache.files.usagePath === path ? cache.files.usage : null;
    if (cached) {
      setUsage(cached);
      setScanning(false);
      setError(null);
      setProgress(null);
      setFocusKey(null);
      return;
    }
    runScan(path);
    return () => abortRef.current?.abort();
  }, [path, runScan]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ w: Math.max(0, cr.width), h: Math.max(0, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [usage, scanning]);

  const tree = useMemo(() => {
    if (!usage) return null;
    let hydrated = hydrateUsageTree(usage.tree, usage.path);
    const volume = roots.find((r) => pathsEqual(r.path, usage.path));
    if (volume?.freeBytes) hydrated = withFreeSpace(hydrated, volume.freeBytes);
    return hydrated;
  }, [usage, roots]);

  const view = useMemo(() => {
    if (!tree) return null;
    if (!focusKey) return tree;
    return findByKey(tree, focusKey) ?? tree;
  }, [tree, focusKey]);

  const cells = useMemo(() => {
    if (!view || size.w < 8 || size.h < 8) return [];
    return layoutTreemap(view, { x: 0, y: 0, w: size.w, h: size.h });
  }, [view, size]);

  const leaves = useMemo(
    () => cells.filter((c) => c.leaf && c.rect.w > 0.8 && c.rect.h > 0.8),
    [cells]
  );

  const crumbs = useMemo(() => {
    if (!tree || !view) return [];
    return zoomCrumbs(tree, view);
  }, [tree, view]);

  const folderRows = view?.children ?? [];
  const selected = selectedKey && tree ? findByKey(tree, selectedKey) : null;
  const zoomed = !!(tree && view && view !== tree);

  const zoomOut = useCallback(() => {
    if (!tree || !view || view === tree) return;
    const parent = crumbs.length >= 2 ? crumbs[crumbs.length - 2] : tree;
    setFocusKey(parent === tree ? null : nodeKey(parent));
    setSelectedKey(null);
  }, [tree, view, crumbs]);

  useImperativeHandle(ref, () => ({ zoomed, zoomOut }), [zoomed, zoomOut]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && zoomed) {
        e.preventDefault();
        zoomOut();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed, zoomOut]);

  function onCanvasMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cell = hitTest(cells, x, y);
    if (!cell) {
      setHover(null);
      return;
    }
    setHover({
      cell,
      x: Math.min(e.clientX + 14, window.innerWidth - 280),
      y: Math.min(e.clientY + 16, window.innerHeight - 80),
    });
  }

  function activate(node: HydratedNode) {
    if (node.type === "dir" && node.children && node.children.length > 0) {
      setFocusKey(nodeKey(node));
      setSelectedKey(null);
      return;
    }
    if (node.type === "file") {
      onOpenFile({
        name: node.name,
        path: node.path,
        type: "file",
        size: node.size,
        modifiedMs: null,
        ext: node.ext,
      });
    }
  }

  function pickCell(e: React.MouseEvent<SVGSVGElement>): LayoutCell | null {
    const rect = e.currentTarget.getBoundingClientRect();
    return hitTest(cells, e.clientX - rect.left, e.clientY - rect.top);
  }

  const hoverNode = hover?.cell.node;
  const totalSize = tree?.size || 1;
  const viewSize = view?.size || 1;

  return (
    <S.MapRoot>
      <S.MapStatus>
        <S.MapStatusMain>
          {scanning ? (
            <>
              <S.MapStatusTitle>
                Scanning {shortPath(progress?.scanning ?? path)}…
              </S.MapStatusTitle>
              <S.MapProgressTrack>
                <S.MapProgressBar $indeterminate />
              </S.MapProgressTrack>
              <div>
                {formatBytes(progress?.bytes ?? 0)} ·{" "}
                {(progress?.files ?? 0).toLocaleString()} files ·{" "}
                {(progress?.dirs ?? 0).toLocaleString()} folders
              </div>
            </>
          ) : error ? (
            <S.MapStatusTitle style={{ color: "var(--bad)" }}>{error}</S.MapStatusTitle>
          ) : usage ? (
            <>
              <S.MapStatusTitle>
                {view?.name ?? usage.name} · {formatBytes(view?.size ?? usage.size)}
                {usage.partial ? " (partial)" : ""}
              </S.MapStatusTitle>
              <div>
                {usage.files.toLocaleString()} files · {usage.dirs.toLocaleString()} folders
                · scanned in {(usage.elapsedMs / 1000).toFixed(1)}s
                {selected && (
                  <>
                    {" "}
                    · selected {selected.name} ({formatBytes(selected.size)})
                  </>
                )}
              </div>
            </>
          ) : (
            <S.MapStatusTitle>Preparing scan…</S.MapStatusTitle>
          )}
        </S.MapStatusMain>
        <S.MapActions>
          {zoomed && (
            <button type="button" onClick={zoomOut}>
              Zoom out
            </button>
          )}
          {selected?.type === "dir" && !isSynthetic(selected.type) && (
            <button type="button" onClick={() => onOpenFolder(selected.path)}>
              Open in list
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              cache.files.usage = null;
              cache.files.usagePath = null;
              runScan(path);
            }}
            disabled={scanning}
          >
            Rescan
          </button>
        </S.MapActions>
      </S.MapStatus>

      {crumbs.length > 1 && (
        <S.MapCrumbs>
          {crumbs.map((c, i) => (
            <span key={nodeKey(c)}>
              {i > 0 && <span className="sep">/</span>}
              <button
                type="button"
                className={c === view ? "current" : ""}
                onClick={() => {
                  setFocusKey(i === 0 ? null : nodeKey(c));
                  setSelectedKey(null);
                }}
              >
                {c.name}
              </button>
            </span>
          ))}
        </S.MapCrumbs>
      )}

      {!scanning && error && !usage && <S.MapEmpty>{error}</S.MapEmpty>}

      {usage && tree && view && (
        <S.MapSplit>
          <S.MapCanvasWrap ref={wrapRef}>
            <S.MapCanvas
              viewBox={`0 0 ${Math.max(size.w, 1)} ${Math.max(size.h, 1)}`}
              preserveAspectRatio="none"
              onMouseMove={onCanvasMove}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                const cell = pickCell(e);
                if (cell) setSelectedKey(nodeKey(cell.node));
              }}
              onDoubleClick={(e) => {
                const cell = pickCell(e);
                if (cell) activate(cell.node);
              }}
            >
              {leaves.map((cell) => {
                const key = nodeKey(cell.node);
                const on = key === selectedKey;
                const over = hover?.cell ? nodeKey(hover.cell.node) === key : false;
                const showLabel = cell.rect.w > 52 && cell.rect.h > 16;
                const showSize = cell.rect.h > 30 && cell.rect.w > 64;
                return (
                  <g key={key}>
                    <rect
                      x={cell.rect.x}
                      y={cell.rect.y}
                      width={cell.rect.w}
                      height={cell.rect.h}
                      rx={1.5}
                      fill={usageFill(cell.node.type, cell.node.ext)}
                      stroke={usageStroke(on, over)}
                      strokeWidth={on ? 2 : 0.6}
                    />
                    {showLabel && (
                      <text
                        x={cell.rect.x + 5}
                        y={cell.rect.y + 13}
                        fill={
                          cell.node.type === "free" || cell.node.type === "other"
                            ? "var(--text)"
                            : "rgba(8,10,14,0.88)"
                        }
                        fontSize={10}
                        fontWeight={600}
                        style={{ pointerEvents: "none" }}
                      >
                        {clipLabel(cell.node.name, cell.rect.w - 10)}
                      </text>
                    )}
                    {showSize && (
                      <text
                        x={cell.rect.x + 5}
                        y={cell.rect.y + 26}
                        fill={
                          cell.node.type === "free" || cell.node.type === "other"
                            ? "var(--muted)"
                            : "rgba(8,10,14,0.7)"
                        }
                        fontSize={10}
                        style={{ pointerEvents: "none" }}
                      >
                        {formatBytes(cell.node.size)}
                      </text>
                    )}
                  </g>
                );
              })}
            </S.MapCanvas>
            {hoverNode && hover && (
              <S.MapTip $x={hover.x} $y={hover.y}>
                <S.MapTipName>{hoverNode.name}</S.MapTipName>
                <S.MapTipMeta>
                  {formatBytes(hoverNode.size)} · {pct(hoverNode.size, viewSize)} of view ·{" "}
                  {pct(hoverNode.size, totalSize)} of total
                  {hoverNode.type === "dir" && ` · ${hoverNode.files.toLocaleString()} files`}
                  {hoverNode.ext && ` · .${hoverNode.ext}`}
                </S.MapTipMeta>
              </S.MapTip>
            )}
          </S.MapCanvasWrap>

          <S.MapTableWrap>
            <S.MapTabs>
              <button
                type="button"
                className={tab === "folder" ? "active" : ""}
                onClick={() => setTab("folder")}
              >
                This folder
              </button>
              <button
                type="button"
                className={tab === "largest" ? "active" : ""}
                onClick={() => setTab("largest")}
              >
                Largest files
              </button>
            </S.MapTabs>
            <S.MapTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="ta-right">Size</th>
                  <th className="ta-right">% of folder</th>
                  <th className="ta-right">% of total</th>
                </tr>
              </thead>
              <tbody>
                {tab === "folder"
                  ? folderRows.map((node) => (
                      <tr
                        key={nodeKey(node)}
                        className={nodeKey(node) === selectedKey ? "selected" : ""}
                        onClick={() => setSelectedKey(nodeKey(node))}
                        onDoubleClick={() => activate(node)}
                      >
                        <td>
                          <span className="map-name">
                            <span
                              className="map-swatch"
                              style={{ background: usageFill(node.type, node.ext) }}
                            />
                            <span className="map-label" title={node.path}>
                              {node.name}
                            </span>
                          </span>
                        </td>
                        <td className="ta-right muted">{formatBytes(node.size)}</td>
                        <td className="ta-right muted">{pct(node.size, viewSize)}</td>
                        <td className="ta-right muted">{pct(node.size, totalSize)}</td>
                      </tr>
                    ))
                  : usage.largest.map((file) => (
                      <tr
                        key={file.path}
                        className={
                          selected?.path === file.path && selected.type === "file"
                            ? "selected"
                            : ""
                        }
                        onClick={() => {
                          const found = findNodeByPath(tree, file.path);
                          if (found) setSelectedKey(nodeKey(found));
                        }}
                        onDoubleClick={() =>
                          onOpenFile({
                            name: file.name,
                            path: file.path,
                            type: "file",
                            size: file.size,
                            modifiedMs: null,
                            ext: file.ext,
                          })
                        }
                      >
                        <td>
                          <span className="map-name">
                            <span
                              className="map-swatch"
                              style={{ background: usageFill("file", file.ext) }}
                            />
                            <span className="map-label" title={file.path}>
                              {file.name}
                            </span>
                          </span>
                        </td>
                        <td className="ta-right muted">{formatBytes(file.size)}</td>
                        <td className="ta-right muted">{pct(file.size, viewSize)}</td>
                        <td className="ta-right muted">{pct(file.size, totalSize)}</td>
                      </tr>
                    ))}
                {tab === "folder" && folderRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted proc-empty">
                      Nothing large enough to show in this folder.
                    </td>
                  </tr>
                )}
                {tab === "largest" && usage.largest.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted proc-empty">
                      No files found.
                    </td>
                  </tr>
                )}
              </tbody>
            </S.MapTable>
          </S.MapTableWrap>
        </S.MapSplit>
      )}
    </S.MapRoot>
  );
});

function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  const v = (part / whole) * 100;
  if (v < 0.1) return "<0.1%";
  return `${v.toFixed(v >= 10 ? 0 : 1)}%`;
}

function shortPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return p;
  return `…/${parts.slice(-2).join("/")}`;
}

function clipLabel(name: string, width: number): string {
  const max = Math.max(4, Math.floor(width / 6.4));
  if (name.length <= max) return name;
  return `${name.slice(0, Math.max(1, max - 1))}…`;
}

function pathsEqual(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function findByKey(node: HydratedNode, key: string): HydratedNode | null {
  if (nodeKey(node) === key) return node;
  for (const child of node.children ?? []) {
    const found = findByKey(child, key);
    if (found) return found;
  }
  return null;
}

function zoomCrumbs(root: HydratedNode, view: HydratedNode): HydratedNode[] {
  const trail: HydratedNode[] = [];
  function walk(node: HydratedNode): boolean {
    trail.push(node);
    if (nodeKey(node) === nodeKey(view)) return true;
    for (const child of node.children ?? []) {
      if (walk(child)) return true;
    }
    trail.pop();
    return false;
  }
  walk(root);
  return trail.length ? trail : [root];
}

DiskMap.displayName = "DiskMap";
