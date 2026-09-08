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
const EST_HEIGHT = 56;

interface TooltipPos {
  left: number;
  top: number;
  below: boolean;
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
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);

  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < EST_HEIGHT + GAP;
    setPos({
      left: r.left,
      top: below ? r.bottom + GAP : r.top - GAP,
      below,
    });
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
            role="tooltip"
            $below={pos.below}
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.below ? undefined : "translateY(-100%)",
            }}
          >
            <S.TooltipTitle>{label}</S.TooltipTitle>
            {detail && <S.TooltipDetail>{detail}</S.TooltipDetail>}
            <S.TooltipArrow $below={pos.below} />
          </S.TooltipBox>,
          document.body
        )}
    </>
  );
}
