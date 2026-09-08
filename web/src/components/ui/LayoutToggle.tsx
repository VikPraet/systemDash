import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CircleHelp,
  LayoutGrid,
  Plus,
  RotateCcw,
  Timer,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useDashboardLayout } from "../../theme/DashboardContext";
import { Tooltip } from "./Tooltip";
import { IconBtn } from "./styles";
import { catalogForPage, humanizePanelId, widgetById } from "../dashboard/catalog";
import { fixedMenuStyle, useFixedMenuPos } from "../dashboard/placeMenu";
import { cache } from "../../cache";
import * as D from "../dashboard/styles";

const LAYOUT_PAGES = new Set(["/overview", "/history", "/files", "/projects"]);

function pageIdsFromPath(pathname: string): string[] {
  if (pathname.startsWith("/overview")) return ["overview"];
  if (pathname.startsWith("/history")) return ["history"];
  if (pathname.startsWith("/files")) return ["files-drives", "files-network", "files-trash"];
  if (pathname.startsWith("/projects")) return ["projects"];
  return [];
}

export function LayoutToggle() {
  const { editMode, beginEdit, cancelEdit, lock, acquiring } = useDashboardLayout();
  const location = useLocation();
  const onLayoutPage =
    LAYOUT_PAGES.has(location.pathname) ||
    location.pathname.startsWith("/files") ||
    location.pathname.startsWith("/projects");
  if (!onLayoutPage && !editMode) return null;
  const blocked = Boolean(lock?.editing && !lock.mine);
  const label = editMode
    ? "Exit layout editing"
    : blocked
      ? `${lock?.username ?? "Another admin"} is customizing the layout`
      : acquiring
        ? "Starting…"
        : "Customize layout";
  const detail = editMode
    ? "Discard changes and reload the server layout."
    : undefined;
  return (
    <Tooltip label={label} detail={detail}>
      <IconBtn
        type="button"
        aria-label={label}
        aria-pressed={editMode}
        disabled={blocked || acquiring}
        onClick={() => {
          if (editMode) void cancelEdit();
          else if (!blocked) void beginEdit();
        }}
      >
        {editMode ? (
          <X size={16} strokeWidth={1.8} />
        ) : (
          <LayoutGrid size={16} strokeWidth={1.8} />
        )}
      </IconBtn>
    </Tooltip>
  );
}

function HintIcon({
  label,
  detail,
  children,
}: {
  label: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} detail={detail}>
      <D.EditHintBtn type="button" aria-label={label}>
        {children}
      </D.EditHintBtn>
    </Tooltip>
  );
}

export function LayoutEditBar() {
  const { editMode, endEdit, cancelEdit, resetPage, saving, lockError, lock } =
    useDashboardLayout();
  const location = useLocation();
  const pageIds = pageIdsFromPath(location.pathname);
  const [error, setError] = useState<string | null>(null);
  if (!editMode && !lockError) {
    if (lock?.editing && !lock.mine) {
      return (
        <D.EditBar>
          <D.EditBarHead>
            <D.EditBarTitle>{lock.username} is editing</D.EditBarTitle>
            <HintIcon
              label="Wait to customize"
              detail="You can start after they Save or Cancel, or after 3 minutes idle."
            >
              <Timer size={13} strokeWidth={1.8} />
            </HintIcon>
          </D.EditBarHead>
        </D.EditBar>
      );
    }
    return null;
  }
  if (!editMode) {
    return (
      <D.EditBar>
        <span>{lockError}</span>
      </D.EditBar>
    );
  }
  return (
    <D.EditBar>
      <D.EditBarHead>
        <D.EditBarTitle>Editing layout</D.EditBarTitle>
        <HintIcon
          label="While you edit"
          detail={
            "Faded panels are hidden from some roles.\nDelete removes a panel; Add brings it back.\nIdle 3 min without mouse or click lets another admin take over."
          }
        >
          <CircleHelp size={14} strokeWidth={1.8} />
        </HintIcon>
      </D.EditBarHead>
      <D.EditActions>
        {pageIds.length > 0 && <AddPanelButton pageIds={pageIds} />}
        {pageIds.length > 0 && (
          <D.EditCell>
            <Tooltip label="Reset page" detail="Restore this page to the default layout.">
              <D.EditBarBtn
                type="button"
                disabled={saving}
                onClick={() => pageIds.forEach((id) => resetPage(id))}
              >
                <RotateCcw size={13} strokeWidth={1.8} />
                Reset
              </D.EditBarBtn>
            </Tooltip>
          </D.EditCell>
        )}
        <D.EditCell>
          <Tooltip label="Cancel" detail="Discard changes and reload the server layout.">
            <D.EditBarBtn
              type="button"
              disabled={saving}
              onClick={() => {
                setError(null);
                void cancelEdit();
              }}
            >
              <X size={13} strokeWidth={1.8} />
              Cancel
            </D.EditBarBtn>
          </Tooltip>
        </D.EditCell>
        <D.EditCell>
          <Tooltip label="Save" detail="Write this layout for everyone.">
            <D.EditBarBtn
              $primary
              type="button"
              disabled={saving}
              onClick={() => {
                setError(null);
                void endEdit().catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Could not save layout");
                });
              }}
            >
              <Check size={13} strokeWidth={2} />
              {saving ? "Saving…" : "Save"}
            </D.EditBarBtn>
          </Tooltip>
        </D.EditCell>
      </D.EditActions>
      {error && <span className="muted">{error}</span>}
    </D.EditBar>
  );
}

function AddPanelButton({ pageIds }: { pageIds: string[] }) {
  const { layouts, addPageWidget } = useDashboardLayout();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pos = useFixedMenuPos(open, btnRef, menuRef, 280);
  const gpuCount = cache.snapshot?.gpus.length ?? cache.history.data?.gpus.length ?? 0;
  const primaryId = pageIds[0] ?? "";
  const catalog = useMemo(() => catalogForPage(primaryId, gpuCount), [gpuCount, primaryId]);

  const hidden = pageIds.flatMap((pid) =>
    (layouts[pid] ?? [])
      .filter((item) => item.hidden)
      .map((item) => ({
        pageId: pid,
        id: item.id,
        label: widgetById(pid, item.id, gpuCount)?.label ?? humanizePanelId(item.id),
      }))
  );

  const extraVisible = catalog.filter((w) => {
    const item = (layouts[primaryId] ?? []).find((i) => i.id === w.id);
    if (item?.hidden) return false;
    return !item;
  });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (catalog.length === 0 && hidden.length === 0) return null;

  const groups = [
    { key: "hidden", label: "Removed", items: hidden },
    {
      key: "overview",
      label: "Overview",
      items: extraVisible
        .filter((i) => i.category === "overview")
        .map((i) => ({ pageId: primaryId, id: i.id, label: i.label })),
    },
    {
      key: "charts",
      label: "Charts",
      items: extraVisible
        .filter((i) => i.category === "charts")
        .map((i) => ({ pageId: primaryId, id: i.id, label: i.label })),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <D.AddMenu>
      <Tooltip label="Add panel" detail="Add a widget, or restore a deleted panel.">
        <D.EditBarBtn
          ref={btnRef}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Plus size={13} strokeWidth={1.8} />
          Add
        </D.EditBarBtn>
      </Tooltip>
      {open &&
        createPortal(
          <D.AddMenuPop ref={menuRef} style={fixedMenuStyle(pos, 280)}>
            {groups.length === 0 && (
              <div className="muted" style={{ padding: "8px 10px", fontSize: 13 }}>
                Every panel is already on this page.
              </div>
            )}
            {groups.map((g) => (
              <div key={g.key}>
                <D.AddMenuCat>{g.label}</D.AddMenuCat>
                {g.items.map((item) => (
                  <D.PanelMenuItem
                    key={`${item.pageId}:${item.id}`}
                    type="button"
                    onClick={() => {
                      addPageWidget(item.pageId, item.id);
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </D.PanelMenuItem>
                ))}
              </div>
            ))}
          </D.AddMenuPop>,
          document.body
        )}
    </D.AddMenu>
  );
}
