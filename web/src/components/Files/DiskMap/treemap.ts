import type { UsageNode, UsageNodeType } from "../../../types";

export function joinFsPath(parent: string, name: string): string {
  if (!parent) return name;
  const sep = parent.includes("\\") && !parent.startsWith("/") ? "\\" : "/";
  if (parent.endsWith("\\") || parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}${sep}${name}`;
}

export interface HydratedNode extends UsageNode {
  path: string;
  children?: HydratedNode[];
}

export function hydrateUsageTree(tree: UsageNode, rootPath: string): HydratedNode {
  function walk(node: UsageNode, parentPath: string, isRoot: boolean): HydratedNode {
    const synthetic = node.type === "other" || node.type === "free";
    const path = isRoot
      ? rootPath
      : synthetic
        ? parentPath
        : joinFsPath(parentPath, node.name);
    return {
      ...node,
      path,
      children: node.children?.map((c) => walk(c, path, false)),
    };
  }
  return walk(tree, rootPath, true);
}

export function withFreeSpace(tree: HydratedNode, freeBytes: number): HydratedNode {
  if (freeBytes <= 0) return tree;
  const free: HydratedNode = {
    name: "Free space",
    type: "free",
    size: freeBytes,
    files: 0,
    ext: null,
    path: tree.path,
  };
  const children = [...(tree.children ?? []), free].sort((a, b) => b.size - a.size);
  return { ...tree, size: tree.size + freeBytes, children };
}

export function findNodeByPath(node: HydratedNode, path: string): HydratedNode | null {
  if (node.path === path && node.type !== "other" && node.type !== "free") {
    return node;
  }
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutCell {
  node: HydratedNode;
  rect: Rect;
  depth: number;
  leaf: boolean;
}

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = sum * sum;
  const w2 = side * side;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

function layoutRow(
  row: number[],
  rect: Rect,
  alongShort: boolean
): { cells: Rect[]; remain: Rect } {
  const sum = row.reduce((a, b) => a + b, 0);
  if (alongShort) {
    const rowW = sum / rect.h;
    let y = rect.y;
    const cells = row.map((v) => {
      const h = v / rowW;
      const cell = { x: rect.x, y, w: rowW, h };
      y += h;
      return cell;
    });
    return {
      cells,
      remain: { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h },
    };
  }
  const rowH = sum / rect.w;
  let x = rect.x;
  const cells = row.map((v) => {
    const w = v / rowH;
    const cell = { x, y: rect.y, w, h: rowH };
    x += w;
    return cell;
  });
  return {
    cells,
    remain: { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH },
  };
}

function squarify(sizes: number[], rect: Rect): Rect[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return sizes.map(() => ({ ...rect, w: 0, h: 0 }));
  const area = rect.w * rect.h;
  const remaining = sizes.map((s) => (s / total) * area);
  const placed: Rect[] = new Array(sizes.length);
  let space: Rect = { ...rect };
  let row: number[] = [];
  let rowIdx: number[] = [];
  let i = 0;

  const flush = () => {
    if (row.length === 0) return;
    const alongShort = space.w >= space.h;
    const { cells, remain } = layoutRow(row, space, alongShort);
    for (let r = 0; r < row.length; r++) placed[rowIdx[r]] = cells[r];
    space = remain;
    row = [];
    rowIdx = [];
  };

  while (i < remaining.length) {
    const side = Math.min(space.w, space.h);
    if (side <= 0) {
      placed[i] = { x: space.x, y: space.y, w: 0, h: 0 };
      i++;
      continue;
    }
    const next = remaining[i];
    if (row.length === 0) {
      row.push(next);
      rowIdx.push(i);
      i++;
      continue;
    }
    if (worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      rowIdx.push(i);
      i++;
    } else {
      flush();
    }
  }
  flush();
  return placed.map((r) => r ?? { x: rect.x, y: rect.y, w: 0, h: 0 });
}

const GAP = 1.25;

function inset(rect: Rect, gap: number): Rect {
  const g = Math.min(gap, rect.w / 2, rect.h / 2);
  if (g <= 0) return rect;
  return { x: rect.x + g / 2, y: rect.y + g / 2, w: rect.w - g, h: rect.h - g };
}

export function layoutTreemap(root: HydratedNode, bounds: Rect): LayoutCell[] {
  const cells: LayoutCell[] = [];

  function walk(node: HydratedNode, rect: Rect, depth: number) {
    const kids = (node.children ?? []).filter((c) => c.size > 0);
    const leaf = kids.length === 0;
    cells.push({ node, rect, depth, leaf });
    if (leaf) return;
    const inner = depth === 0 ? rect : inset(rect, GAP);
    const rects = squarify(kids.map((c) => c.size), inner);
    for (let i = 0; i < kids.length; i++) {
      const r = inset(rects[i], GAP);
      if (r.w < 0.5 || r.h < 0.5) continue;
      walk(kids[i], r, depth + 1);
    }
  }

  walk(root, bounds, 0);
  return cells;
}

export function hitTest(cells: LayoutCell[], x: number, y: number): LayoutCell | null {
  let best: LayoutCell | null = null;
  for (const cell of cells) {
    const { rect } = cell;
    if (x < rect.x || y < rect.y || x > rect.x + rect.w || y > rect.y + rect.h) {
      continue;
    }
    if (!best || cell.depth > best.depth || (cell.leaf && !best.leaf)) {
      best = cell;
    }
  }
  return best;
}

export function nodeKey(node: HydratedNode): string {
  return `${node.type}:${node.path}:${node.name}`;
}

export function isSynthetic(type: UsageNodeType): boolean {
  return type === "other" || type === "free";
}
