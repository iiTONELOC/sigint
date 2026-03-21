import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// ── Types ────────────────────────────────────────────────────────────

type TooltipPlacement = "top" | "bottom" | "left" | "right";

type TooltipProps = {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly placement?: TooltipPlacement;
  readonly delay?: number;
  readonly disabled?: boolean;
  readonly shortcut?: string;
};

// ── Positioning ──────────────────────────────────────────────────────

const GAP = 6;
const VIEWPORT_PAD = 8;

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  placement: TooltipPlacement,
): { x: number; y: number; finalPlacement: TooltipPlacement } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const positions: Record<TooltipPlacement, { x: number; y: number }> = {
    top: {
      x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      y: triggerRect.top - tooltipRect.height - GAP,
    },
    bottom: {
      x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      y: triggerRect.bottom + GAP,
    },
    left: {
      x: triggerRect.left - tooltipRect.width - GAP,
      y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
    },
    right: {
      x: triggerRect.right + GAP,
      y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
    },
  };

  // Try preferred placement first, then flip if it goes off-screen
  const order: TooltipPlacement[] = [placement];
  const opposites: Record<TooltipPlacement, TooltipPlacement> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  order.push(opposites[placement]);
  if (placement === "top" || placement === "bottom") {
    order.push("right", "left");
  } else {
    order.push("bottom", "top");
  }

  for (const p of order) {
    const pos = positions[p]!;
    const fitsX =
      pos.x >= VIEWPORT_PAD && pos.x + tooltipRect.width <= vw - VIEWPORT_PAD;
    const fitsY =
      pos.y >= VIEWPORT_PAD && pos.y + tooltipRect.height <= vh - VIEWPORT_PAD;
    if (fitsX && fitsY) {
      return { x: pos.x, y: pos.y, finalPlacement: p };
    }
  }

  // Fallback: clamp to viewport
  const pos = positions[placement]!;
  return {
    x: Math.max(
      VIEWPORT_PAD,
      Math.min(vw - tooltipRect.width - VIEWPORT_PAD, pos.x),
    ),
    y: Math.max(
      VIEWPORT_PAD,
      Math.min(vh - tooltipRect.height - VIEWPORT_PAD, pos.y),
    ),
    finalPlacement: placement,
  };
}

// ── Component ────────────────────────────────────────────────────────

export function Tooltip({
  content,
  children,
  placement = "top",
  delay = 400,
  disabled = false,
  shortcut,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    // Skip tooltips on touch devices — they interfere with tap targets
    if (window.matchMedia("(pointer: coarse)").matches) return;
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    setPosition(null);
  }, []);

  // Position the tooltip once it's visible and rendered
  useEffect(() => {
    if (!visible) return;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const { x, y } = computePosition(triggerRect, tooltipRect, placement);
    setPosition({ x, y });
  }, [visible, placement]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onMouseDown={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex"
      >
        {children}
      </div>
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed z-40 pointer-events-none"
            style={{
              left: position?.x ?? -9999,
              top: position?.y ?? -9999,
              opacity: position ? 1 : 0,
              transition: "opacity 0.1s ease-out",
            }}
          >
            <div className="px-2 py-1 rounded bg-sig-panel border border-sig-border/60 shadow-lg max-w-56">
              <div className="text-sig-bright text-(length:--sig-text-sm) leading-snug">
                {content}
              </div>
              {shortcut && (
                <div className="text-sig-dim text-[10px] mt-0.5 tracking-wider">
                  {shortcut}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
