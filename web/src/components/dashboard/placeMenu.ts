import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

export interface FixedMenuPos {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** Place a fixed overlay so it stays fully inside the viewport. */
export function placeFixedMenu(
  trigger: DOMRect,
  opts: { width?: number; menuHeight?: number; gap?: number; margin?: number } = {}
): FixedMenuPos {
  const gap = opts.gap ?? 4;
  const margin = opts.margin ?? 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availW = Math.max(120, vw - margin * 2);
  const width = Math.min(opts.width ?? 220, availW);
  const spaceBelow = Math.max(0, vh - trigger.bottom - margin);
  const spaceAbove = Math.max(0, trigger.top - margin);
  const needed = opts.menuHeight ?? 240;
  const openUp = spaceBelow < Math.min(needed, 200) && spaceAbove > spaceBelow;
  const maxHeight = Math.min(420, Math.max(0, (openUp ? spaceAbove : spaceBelow) - gap));
  let left = trigger.right - width;
  if (left + width > vw - margin) left = vw - width - margin;
  if (left < margin) left = margin;
  if (openUp) {
    return {
      bottom: vh - trigger.top + gap,
      left,
      width,
      maxHeight,
    };
  }
  return { top: trigger.bottom + gap, left, width, maxHeight };
}

export function fixedMenuStyle(pos: FixedMenuPos | null, fallbackWidth: number): CSSProperties {
  if (!pos) {
    return {
      visibility: "hidden",
      pointerEvents: "none",
      top: 0,
      left: 0,
      width: fallbackWidth,
    };
  }
  return {
    top: pos.top ?? "auto",
    bottom: pos.bottom ?? "auto",
    left: pos.left,
    width: pos.width,
    maxHeight: pos.maxHeight,
  };
}

export function useFixedMenuPos(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  width = 220
) {
  const [pos, setPos] = useState<FixedMenuPos | null>(null);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const next = placeFixedMenu(el.getBoundingClientRect(), {
      width,
      menuHeight: menuRef.current?.offsetHeight,
    });
    setPos((prev) => {
      if (
        prev &&
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight
      ) {
        return prev;
      }
      return next;
    });
  }, [menuRef, triggerRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updatePos());
    ro.observe(menu);
    return () => ro.disconnect();
  }, [menuRef, open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    vv?.addEventListener("resize", updatePos);
    vv?.addEventListener("scroll", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
      vv?.removeEventListener("resize", updatePos);
      vv?.removeEventListener("scroll", updatePos);
    };
  }, [open, updatePos]);

  return pos;
}
