import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, MoreHorizontal, Trash2, Users } from "lucide-react";
import type { DashRole } from "../../types";
import { ALL_ROLES, rolesFor, type GridItem } from "./grid";
import { useDashboardLayout } from "../../theme/DashboardContext";
import { fixedMenuStyle, useFixedMenuPos } from "./placeMenu";
import * as S from "./styles";

export function PanelMenu({
  pageId,
  item,
  label,
  others,
  defaultRoles,
}: {
  pageId: string;
  item: GridItem;
  label: string;
  others: Array<{ id: string; label: string }>;
  defaultRoles?: DashRole[];
}) {
  const { removePageItem, mergePageItems, ungroupPageItem, setItemRoles } = useDashboardLayout();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pos = useFixedMenuPos(open, btnRef, menuRef, 220);
  const shownRoles = rolesFor(item, defaultRoles ?? ALL_ROLES);

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

  function toggleRole(role: DashRole) {
    if (role === "admin") return;
    const next = shownRoles.includes(role)
      ? shownRoles.filter((r) => r !== role)
      : [...shownRoles, role];
    setItemRoles(pageId, item.id, next);
  }

  return (
    <>
      <S.PanelMenuBtn
        ref={btnRef}
        type="button"
        aria-label={`Panel options for ${label}`}
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={14} />
      </S.PanelMenuBtn>
      {open &&
        createPortal(
          <S.PanelMenuPop ref={menuRef} style={fixedMenuStyle(pos, 220)}>
            {item.group && (
              <S.PanelMenuItem
                type="button"
                onClick={() => {
                  ungroupPageItem(pageId, item.id);
                  setOpen(false);
                }}
              >
                <Layers size={14} />
                Ungroup
              </S.PanelMenuItem>
            )}
            {others.length > 0 && (
              <S.PanelMenuSection>
                <S.PanelMenuLabel>
                  <Layers size={12} /> Merge with
                </S.PanelMenuLabel>
                {others.map((o) => (
                  <S.PanelMenuItem
                    key={o.id}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      mergePageItems(pageId, item.id, o.id);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </S.PanelMenuItem>
                ))}
              </S.PanelMenuSection>
            )}
            <S.PanelMenuSection>
              <S.PanelMenuLabel>
                <Users size={12} /> Visible to
              </S.PanelMenuLabel>
              {ALL_ROLES.map((role) => (
                <S.PanelCheck key={role} $disabled={role === "admin"}>
                  <input
                    type="checkbox"
                    checked={shownRoles.includes(role)}
                    disabled={role === "admin"}
                    onChange={() => toggleRole(role)}
                  />
                  <span>{role}</span>
                  {role === "admin" && <S.PanelCheckHint>always</S.PanelCheckHint>}
                  {role !== "admin" && !shownRoles.includes(role) && (
                    <S.PanelCheckHint>hidden</S.PanelCheckHint>
                  )}
                </S.PanelCheck>
              ))}
            </S.PanelMenuSection>
            <S.PanelMenuSection>
              <S.PanelMenuItem
                type="button"
                $danger
                onClick={() => {
                  removePageItem(pageId, item.id);
                  setOpen(false);
                }}
              >
                <Trash2 size={14} />
                Delete panel
              </S.PanelMenuItem>
            </S.PanelMenuSection>
          </S.PanelMenuPop>,
          document.body
        )}
    </>
  );
}
