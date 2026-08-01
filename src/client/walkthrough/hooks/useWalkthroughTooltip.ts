import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { DomElementTag, DomEvent } from "@/runtime";
import {
  WalkthroughStepMode,
  type WalkthroughStep,
} from "../model";
import {
  computeWalkthroughTooltipPosition,
  getWalkthroughTargetRect,
  WalkthroughSpacing,
  WalkthroughStyleSlot,
  WalkthroughTooltipWidth,
  removeWalkthroughStyleRule,
  setWalkthroughStyleRule,
  type WalkthroughPoint,
  type WalkthroughRect,
} from "../utils";

type UseWalkthroughTooltipOptions = Readonly<{
  isMobile: boolean;
  step: WalkthroughStep;
}>;

type WalkthroughDragStart = Readonly<{
  originalX: number;
  originalY: number;
  pointerX: number;
  pointerY: number;
}>;

type UseWalkthroughTooltipResult = Readonly<{
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent) => void;
  ready: boolean;
  targetRect: WalkthroughRect | null;
  tooltipRef: RefObject<HTMLDivElement | null>;
}>;

enum WalkthroughAnimationFrameId {
  Initial = 0,
}

function stepSelectors(step: WalkthroughStep): readonly string[] {
  return [
    step.buttonSelector,
    step.highlightSelector,
    step.tertiarySelector,
    step.quaternarySelector,
  ].filter((selector): selector is string => selector !== undefined);
}

function tooltipMaxWidth(isMobile: boolean, step: WalkthroughStep): number {
  if (!isMobile) return WalkthroughTooltipWidth.Desktop;
  if (step.mode !== WalkthroughStepMode.Action) {
    return WalkthroughTooltipWidth.Mobile;
  }
  return window.innerWidth - WalkthroughSpacing.Viewport * 2;
}

export function useWalkthroughTooltip({
  isMobile,
  step,
}: UseWalkthroughTooltipOptions): UseWalkthroughTooltipResult {
  const [targetRect, setTargetRect] = useState<WalkthroughRect | null>(null);
  const [position, setPosition] = useState<WalkthroughPoint | null>(null);
  const [dragOffset, setDragOffset] = useState<WalkthroughPoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<WalkthroughDragStart | null>(null);
  const frameRef = useRef(WalkthroughAnimationFrameId.Initial);

  useLayoutEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      setDragOffset({
        x: start.originalX + event.clientX - start.pointerX,
        y: start.originalY + event.clientY - start.pointerY,
      });
    };
    const handlePointerUp = () => {
      dragStartRef.current = null;
      setDragging(false);
    };
    window.addEventListener(DomEvent.PointerMove, handlePointerMove);
    window.addEventListener(DomEvent.PointerUp, handlePointerUp);
    window.addEventListener(DomEvent.PointerCancel, handlePointerUp);
    return () => {
      window.removeEventListener(DomEvent.PointerMove, handlePointerMove);
      window.removeEventListener(DomEvent.PointerUp, handlePointerUp);
      window.removeEventListener(DomEvent.PointerCancel, handlePointerUp);
    };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if ((event.target as HTMLElement).closest(DomElementTag.Button)) return;
      if (!position) return;
      event.preventDefault();
      const currentOffset = dragOffset ?? { x: 0, y: 0 };
      dragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        originalX: currentOffset.x,
        originalY: currentOffset.y,
      };
      setDragging(true);
    },
    [dragOffset, position],
  );

  useEffect(() => {
    setDragOffset(null);
  }, [step]);

  const measure = useCallback(() => {
    const rect = getWalkthroughTargetRect(step.targetSelector);
    setTargetRect(rect);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const tooltipRect = tooltip.getBoundingClientRect();
      setPosition(
        computeWalkthroughTooltipPosition(
          rect,
          step.placement,
          tooltipRect.width,
          tooltipRect.height,
          step.id,
          stepSelectors(step),
        ),
      );
    });
  }, [step]);

  useEffect(() => {
    measure();
    window.addEventListener(DomEvent.Resize, measure);
    window.addEventListener(DomEvent.Scroll, measure, true);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener(DomEvent.Resize, measure);
    visualViewport?.addEventListener(DomEvent.Scroll, measure);
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener(DomEvent.Resize, measure);
      window.removeEventListener(DomEvent.Scroll, measure, true);
      visualViewport?.removeEventListener(DomEvent.Resize, measure);
      visualViewport?.removeEventListener(DomEvent.Scroll, measure);
      observer.disconnect();
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (!position) return;
    setWalkthroughStyleRule(WalkthroughStyleSlot.Tooltip, {
      left: position.x + (dragOffset?.x ?? 0),
      top: position.y + (dragOffset?.y ?? 0),
      maxWidth: tooltipMaxWidth(isMobile, step),
    });
    return () => {
      removeWalkthroughStyleRule(WalkthroughStyleSlot.Tooltip);
    };
  }, [dragOffset, isMobile, position, step]);

  return {
    dragging,
    onPointerDown,
    ready: position !== null,
    targetRect,
    tooltipRef,
  };
}
