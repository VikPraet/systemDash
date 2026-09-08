import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cache } from "../cache";
import {
  acquireLayoutEditLock,
  fetchLayoutEditLock,
  fetchSettings,
  heartbeatLayoutEditLock,
  releaseLayoutEditLock,
  saveSettings,
  type LayoutEditLock,
} from "../api";
import { hasRole, useAuth } from "../auth/AuthContext";
import { compact, type GridItem, type GridPos, autoPlace, mergeItems, mergeLayout, patchItem, ALL_ROLES, ensureAdminRoles } from "../components/dashboard/grid";
import { defaultRolesFor, widgetById } from "../components/dashboard/catalog";
import { randomId } from "../randomId";
import type { DashRole } from "../types";

interface PageSpec {
  defaults: Record<string, GridPos>;
  ids: string[];
}

interface DashboardContextValue {
  editMode: boolean;
  canEdit: boolean;
  saving: boolean;
  acquiring: boolean;
  lock: LayoutEditLock | null;
  lockError: string | null;
  layouts: Record<string, GridItem[]>;
  beginEdit: () => Promise<void>;
  endEdit: () => Promise<void>;
  cancelEdit: () => Promise<void>;
  resetPage: (pageId: string) => void;
  registerPage: (pageId: string, ids: string[], defaults: Record<string, GridPos>) => void;
  setPageLayout: (pageId: string, items: GridItem[]) => void;
  patchPageItem: (pageId: string, id: string, patch: Partial<GridItem>) => void;
  hidePageItem: (pageId: string, id: string) => void;
  removePageItem: (pageId: string, id: string) => void;
  showPageItem: (pageId: string, id: string) => void;
  addPageWidget: (pageId: string, widgetId: string) => void;
  mergePageItems: (pageId: string, a: string, b: string) => void;
  ungroupPageItem: (pageId: string, id: string) => void;
  setItemRoles: (pageId: string, id: string, roles: DashRole[]) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

function cloneLayouts(src: Record<string, GridItem[]> | undefined): Record<string, GridItem[]> {
  const out: Record<string, GridItem[]> = {};
  for (const [key, items] of Object.entries(src ?? {})) {
    out[key] = items.map((item) => ({
      ...item,
      ...(item.roles ? { roles: [...item.roles] } : {}),
    }));
  }
  return out;
}

function readLayouts(): Record<string, GridItem[]> {
  return cloneLayouts(cache.settings.dashboard?.layouts);
}

async function layoutsFromServer(): Promise<Record<string, GridItem[]>> {
  const saved = await fetchSettings();
  cache.settings = saved;
  return cloneLayouts(saved.dashboard?.layouts);
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canEdit = hasRole(user, "admin");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acquiring, setAcquiring] = useState(false);
  const [lock, setLock] = useState<LayoutEditLock | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<Record<string, GridItem[]>>(readLayouts);
  const [baseline, setBaseline] = useState<Record<string, GridItem[]>>(readLayouts);
  const [specs] = useState(() => new Map<string, PageSpec>());
  const editModeRef = useRef(false);
  const lastActionRef = useRef(0);
  editModeRef.current = editMode;

  useEffect(() => {
    function sync() {
      if (editModeRef.current) return;
      const next = readLayouts();
      setLayouts(next);
      setBaseline(next);
    }
    window.addEventListener("systemdash-settings", sync);
    return () => window.removeEventListener("systemdash-settings", sync);
  }, []);

  const revertToServer = useCallback(async () => {
    try {
      const fresh = await layoutsFromServer();
      setLayouts(fresh);
      setBaseline(cloneLayouts(fresh));
    } catch {
      setLayouts(cloneLayouts(baseline));
    }
  }, [baseline]);

  const enterHeldLock = useCallback(async (held: LayoutEditLock) => {
    setLock(held);
    setEditMode(true);
    try {
      const fresh = await layoutsFromServer();
      setBaseline(cloneLayouts(fresh));
      setLayouts(cloneLayouts(fresh));
    } catch {
      /* keep the cached layouts already on screen */
    }
  }, []);

  useEffect(() => {
    if (!canEdit || editMode) {
      if (!canEdit) setLock(null);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const next = await fetchLayoutEditLock();
        if (cancelled) return;
        setLock(next);
        if (!next.editing || !next.mine || editModeRef.current) return;
        try {
          const held = await heartbeatLayoutEditLock(true);
          if (cancelled || editModeRef.current) return;
          await enterHeldLock(held);
        } catch {
          if (!cancelled) {
            try {
              setLock(await fetchLayoutEditLock());
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* offline / not admin */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canEdit, editMode, enterHeldLock]);

  useEffect(() => {
    if (!editMode || !canEdit) return;
    lastActionRef.current = Date.now();
    function mark() {
      lastActionRef.current = Date.now();
    }
    window.addEventListener("pointerdown", mark);
    window.addEventListener("pointermove", mark);
    window.addEventListener("keydown", mark);
    const id = window.setInterval(() => {
      const active = Date.now() - lastActionRef.current < 20_000;
      void heartbeatLayoutEditLock(active)
        .then((next) => setLock(next))
        .catch((err: unknown) => {
          setEditMode(false);
          setLockError(err instanceof Error ? err.message : "Layout edit session ended.");
          void revertToServer();
        });
    }, 15_000);
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("pointermove", mark);
      window.removeEventListener("keydown", mark);
      window.clearInterval(id);
    };
  }, [canEdit, editMode, revertToServer]);

  const registerPage = useCallback((pageId: string, ids: string[], defaults: Record<string, GridPos>) => {
    specs.set(pageId, { defaults, ids });
  }, [specs]);

  const setPageLayout = useCallback((pageId: string, items: GridItem[]) => {
    setLayouts((prev) => ({ ...prev, [pageId]: items }));
  }, []);

  const pageItems = useCallback(
    (layoutsNow: Record<string, GridItem[]>, pageId: string): GridItem[] => {
      const spec = specs.get(pageId);
      if (!spec) return layoutsNow[pageId] ?? [];
      return mergeLayout(layoutsNow[pageId], spec.ids, spec.defaults);
    },
    [specs]
  );

  const updatePage = useCallback((pageId: string, fn: (items: GridItem[]) => GridItem[]) => {
    setLayouts((prev) => ({ ...prev, [pageId]: fn(pageItems(prev, pageId)) }));
  }, [pageItems]);

  const patchPageItem = useCallback(
    (pageId: string, id: string, patch: Partial<GridItem>) => {
      updatePage(pageId, (items) => patchItem(items, id, patch));
    },
    [updatePage]
  );

  const hidePageItem = useCallback(
    (pageId: string, id: string) => {
      updatePage(pageId, (items) => {
        if (items.some((i) => i.id === id)) return patchItem(items, id, { hidden: true });
        const spec = specs.get(pageId);
        const d = spec?.defaults[id] ?? { x: 0, y: 0, w: 6, h: 3 };
        return [...items, { id, ...d, hidden: true }];
      });
    },
    [specs, updatePage]
  );
  const removePageItem = hidePageItem;

  const showPageItem = useCallback(
    (pageId: string, id: string) => {
      updatePage(pageId, (items) => {
        const current = items.find((i) => i.id === id);
        if (!current) return items;
        const visible = items.filter((i) => !i.hidden && i.id !== id);
        const collides =
          visible.some(
            (i) =>
              current.x < i.x + i.w &&
              current.x + current.w > i.x &&
              current.y < i.y + i.h &&
              current.y + current.h > i.y
          );
        const pos = collides
          ? autoPlace(visible, current.w, current.h)
          : { x: current.x, y: current.y, w: current.w, h: current.h };
        return patchItem(items, id, { hidden: false, ...pos });
      });
    },
    [updatePage]
  );

  const addPageWidget = useCallback(
    (pageId: string, widgetId: string) => {
      updatePage(pageId, (items) => {
        const existing = items.find((i) => i.id === widgetId);
        if (existing) {
          if (!existing.hidden) return items;
          const visible = items.filter((i) => !i.hidden && i.id !== widgetId);
          const collides = visible.some(
            (i) =>
              existing.x < i.x + i.w &&
              existing.x + existing.w > i.x &&
              existing.y < i.y + i.h &&
              existing.y + existing.h > i.y
          );
          const pos = collides
            ? autoPlace(visible, existing.w, existing.h)
            : { x: existing.x, y: existing.y, w: existing.w, h: existing.h };
          return patchItem(items, widgetId, { hidden: false, ...pos });
        }
        const spec = widgetById(pageId, widgetId);
        const w = spec?.default.w ?? 6;
        const h = spec?.default.h ?? 4;
        const pos = autoPlace(
          items.filter((i) => !i.hidden),
          w,
          h
        );
        return [
          ...items,
          {
            id: widgetId,
            widget: widgetId,
            ...pos,
            roles: spec ? defaultRolesFor(spec) : ALL_ROLES,
          },
        ];
      });
    },
    [updatePage]
  );

  const mergePageItems = useCallback(
    (pageId: string, a: string, b: string) => {
      updatePage(pageId, (items) => {
        const left = items.find((i) => i.id === a);
        const right = items.find((i) => i.id === b);
        if (!left || !right) return items;
        const gid = left.group || right.group || `g-${randomId().slice(0, 8)}`;
        return mergeItems(items, a, b, gid);
      });
    },
    [updatePage]
  );

  const ungroupPageItem = useCallback(
    (pageId: string, id: string) => {
      updatePage(pageId, (items) => {
        const item = items.find((i) => i.id === id);
        if (!item?.group) return items;
        const gid = item.group;
        const next = items.map((i) => (i.id === id ? { ...i, group: undefined } : i));
        const leftover = next.filter((i) => i.group === gid);
        if (leftover.length <= 1) {
          return next.map((i) => (i.group === gid ? { ...i, group: undefined } : i));
        }
        return next;
      });
    },
    [updatePage]
  );

  const setItemRoles = useCallback(
    (pageId: string, id: string, roles: DashRole[]) => {
      updatePage(pageId, (items) => patchItem(items, id, { roles: ensureAdminRoles(roles) }));
    },
    [updatePage]
  );

  const beginEdit = useCallback(async () => {
    if (!canEdit) return;
    setLockError(null);
    setAcquiring(true);
    try {
      const held = await acquireLayoutEditLock();
      await enterHeldLock(held);
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Could not start editing.");
      try {
        setLock(await fetchLayoutEditLock());
      } catch {
        /* ignore */
      }
    } finally {
      setAcquiring(false);
    }
  }, [canEdit, enterHeldLock]);

  const cancelEdit = useCallback(async () => {
    setEditMode(false);
    setLockError(null);
    try {
      await releaseLayoutEditLock();
      setLock(await fetchLayoutEditLock());
    } catch {
      setLock(null);
    }
    await revertToServer();
  }, [revertToServer]);

  const endEdit = useCallback(async () => {
    if (!canEdit) {
      setEditMode(false);
      return;
    }
    setSaving(true);
    setLockError(null);
    try {
      const dashboard = cache.settings.dashboard ?? {
        themeId: "classic",
        appearance: "dark" as const,
        layouts: {},
      };
      const saved = await saveSettings({
        ...cache.settings,
        dashboard: { ...dashboard, layouts },
      });
      cache.settings = saved;
      const next = cloneLayouts(saved.dashboard?.layouts ?? layouts);
      setLayouts(next);
      setBaseline(cloneLayouts(next));
      setEditMode(false);
      try {
        await releaseLayoutEditLock();
        setLock(await fetchLayoutEditLock());
      } catch {
        setLock(null);
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit, layouts]);

  const resetPage = useCallback(
    (pageId: string) => {
      const spec = specs.get(pageId);
      if (!spec) {
        setLayouts((prev) => {
          const next = { ...prev };
          delete next[pageId];
          return next;
        });
        return;
      }
      const fresh = compact(
        spec.ids.map((id) => ({
          id,
          ...(spec.defaults[id] ?? { x: 0, y: 0, w: 6, h: 3 }),
        }))
      );
      setLayouts((prev) => ({ ...prev, [pageId]: fresh }));
    },
    [specs]
  );

  const value = useMemo(
    () => ({
      editMode,
      canEdit,
      saving,
      acquiring,
      lock,
      lockError,
      layouts,
      beginEdit,
      endEdit,
      cancelEdit,
      resetPage,
      registerPage,
      setPageLayout,
      patchPageItem,
      hidePageItem,
      removePageItem,
      showPageItem,
      addPageWidget,
      mergePageItems,
      ungroupPageItem,
      setItemRoles,
    }),
    [
      editMode,
      canEdit,
      saving,
      acquiring,
      lock,
      lockError,
      layouts,
      beginEdit,
      endEdit,
      cancelEdit,
      resetPage,
      registerPage,
      setPageLayout,
      patchPageItem,
      hidePageItem,
      removePageItem,
      showPageItem,
      addPageWidget,
      mergePageItems,
      ungroupPageItem,
      setItemRoles,
    ]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboardLayout(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboardLayout must be used within DashboardProvider");
  }
  return ctx;
}
