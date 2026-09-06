import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import * as S from "./styles";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface MenuPos {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

/**
 * A fully custom select replacement (no native browser dropdown). The popup is
 * portalled to <body> with fixed positioning so it can never be clipped by an
 * ancestor's overflow, and it closes on outside click, Escape, scroll or resize.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  title,
  ariaLabel,
  placeholder,
  variant = "default",
  autoFocus,
}: {
  value: T | "";
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  title?: string;
  ariaLabel?: string;
  placeholder?: string;
  variant?: "default" | "underline";
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);
  const shown = selected?.label ?? (placeholder || value);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(360, openUp ? spaceAbove : spaceBelow));
    setPos(
      openUp
        ? {
            bottom: window.innerHeight - r.top + gap,
            left: r.left,
            width: r.width,
            maxHeight,
          }
        : {
            top: r.bottom + gap,
            left: r.left,
            width: r.width,
            maxHeight,
          }
    );
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Reposition would drift on scroll; close unless the menu itself is scrolling.
    function onMove(e: Event) {
      const t = e.target;
      if (t instanceof Node && menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <Tooltip label={title}>
      <S.DropdownRoot>
        <S.DropdownTrigger
          ref={triggerRef}
          type="button"
          $open={open}
          $variant={variant}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
        >
        <S.DropdownValue $placeholder={!selected && !!placeholder}>
          {shown}
        </S.DropdownValue>
        <ChevronDown className="dropdown-chevron" size={15} strokeWidth={1.8} />
      </S.DropdownTrigger>

      {open &&
        pos &&
        createPortal(
          <S.DropdownMenu
            ref={menuRef}
            role="listbox"
            style={{
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              minWidth: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
            {options.map((o) => {
              const isSel = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={isSel}>
                  <S.DropdownItem
                    type="button"
                    $selected={isSel}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <S.DropdownItemMain>
                      <S.DropdownItemLabel>{o.label}</S.DropdownItemLabel>
                      {o.hint && (
                        <S.DropdownItemHint>{o.hint}</S.DropdownItemHint>
                      )}
                    </S.DropdownItemMain>
                    {isSel && <Check size={14} strokeWidth={2.2} />}
                  </S.DropdownItem>
                </li>
              );
            })}
          </S.DropdownMenu>,
          document.body
        )}
      </S.DropdownRoot>
    </Tooltip>
  );
}
