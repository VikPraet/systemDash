import type { DashRole } from "../../types";

export const COLS = 12;
export const ROW_HEIGHT = 64;
export const GRID_GAP = 16;

export const ALL_ROLES: DashRole[] = ["admin", "user", "viewer"];

export interface GridItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  widget?: string;
  hidden?: boolean;
  roles?: DashRole[];
  group?: string;
}

export interface GridConstraints {
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export type GridPos = Omit<GridItem, "id">;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function collides(a: GridItem, b: GridItem): boolean {
  return (
    a.id !== b.id &&
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function sanitizeItem(raw: unknown, fallback: GridItem): GridItem {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = typeof src.id === "string" && src.id.trim() ? src.id.trim().slice(0, 120) : fallback.id;
  const w = clamp(Math.round(Number(src.w)), 1, COLS);
  const h = clamp(Math.round(Number(src.h)), 1, 48);
  const x = clamp(Math.round(Number(src.x)), 0, COLS - w);
  const y = clamp(Math.round(Number(src.y)), 0, 400);
  const widget =
    typeof src.widget === "string" && src.widget.trim()
      ? src.widget.trim().slice(0, 120)
      : fallback.widget;
  const group =
    typeof src.group === "string" && src.group.trim()
      ? src.group.trim().slice(0, 64)
      : fallback.group;
  const roles = sanitizeRoles(src.roles) ?? fallback.roles;
  return {
    id,
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y,
    w: Number.isFinite(w) ? w : fallback.w,
    h: Number.isFinite(h) ? h : fallback.h,
    ...(src.hidden === true || fallback.hidden ? { hidden: true } : {}),
    ...(roles && roles.length ? { roles } : {}),
    ...(widget ? { widget } : {}),
    ...(group ? { group } : {}),
  };
}

export function sanitizeRoles(raw: unknown): DashRole[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const roles = ALL_ROLES.filter((role) => raw.includes(role));
  return roles.length > 0 ? roles : undefined;
}

export function ensureAdminRoles(roles: DashRole[] | undefined): DashRole[] {
  const next = roles && roles.length > 0 ? [...roles] : [...ALL_ROLES];
  if (!next.includes("admin")) next.unshift("admin");
  return next;
}

export function rolesFor(item: GridItem, fallback: DashRole[] = ALL_ROLES): DashRole[] {
  return ensureAdminRoles(item.roles && item.roles.length > 0 ? item.roles : fallback);
}

export function hiddenRoles(item: GridItem, fallback: DashRole[] = ALL_ROLES): DashRole[] {
  const visible = rolesFor(item, fallback);
  return ALL_ROLES.filter((role) => !visible.includes(role));
}

export function restrictedInEdit(item: GridItem, fallback: DashRole[] = ALL_ROLES): boolean {
  return hiddenRoles(item, fallback).length > 0;
}

function rolePhrase(role: DashRole): string {
  if (role === "user") return "users";
  if (role === "viewer") return "viewers";
  return "admins";
}

export function hiddenFromLabel(item: GridItem, fallback: DashRole[] = ALL_ROLES): string {
  const hidden = hiddenRoles(item, fallback);
  if (hidden.length === 0) return "Visible to all roles";
  if (hidden.length === 1) return `Hidden from ${rolePhrase(hidden[0])}`;
  if (hidden.length === 2) {
    return `Hidden from ${rolePhrase(hidden[0])} and ${rolePhrase(hidden[1])}`;
  }
  const last = hidden[hidden.length - 1];
  const rest = hidden.slice(0, -1).map(rolePhrase).join(", ");
  return `Hidden from ${rest}, and ${rolePhrase(last)}`;
}

export function visibleTo(item: GridItem, role: DashRole, fallback: DashRole[] = ALL_ROLES): boolean {
  if (item.hidden) return false;
  if (role === "admin") return true;
  return rolesFor(item, fallback).includes(role);
}

export function groupBounds(items: GridItem[]): GridPos | null {
  if (items.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const item of items) {
    x1 = Math.min(x1, item.x);
    y1 = Math.min(y1, item.y);
    x2 = Math.max(x2, item.x + item.w);
    y2 = Math.max(y2, item.y + item.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function sharesEdge(a: GridItem, b: GridItem): boolean {
  const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
  const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
  if (overlapX && overlapY) return true;
  if (overlapY && (a.x + a.w === b.x || b.x + b.w === a.x)) return true;
  if (overlapX && (a.y + a.h === b.y || b.y + b.h === a.y)) return true;
  return false;
}

/** Tag two panels (and any existing group mates) and snap the incoming panel against the anchor. */
export function mergeItems(items: GridItem[], a: string, b: string, gid: string): GridItem[] {
  const left = items.find((i) => i.id === a);
  const right = items.find((i) => i.id === b);
  if (!left || !right || left.id === right.id) return items;
  const tagged = items.map((i) => {
    if (i.id === a || i.id === b) return { ...i, group: gid };
    if (left.group && i.group === left.group) return { ...i, group: gid };
    if (right.group && i.group === right.group) return { ...i, group: gid };
    return i;
  });
  const moving = tagged.find((i) => i.id === b);
  if (!moving) return tagged;
  const anchors = tagged.filter((i) => i.group === gid && i.id !== b);
  const box = groupBounds(anchors);
  if (!box) return tagged;
  if (anchors.some((i) => sharesEdge(i, moving))) return tagged;
  let x = box.x + box.w;
  let y = box.y;
  if (x + moving.w > COLS) {
    x = box.x;
    y = box.y + box.h;
  }
  const next = tagged.map((i) => (i.id === b ? { ...i, x, y } : i));
  return pushDown(next, b);
}

export function compact(items: GridItem[], pinnedId?: string): GridItem[] {
  if (items.length === 0) return items;
  const units = clusterUnits(items);
  const pinned = pinnedId
    ? units.find((u) => u.members.some((m) => m.id === pinnedId))
    : undefined;
  const rest = (pinned ? units.filter((u) => u !== pinned) : units).sort(
    (a, b) => a.box.y - b.box.y || a.box.x - b.box.x
  );

  const placed: GridPos[] = [];
  const moved = new Map<string, GridItem>();

  function emit(unit: (typeof units)[number], origin: GridPos) {
    placed.push(origin);
    for (const m of unit.members) {
      moved.set(m.id, {
        ...m,
        x: origin.x + (m.x - unit.box.x),
        y: origin.y + (m.y - unit.box.y),
      });
    }
  }

  if (pinned) emit(pinned, { ...pinned.box });

  for (const unit of rest) {
    const probe: GridPos = { x: unit.box.x, y: 0, w: unit.box.w, h: unit.box.h };
    while (placed.some((p) => boxesOverlap(probe, p))) probe.y += 1;
    emit(unit, probe);
  }

  return items.map((item) => moved.get(item.id) ?? item);
}

function boxesOverlap(a: GridPos, b: GridPos): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clusterUnits(items: GridItem[]): { members: GridItem[]; box: GridPos }[] {
  const byGroup = new Map<string, GridItem[]>();
  const units: { members: GridItem[]; box: GridPos }[] = [];
  for (const item of items) {
    if (!item.group) {
      units.push({ members: [item], box: { x: item.x, y: item.y, w: item.w, h: item.h } });
      continue;
    }
    const list = byGroup.get(item.group) ?? [];
    list.push(item);
    byGroup.set(item.group, list);
  }
  for (const group of byGroup.values()) {
    if (group.length <= 1) {
      const item = group[0];
      units.push({ members: [item], box: { x: item.x, y: item.y, w: item.w, h: item.h } });
      continue;
    }
    const box = groupBounds(group);
    if (box) units.push({ members: group, box });
  }
  return units;
}

function rolesKey(roles?: DashRole[]): string {
  return (roles ?? []).join(",");
}

export function layoutsEqual(a: GridItem[], b: GridItem[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((i) => [i.id, i]));
  return a.every((item) => {
    const other = byId.get(item.id);
    return (
      !!other &&
      other.x === item.x &&
      other.y === item.y &&
      other.w === item.w &&
      other.h === item.h &&
      other.hidden === item.hidden &&
      other.group === item.group &&
      other.widget === item.widget &&
      rolesKey(other.roles) === rolesKey(item.roles)
    );
  });
}

export function pushDown(items: GridItem[], movedId: string): GridItem[] {
  const result = items.map((i) => ({ ...i }));
  const queue = [movedId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const src = result.find((i) => i.id === id);
    if (!src) continue;
    for (const other of result) {
      if (other.id === id) continue;
      if (collides(src, other)) {
        other.y = src.y + src.h;
        queue.push(other.id);
      }
    }
  }
  return result;
}

export function moveItem(items: GridItem[], id: string, x: number, y: number): GridItem[] {
  const current = items.find((i) => i.id === id);
  if (!current) return items;
  const nextX = clamp(Math.round(x), 0, COLS - current.w);
  const nextY = Math.max(0, Math.round(y));
  const next = items.map((i) => (i.id === id ? { ...i, x: nextX, y: nextY } : { ...i }));
  return compact(pushDown(next, id), id);
}

export function resizeItem(
  items: GridItem[],
  id: string,
  w: number,
  h: number,
  constraints: GridConstraints = {}
): GridItem[] {
  const current = items.find((i) => i.id === id);
  if (!current) return items;
  const minW = constraints.minW ?? 1;
  const minH = constraints.minH ?? 1;
  const maxW = constraints.maxW ?? COLS;
  const maxH = constraints.maxH ?? 48;
  const nextW = clamp(Math.round(w), minW, Math.min(maxW, COLS - current.x));
  const nextH = clamp(Math.round(h), minH, maxH);
  const next = items.map((i) => (i.id === id ? { ...i, w: nextW, h: nextH } : { ...i }));
  return compact(pushDown(next, id), id);
}

export type ResizeEdge = "e" | "s" | "se" | "nw";

/** Resize from an edge/corner. NW keeps the bottom-right fixed. */
export function resizeFrom(
  items: GridItem[],
  id: string,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  origin: GridItem,
  constraints: GridConstraints = {}
): GridItem[] {
  if (edge === "nw") {
    const minW = constraints.minW ?? 1;
    const minH = constraints.minH ?? 1;
    const maxW = constraints.maxW ?? COLS;
    const maxH = constraints.maxH ?? 48;
    const right = origin.x + origin.w;
    const bottom = origin.y + origin.h;
    const w = clamp(Math.round(origin.w - dx), minW, Math.min(maxW, right));
    const h = clamp(Math.round(origin.h - dy), minH, Math.min(maxH, bottom));
    const next = items.map((i) =>
      i.id === id ? { ...i, x: right - w, y: bottom - h, w, h } : { ...i }
    );
    return compact(pushDown(next, id), id);
  }
  const w = edge === "s" ? origin.w : origin.w + dx;
  const h = edge === "e" ? origin.h : origin.h + dy;
  return resizeItem(items, id, w, h, constraints);
}

export function autoPlace(existing: GridItem[], w: number, h: number): GridPos {
  const width = clamp(w, 1, COLS);
  const height = Math.max(1, h);
  let maxY = 0;
  for (const i of existing) maxY = Math.max(maxY, i.y + i.h);
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= COLS - width; x++) {
      const probe: GridItem = { id: "__probe__", x, y, w: width, h: height };
      if (!existing.some((i) => collides(probe, i))) return { x, y, w: width, h: height };
    }
  }
  return { x: 0, y: maxY, w: width, h: height };
}

export function packDefaults(
  ids: string[],
  size: GridPos | ((id: string) => GridPos),
  cols = COLS
): Record<string, GridPos> {
  const out: Record<string, GridPos> = {};
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const id of ids) {
    const { w, h } = typeof size === "function" ? size(id) : size;
    const width = clamp(w, 1, cols);
    if (x + width > cols) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    out[id] = { x, y, w: width, h: Math.max(1, h) };
    x += width;
    rowH = Math.max(rowH, Math.max(1, h));
  }
  return out;
}

export function mergeLayout(
  saved: GridItem[] | undefined,
  ids: string[],
  defaults: Record<string, GridPos>
): GridItem[] {
  const byId = new Map((saved ?? []).map((i) => [i.id, i]));
  const items: GridItem[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    seen.add(id);
    const prev = byId.get(id);
    if (prev) {
      items.push(sanitizeItem(prev, { id, ...(defaults[id] ?? { x: 0, y: 0, w: 6, h: 3 }) }));
      continue;
    }
    const d = defaults[id];
    const pos = d ? { ...d } : autoPlace(items, 4, 3);
    items.push({ id, ...pos });
  }
  // Keep extra widgets the page added (charts on Overview, etc.).
  for (const prev of saved ?? []) {
    if (seen.has(prev.id)) continue;
    items.push(
      sanitizeItem(prev, { id: prev.id, x: 0, y: 0, w: prev.w || 6, h: prev.h || 3 })
    );
  }
  return items;
}

export function patchItem(items: GridItem[], id: string, patch: Partial<GridItem>): GridItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item));
}

export function moveGroup(items: GridItem[], groupId: string, dx: number, dy: number): GridItem[] {
  const members = items.filter((i) => i.group === groupId);
  if (members.length === 0) return items;
  const box = groupBounds(members);
  if (!box) return items;
  const nextX = clamp(box.x + dx, 0, COLS - box.w);
  const nextY = Math.max(0, box.y + dy);
  const ox = nextX - box.x;
  const oy = nextY - box.y;
  if (ox === 0 && oy === 0) return items;
  const moved = items.map((i) => (i.group === groupId ? { ...i, x: i.x + ox, y: i.y + oy } : { ...i }));
  return compact(pushDownMembers(moved, new Set(members.map((m) => m.id))), members[0]?.id);
}

function pushDownMembers(items: GridItem[], movedIds: Set<string>): GridItem[] {
  const result = items.map((i) => ({ ...i }));
  const queue = [...movedIds];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const src = result.find((i) => i.id === id);
    if (!src) continue;
    for (const other of result) {
      if (movedIds.has(other.id) || other.id === id) continue;
      if (collides(src, other)) {
        other.y = src.y + src.h;
        queue.push(other.id);
      }
    }
  }
  return result;
}

export function pointerToCell(
  clientX: number,
  clientY: number,
  gridRect: DOMRect,
  cols = COLS,
  rowHeight = ROW_HEIGHT,
  gap = GRID_GAP
): { x: number; y: number } {
  const innerW = Math.max(1, gridRect.width);
  const colW = (innerW - gap * (cols - 1)) / cols;
  const strideX = colW + gap;
  const strideY = rowHeight + gap;
  const x = Math.floor((clientX - gridRect.left) / strideX);
  const y = Math.floor((clientY - gridRect.top) / strideY);
  return { x: clamp(x, 0, cols - 1), y: Math.max(0, y) };
}
