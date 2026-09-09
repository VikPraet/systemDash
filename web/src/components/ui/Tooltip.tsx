import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import * as S from "./Tooltip.styles";

const GAP = 10;
const MARGIN = 8;
const ARROW_INSET = 14;
// Used for the first placement pass, before the box exists to be measured.
const EST_WIDTH = 180;
const EST_HEIGHT = 56;

interface TooltipPos {
  left: number;
  top: number;
  below: boolean;
  arrow: number;
  measured: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function Tooltip({
  label,
  detail,
  fill,
  children,
}: {
  label?: string;
  detail?: string;
  fill?: boolean;
  children: ReactElement;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);

  // Anchors the box to the trigger, then keeps it inside the viewport: it flips
  // below when it doesn't fit above, and slides horizontally while the arrow
  // stays pointed at the trigger.
  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const box = boxRef.current;
    const w = box?.offsetWidth ?? EST_WIDTH;
    const h = box?.offsetHeight ?? EST_HEIGHT;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const below = r.top - GAP - h < MARGIN;
    const top = clamp(
      below ? r.bottom + GAP : r.top - GAP - h,
      MARGIN,
      vh - h - MARGIN
    );
    const left = clamp(r.left, MARGIN, vw - w - MARGIN);
    // Only re-aim the arrow when the box had to slide; otherwise it keeps its
    // usual resting spot near the left edge.
    const arrow =
      left === r.left
        ? ARROW_INSET
        : clamp(r.left + r.width / 2 - left, ARROW_INSET, w - ARROW_INSET);

    setPos({ left, top, below, arrow, measured: box !== null });
  }, []);

  const show = useCallback(() => {
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    place();
    function onMove() {
      place();
    }
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [visible, place]);

  // Second pass: the first ran before the box existed, so re-place it against
  // its real size. Runs before paint, so the estimate is never shown.
  useLayoutEffect(() => {
    if (visible && pos && !pos.measured) place();
  }, [visible, pos, place]);

  if (!label) return children;

  return (
    <>
      <S.TooltipWrap
        ref={wrapRef}
        $fill={fill}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={(e) => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node)) hide();
        }}
      >
        {children}
      </S.TooltipWrap>
      {visible &&
        pos &&
        createPortal(
          <S.TooltipBox
            ref={boxRef}
            role="tooltip"
            $below={pos.below}
            style={{ left: pos.left, top: pos.top }}
          >
            <S.TooltipTitle>{label}</S.TooltipTitle>
            {detail && <S.TooltipDetail>{detail}</S.TooltipDetail>}
            <S.TooltipArrow $below={pos.below} $x={pos.arrow} />
          </S.TooltipBox>,
          document.body
        )}
    </>
  );
}
