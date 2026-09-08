import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { EyeOff, GripVertical } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { useDashboardLayout } from "../../theme/DashboardContext";
import { useAuth } from "../../auth/AuthContext";
import type { DashRole } from "../../types";
import { MOBILE_BREAK } from "../../theme/media";
import {
  GRID_GAP,
  ROW_HEIGHT,
  compact,
  groupBounds,
  layoutsEqual,
  mergeLayout,
  moveGroup,
  moveItem,
  pointerToCell,
  resizeFrom,
  hiddenFromLabel,
  restrictedInEdit,
  rolesFor,
  type GridConstraints,
  type GridItem,
  type GridPos,
  type ResizeEdge,
} from "./grid";
import { defaultRolesFor, humanizePanelId, widgetById } from "./catalog";
import { PanelMenu } from "./PanelMenu";
import * as S from "./styles";

const MOBILE_MQ = `(max-width: ${MOBILE_BREAK})`;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_MQ).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

type DragKind = "move" | ResizeEdge;

interface DragState {
  kind: DragKind;
  id: string;
  origin: GridItem;
  snapshot: GridItem[];
  startX: number;
  startY: number;
  latest: GridItem[];
}

export interface DashboardItem {
  id: string;
  title?: string;
  /** Name shown in the edit-mode header; falls back to title, then catalog, then id. */
  label?: string;
  default: GridPos;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  defaultRoles?: DashRole[];
  node: ReactNode;
}

export function DashboardGrid({
  pageId,
  items,
}: {
  pageId: string;
  items: DashboardItem[];
}) {
  const { editMode, layouts, registerPage, setPageLayout } = useDashboardLayout();
  const { user } = useAuth();
  const role: DashRole = user?.role ?? "viewer";
  const isMobile = useIsMobile();
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [resizeGhost, setResizeGhost] = useState<GridPos | null>(null);
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const defaults = useMemo(() => {
    const out: Record<string, GridPos> = {};
    for (const item of items) out[item.id] = item.default;
    return out;
  }, [items]);
  const constraints = useMemo(() => {
    const out: Record<string, GridConstraints> = {};
    for (const item of items) {
      out[item.id] = { minW: item.minW, minH: item.minH, maxW: item.maxW, maxH: item.maxH };
    }
    return out;
  }, [items]);
  const fallbackRoles = useMemo(() => {
    const out: Record<string, DashRole[]> = {};
    for (const item of items) {
      out[item.id] = item.defaultRoles ?? defaultRolesFor(widgetById(pageId, item.id));
    }
    return out;
  }, [items, pageId]);

  const layout = useMemo(
    () => mergeLayout(layouts[pageId], ids, defaults),
    [defaults, ids, layouts, pageId]
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    registerPage(pageId, ids, defaults);
  }, [defaults, ids, pageId, registerPage]);

  useEffect(() => {
    if (!editMode) return;
    const saved = layouts[pageId] ?? [];
    const savedIds = saved.map((i) => i.id).join("|");
    const nextIds = layout.map((i) => i.id).join("|");
    if (savedIds !== nextIds) {
      setPageLayout(pageId, packKeepingHidden(layout));
      return;
    }
    if (dragging) return;
    const packed = packKeepingHidden(layout);
    if (!layoutsEqual(packed, layout)) setPageLayout(pageId, packed);
  }, [dragging, editMode, layout, layouts, pageId, setPageLayout]);

  useEffect(() => {
    document.documentElement.dataset.layoutEdit = editMode && !isMobile ? "true" : "false";
    return () => {
      document.documentElement.dataset.layoutEdit = "false";
    };
  }, [editMode, isMobile]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      const grid = gridRef.current;
      if (!drag || !grid) return;
      const startCell = pointerToCell(drag.startX, drag.startY, grid.getBoundingClientRect());
      const nowCell = pointerToCell(e.clientX, e.clientY, grid.getBoundingClientRect());
      const dx = nowCell.x - startCell.x;
      const dy = nowCell.y - startCell.y;
      let next: GridItem[];
      if (drag.kind === "move" && drag.origin.group) {
        next = moveGroup(drag.snapshot, drag.origin.group, dx, dy);
        setPageLayout(pageId, next);
        setResizeGhost(null);
      } else if (drag.kind === "move") {
        next = moveItem(drag.snapshot, drag.id, drag.origin.x + dx, drag.origin.y + dy);
        setPageLayout(pageId, next);
        setResizeGhost(null);
      } else {
        next = resizeFrom(
          drag.snapshot,
          drag.id,
          drag.kind,
          dx,
          dy,
          drag.origin,
          constraints[drag.id]
        );
        const item = next.find((i) => i.id === drag.id);
        if (item) {
          const ghost = { x: item.x, y: item.y, w: item.w, h: item.h };
          setResizeGhost((prev) =>
            prev && prev.x === ghost.x && prev.y === ghost.y && prev.w === ghost.w && prev.h === ghost.h
              ? prev
              : ghost
          );
        }
      }
      drag.latest = next;
    }
    function onUp() {
      const drag = dragRef.current;
      const itemsNow = drag?.latest ?? layoutRef.current;
      dragRef.current = null;
      setDragging(null);
      setResizeGhost(null);
      if (drag) setPageLayout(pageId, packKeepingHidden(itemsNow));
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [constraints, dragging, pageId, setPageLayout]);

  function onPointerDown(kind: DragKind, id: string, e: ReactPointerEvent) {
    if (!editMode || isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const origin = layout.find((i) => i.id === id);
    if (!origin) return;
    dragRef.current = {
      kind,
      id,
      origin: { ...origin },
      snapshot: layout.map((i) => ({ ...i })),
      startX: e.clientX,
      startY: e.clientY,
      latest: layout.map((i) => ({ ...i })),
    };
    setDragging(id);
    if (kind !== "move") {
      setResizeGhost({ x: origin.x, y: origin.y, w: origin.w, h: origin.h });
    }
  }

  const visibleLayout = useMemo(() => {
    return layout.filter((cell) => {
      if (cell.hidden) return false;
      if (editMode) return true;
      return rolesFor(cell, fallbackRoles[cell.id]).includes(role);
    });
  }, [editMode, fallbackRoles, layout, role]);

  const displayLayout = useMemo(() => {
    if (editMode || isMobile) return visibleLayout;
    return compact(visibleLayout);
  }, [editMode, isMobile, visibleLayout]);

  const ordered = isMobile
    ? [...displayLayout].sort((a, b) => a.y - b.y || a.x - b.x)
    : displayLayout;
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = useMemo(() => {
    const map = new Map<string, GridItem[]>();
    for (const cell of ordered) {
      if (!cell.group) continue;
      const list = map.get(cell.group) ?? [];
      list.push(cell);
      map.set(cell.group, list);
    }
    return [...map.entries()]
      .map(([id, members]) => ({ id, members, box: groupBounds(members) }))
      .filter((g) => g.box && g.members.length > 1);
  }, [ordered]);

  const groupedIds = useMemo(
    () => new Set(groups.flatMap((g) => g.members.map((m) => m.id))),
    [groups]
  );

  const otherLabels = (exceptId: string) =>
    ordered
      .filter((c) => c.id !== exceptId)
      .map((c) => ({ id: c.id, label: panelLabel(byId.get(c.id), pageId, c.id) }));

  function renderCell(cell: GridItem, local?: { x: number; y: number }) {
    const spec = byId.get(cell.id);
    if (!spec) return null;
    const canDrag = editMode && !isMobile;
    const grouped = Boolean(cell.group && groups.some((g) => g.id === cell.group));
    const useCard = Boolean(spec.title) && !grouped && !canDrag;
    const name = panelLabel(spec, pageId, cell.id);
    const restricted = canDrag && restrictedInEdit(cell, fallbackRoles[cell.id]);
    const previewing = Boolean(resizeGhost) && dragging === cell.id;
    const x = local?.x ?? cell.x;
    const y = local?.y ?? cell.y;
    return (
      <S.Item
        key={cell.id}
        $x={x}
        $y={y}
        $w={cell.w}
        $h={cell.h}
        $editing={canDrag}
        $dragging={dragging === cell.id && !previewing}
        $previewing={previewing}
        $grouped={grouped}
        $restricted={restricted}
      >
        <S.ItemBody $editing={canDrag} $grouped={grouped}>
          {canDrag && (
            <S.EditHeader
              onPointerDown={(e) => onPointerDown("move", cell.id, e)}
            >
              <S.EditHeaderName title={name}>{name}</S.EditHeaderName>
              <S.TitleActions onPointerDown={(e) => e.stopPropagation()}>
                {restricted && (
                  <Tooltip
                    label={hiddenFromLabel(cell, fallbackRoles[cell.id])}
                    detail="Open the menu to change who can see this panel."
                  >
                    <S.RestrictedMark aria-hidden>
                      <EyeOff size={13} strokeWidth={1.8} />
                    </S.RestrictedMark>
                  </Tooltip>
                )}
                <PanelMenu
                  pageId={pageId}
                  item={cell}
                  label={name}
                  others={otherLabels(cell.id)}
                  defaultRoles={fallbackRoles[cell.id]}
                />
                <S.DragHandle
                  type="button"
                  aria-label={`Move ${name}`}
                  onPointerDown={(e) => onPointerDown("move", cell.id, e)}
                >
                  <GripVertical size={14} />
                </S.DragHandle>
              </S.TitleActions>
            </S.EditHeader>
          )}
          {useCard ? (
            <S.CardShell>
              <S.CardTitle>{spec.title}</S.CardTitle>
              {spec.node}
            </S.CardShell>
          ) : grouped && spec.title && !canDrag ? (
            <>
              <S.CardTitle>{spec.title}</S.CardTitle>
              {spec.node}
            </>
          ) : canDrag ? (
            <S.EditBody>{spec.node}</S.EditBody>
          ) : (
            spec.node
          )}
        </S.ItemBody>
        {canDrag && (
          <>
            <S.ResizeHandle $edge="nw" onPointerDown={(e) => onPointerDown("nw", cell.id, e)} />
            <S.ResizeHandle $edge="e" onPointerDown={(e) => onPointerDown("e", cell.id, e)} />
            <S.ResizeHandle $edge="s" onPointerDown={(e) => onPointerDown("s", cell.id, e)} />
            <S.ResizeHandle $edge="se" onPointerDown={(e) => onPointerDown("se", cell.id, e)} />
          </>
        )}
      </S.Item>
    );
  }

  return (
    <>
    <S.Grid ref={gridRef} $rowHeight={ROW_HEIGHT} $gap={GRID_GAP} $editing={editMode}>
      {groups.map(
        (g) =>
          g.box && (
            <S.GroupShell
              key={`g-${g.id}`}
              $x={g.box.x}
              $y={g.box.y}
              $w={g.box.w}
              $h={g.box.h}
              $editing={editMode && !isMobile}
            >
              {g.members.map((cell) =>
                renderCell(cell, { x: cell.x - g.box!.x, y: cell.y - g.box!.y })
              )}
            </S.GroupShell>
          )
      )}
      {ordered.map((cell) => (groupedIds.has(cell.id) ? null : renderCell(cell)))}
      {resizeGhost && (
        <S.SizeGhost
          $x={resizeGhost.x}
          $y={resizeGhost.y}
          $w={resizeGhost.w}
          $h={resizeGhost.h}
        />
      )}
    </S.Grid>
    </>
  );
}

function panelLabel(
  spec: DashboardItem | undefined,
  pageId: string,
  id: string
): string {
  if (spec?.label) return spec.label;
  if (spec?.title) return spec.title;
  return widgetById(pageId, id)?.label ?? humanizePanelId(id);
}

function packKeepingHidden(items: GridItem[]): GridItem[] {
  const hidden = items.filter((i) => i.hidden);
  const shown = items.filter((i) => !i.hidden);
  return [...compact(shown), ...hidden];
}
