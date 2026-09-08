import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Pencil, Plus, Palette, Trash2, Upload } from "lucide-react";
import { useAppearance } from "../../theme/AppearanceContext";
import { resolveTheme } from "../../theme/appearance";
import type { DashTheme } from "../../theme/schema";
import { ThemeEditor } from "./ThemeEditor";
import { Tooltip } from "./Tooltip";
import { IconBtn } from "./styles";
import styled from "styled-components";

const Menu = styled.div`
  position: fixed;
  z-index: 300;
  width: min(360px, calc(100vw - 16px));
  max-height: min(420px, 70vh);
  overflow: auto;
  padding: 10px;
  background: ${({ theme }) => theme.color.panel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.base};
  box-shadow: 0 12px 40px ${({ theme }) => theme.color.shadow};
  animation: dropdown-in 0.12s ease;
`;

const MenuTitle = styled.div`
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.muted};
  padding: 4px 6px 8px;
`;

const ThemeRow = styled.div<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0 0 4px;
  padding: 8px 8px;
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.color.accent : "transparent")};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ $active, theme }) =>
    $active ? theme.color.panel2 : "transparent"};
  color: ${({ theme }) => theme.color.text};
`;

const ThemeSelect = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
`;

const Swatch = styled.span<{ $bg: string; $accent: string }>`
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ $bg }) => $bg};
  box-shadow: inset 0 0 0 1px ${({ theme }) => theme.color.border},
    inset -6px -6px 0 ${({ $accent }) => $accent};
`;

const ThemeName = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 13px;
`;

const ThemeMeta = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.color.muted};
`;

const MenuActions = styled.div`
  display: flex;
  gap: 6px;
  padding: 8px 4px 4px;
  border-top: 1px solid ${({ theme }) => theme.color.border};
  margin-top: 6px;
`;

const MenuBtn = styled.button`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  font-size: 12px;

  &:hover {
    border-color: ${({ theme }) => theme.color.accent};
  }
`;

const MenuError = styled.div`
  margin: 6px 4px 0;
  font-size: 12px;
  color: ${({ theme }) => theme.color.bad};
`;

function downloadTheme(theme: DashTheme) {
  const blob = new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${theme.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ThemePicker() {
  const { theme, themeId, appearance, catalog, setThemeId, importTheme, deleteTheme, exportTheme } =
    useAppearance();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ source: DashTheme; mode: "create" | "edit" } | null>(
    null
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const takenIds = useMemo(() => new Set(catalog.map((t) => t.id)), [catalog]);

  function sourceFor(id: string): DashTheme {
    return catalog.find((t) => t.id === id)?.theme ?? resolveTheme(id);
  }

  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (btn) {
      const r = btn.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      setPos(
        spaceBelow < 280
          ? { bottom: window.innerHeight - r.top + 6, left: Math.max(8, r.right - 360) }
          : { top: r.bottom + 6, left: Math.max(8, r.right - 360) }
      );
    }
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      await importTheme(json);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import theme");
    }
  }

  return (
    <>
      <Tooltip label="Themes">
        <IconBtn
          ref={btnRef}
          type="button"
          aria-label="Themes"
          aria-expanded={open}
          onClick={() => {
            setError(null);
            setOpen((v) => !v);
          }}
        >
          <Palette size={16} strokeWidth={1.8} />
        </IconBtn>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <Menu
            ref={menuRef}
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
            role="menu"
          >
            <MenuTitle>Themes</MenuTitle>
            {catalog.map((t) => {
              const preview = t.preview?.[appearance] ?? t.preview?.dark ?? t.preview?.light;
              return (
                <ThemeRow key={t.id} $active={t.id === themeId}>
                  <ThemeSelect type="button" onClick={() => setThemeId(t.id)}>
                    <Swatch $bg={preview?.bg ?? "#111"} $accent={preview?.accent ?? "#888"} />
                    <ThemeName>{t.name}</ThemeName>
                    {!t.builtin && <ThemeMeta>custom</ThemeMeta>}
                    {t.id === themeId && <Check size={14} />}
                  </ThemeSelect>
                  {!t.builtin && (
                    <IconBtn
                      type="button"
                      aria-label={`Edit ${t.name}`}
                      onClick={() => {
                        setOpen(false);
                        setEditor({ source: sourceFor(t.id), mode: "edit" });
                      }}
                    >
                      <Pencil size={13} />
                    </IconBtn>
                  )}
                  <IconBtn
                    type="button"
                    aria-label={`Duplicate ${t.name}`}
                    onClick={() => {
                      setOpen(false);
                      setEditor({ source: sourceFor(t.id), mode: "create" });
                    }}
                  >
                    <Copy size={13} />
                  </IconBtn>
                  {!t.builtin && (
                    <IconBtn
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => {
                        void deleteTheme(t.id).catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : "Delete failed");
                        });
                      }}
                    >
                      <Trash2 size={13} />
                    </IconBtn>
                  )}
                </ThemeRow>
              );
            })}
            <MenuActions>
              <MenuBtn
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditor({ source: theme, mode: "create" });
                }}
              >
                <Plus size={13} />
                New
              </MenuBtn>
              <MenuBtn type="button" onClick={() => fileRef.current?.click()}>
                <Upload size={13} />
                Import
              </MenuBtn>
              <MenuBtn type="button" onClick={() => downloadTheme(exportTheme())}>
                <Download size={13} />
                Export
              </MenuBtn>
            </MenuActions>
            {error && <MenuError>{error}</MenuError>}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onFile(file);
              }}
            />
          </Menu>,
          document.body
        )}
      {editor && (
        <ThemeEditor
          key={`${editor.mode}-${editor.source.id}`}
          source={editor.source}
          mode={editor.mode}
          takenIds={takenIds}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
