import {
  useState,
  useRef,
  useEffect,
  useCallback,
  cloneElement,
  type FocusEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { isMobileWidth } from "@/config/breakpoints";

export enum TooltipPlacement {
  Bottom = "bottom",
  Left = "left",
  Right = "right",
  Top = "top",
}

type TooltipPlacementValue = `${TooltipPlacement}`;

type TooltipTriggerProps = Readonly<{
  onBlur?: FocusEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onMouseDown?: MouseEventHandler<HTMLElement>;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
}>;

type TooltipProps = {
  readonly content: ReactNode;
  readonly children: ReactElement<TooltipTriggerProps>;
  readonly placement?: TooltipPlacementValue;
  readonly delay?: number;
  readonly disabled?: boolean;
  readonly shortcut?: string;
};

enum TooltipMetric {
  DefaultDelayMs = 400,
  GapPx = 6,
  HiddenCoordinatePx = -9_999,
  ViewportPaddingPx = 8,
}

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  placement: TooltipPlacementValue,
): { x: number; y: number; finalPlacement: TooltipPlacementValue } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const positions: Record<TooltipPlacementValue, { x: number; y: number }> = {
    [TooltipPlacement.Top]: {
      x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      y: triggerRect.top - tooltipRect.height - TooltipMetric.GapPx,
    },
    [TooltipPlacement.Bottom]: {
      x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      y: triggerRect.bottom + TooltipMetric.GapPx,
    },
    [TooltipPlacement.Left]: {
      x: triggerRect.left - tooltipRect.width - TooltipMetric.GapPx,
      y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
    },
    [TooltipPlacement.Right]: {
      x: triggerRect.right + TooltipMetric.GapPx,
      y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
    },
  };

  // Try preferred placement first, then flip if it goes off-screen
  const order: TooltipPlacementValue[] = [placement];
  const opposites: Record<TooltipPlacementValue, TooltipPlacementValue> = {
    [TooltipPlacement.Top]: TooltipPlacement.Bottom,
    [TooltipPlacement.Bottom]: TooltipPlacement.Top,
    [TooltipPlacement.Left]: TooltipPlacement.Right,
    [TooltipPlacement.Right]: TooltipPlacement.Left,
  };
  order.push(opposites[placement]);
  if (
    placement === TooltipPlacement.Top ||
    placement === TooltipPlacement.Bottom
  ) {
    order.push(TooltipPlacement.Right, TooltipPlacement.Left);
  } else {
    order.push(TooltipPlacement.Bottom, TooltipPlacement.Top);
  }

  for (const p of order) {
    const pos = positions[p]!;
    const fitsX =
      pos.x >= TooltipMetric.ViewportPaddingPx &&
      pos.x + tooltipRect.width <= vw - TooltipMetric.ViewportPaddingPx;
    const fitsY =
      pos.y >= TooltipMetric.ViewportPaddingPx &&
      pos.y + tooltipRect.height <= vh - TooltipMetric.ViewportPaddingPx;
    if (fitsX && fitsY) {
      return { x: pos.x, y: pos.y, finalPlacement: p };
    }
  }

  // Fallback: clamp to viewport
  const pos = positions[placement]!;
  return {
    x: Math.max(
      TooltipMetric.ViewportPaddingPx,
      Math.min(
        vw - tooltipRect.width - TooltipMetric.ViewportPaddingPx,
        pos.x,
      ),
    ),
    y: Math.max(
      TooltipMetric.ViewportPaddingPx,
      Math.min(
        vh - tooltipRect.height - TooltipMetric.ViewportPaddingPx,
        pos.y,
      ),
    ),
    finalPlacement: placement,
  };
}

export function Tooltip({
  content,
  children,
  placement = TooltipPlacement.Top,
  delay = TooltipMetric.DefaultDelayMs,
  disabled = false,
  shortcut,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    // Skip tooltips on touch devices and narrow viewports (mobile)
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (isMobileWidth(window.innerWidth)) return;
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

  const trigger = cloneElement(children, {
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event);
      show();
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event);
      hide();
    },
    onMouseDown: (event) => {
      children.props.onMouseDown?.(event);
      hide();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      show();
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      hide();
    },
  });

  return (
    <>
      <span ref={triggerRef} className="inline-flex">{trigger}</span>
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed z-(--layer-tooltip) pointer-events-none"
            style={{
              left: position?.x ?? TooltipMetric.HiddenCoordinatePx,
              top: position?.y ?? TooltipMetric.HiddenCoordinatePx,
              opacity: position ? 1 : 0,
              transition: "opacity 0.1s ease-out",
            }}
          >
            <div className="px-2 py-1 rounded bg-sig-panel border border-sig-border/60 shadow-lg max-w-56">
              <div className="text-sig-bright text-(length:--sig-text-sm) leading-snug">
                {content}
              </div>
              {shortcut && (
                <div className="text-sig-dim text-(length:--sig-text-xs) mt-0.5 tracking-wider">
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
