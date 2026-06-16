import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface MenuPos {
  top: number;
  left: number;
  width: number;
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
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  title?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
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
    // Reposition would drift on scroll; simplest correct behaviour is to close.
    function onMove() {
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
    <div className="dropdown" title={title}>
      <button
        ref={triggerRef}
        type="button"
        className={`dropdown-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="dropdown-value">{selected?.label ?? value}</span>
        <ChevronDown className="dropdown-chevron" size={15} strokeWidth={1.8} />
      </button>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            className="dropdown-menu"
            role="listbox"
            style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
          >
            {options.map((o) => {
              const isSel = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={isSel}>
                  <button
                    type="button"
                    className={`dropdown-item${isSel ? " selected" : ""}`}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <span className="dropdown-item-main">
                      <span className="dropdown-item-label">{o.label}</span>
                      {o.hint && (
                        <span className="dropdown-item-hint">{o.hint}</span>
                      )}
                    </span>
                    {isSel && <Check size={14} strokeWidth={2.2} />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}
