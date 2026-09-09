import type { DashRole } from "../../types";
import { ALL_ROLES, type GridPos } from "./grid";

export interface CatalogWidget {
  id: string;
  label: string;
  category: "overview" | "charts";
  default: GridPos;
  minW?: number;
  minH?: number;
  defaultRoles?: DashRole[];
}

const ADMIN_ONLY: DashRole[] = ["admin"];
const CHART_SIZE: GridPos = { x: 0, y: 0, w: 6, h: 4 };

export const OVERVIEW_WIDGETS: CatalogWidget[] = [
  { id: "system", label: "System", category: "overview", default: { x: 0, y: 0, w: 12, h: 3 }, minW: 4, minH: 2 },
  { id: "updates", label: "Updates", category: "overview", default: { x: 0, y: 3, w: 4, h: 3 }, minW: 3, minH: 2, defaultRoles: ADMIN_ONLY },
  { id: "access", label: "Access", category: "overview", default: { x: 4, y: 3, w: 4, h: 5 }, minW: 3, minH: 3, defaultRoles: ADMIN_ONLY },
  { id: "power", label: "Power", category: "overview", default: { x: 8, y: 3, w: 4, h: 4 }, minW: 3, minH: 2, defaultRoles: ADMIN_ONLY },
  { id: "cpu", label: "CPU", category: "overview", default: { x: 0, y: 8, w: 6, h: 6 }, minW: 3, minH: 4 },
  { id: "memory", label: "Memory", category: "overview", default: { x: 6, y: 8, w: 6, h: 6 }, minW: 3, minH: 3 },
  { id: "storage", label: "Storage", category: "overview", default: { x: 0, y: 14, w: 12, h: 4 }, minW: 4, minH: 2 },
  { id: "gpu", label: "GPU", category: "overview", default: { x: 0, y: 18, w: 12, h: 5 }, minW: 4, minH: 3 },
];

/** Optional Overview panels — not on the default layout; add from the picker. */
export const EXTRA_OVERVIEW_WIDGETS: CatalogWidget[] = [
  {
    id: "users",
    label: "User activity",
    category: "overview",
    default: { x: 0, y: 0, w: 4, h: 5 },
    minW: 3,
    minH: 3,
    defaultRoles: ADMIN_ONLY,
  },
];

export const CHART_WIDGETS: CatalogWidget[] = [
  { id: "chart:cpu-load", label: "CPU Load", category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
  { id: "chart:cpu-cores", label: "CPU Cores", category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
  { id: "chart:cpu-temp", label: "CPU Temp", category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
  { id: "chart:cpu-clock", label: "CPU Clock", category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
  { id: "chart:memory", label: "Memory history", category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
  { id: "chart:processes", label: "Processes", category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
];

export function gpuChartWidgets(gpuCount: number): CatalogWidget[] {
  const out: CatalogWidget[] = [];
  for (let i = 0; i < gpuCount; i++) {
    const tag = `GPU ${i}`;
    out.push(
      { id: `chart:gpu-${i}-util`, label: `${tag} · Util`, category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
      { id: `chart:gpu-${i}-mem`, label: `${tag} · Memory`, category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
      { id: `chart:gpu-${i}-temp`, label: `${tag} · Temp`, category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
      { id: `chart:gpu-${i}-clock`, label: `${tag} · Clock`, category: "charts", default: CHART_SIZE, minW: 4, minH: 3 },
      { id: `chart:gpu-${i}-power`, label: `${tag} · Power`, category: "charts", default: CHART_SIZE, minW: 4, minH: 3 }
    );
  }
  return out;
}

export function catalogForPage(pageId: string, gpuCount = 0): CatalogWidget[] {
  if (pageId === "overview")
    return [...OVERVIEW_WIDGETS, ...EXTRA_OVERVIEW_WIDGETS, ...CHART_WIDGETS, ...gpuChartWidgets(gpuCount)];
  if (pageId === "history") return [...CHART_WIDGETS, ...gpuChartWidgets(gpuCount)].map((w) => ({
    ...w,
    id: w.id.replace(/^chart:/, ""),
  }));
  return [];
}

export function widgetById(pageId: string, id: string, gpuCount = 0): CatalogWidget | undefined {
  return catalogForPage(pageId, gpuCount).find((w) => w.id === id);
}

export function defaultRolesFor(widget: CatalogWidget | undefined): DashRole[] {
  return widget?.defaultRoles ?? ALL_ROLES;
}

export function chartKey(id: string): string {
  return id.startsWith("chart:") ? id.slice("chart:".length) : id;
}

export function humanizePanelId(id: string): string {
  const prefixed = id.match(/^(chart|drive|net|trash|project):(.*)$/);
  if (prefixed) {
    const [, kind, rest] = prefixed;
    if (kind === "chart") {
      return rest.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return rest;
  }
  if (id === "add-network") return "Add network drive";
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

