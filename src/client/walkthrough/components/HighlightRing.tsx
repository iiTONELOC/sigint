import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getWalkthroughTargetRect } from "../utils/geometry";
import {
  removeWalkthroughStyleRule,
  setWalkthroughStyleRule,
  WalkthroughStyleSlot,
} from "../utils/stylesheet";
import { WalkthroughRingColor } from "../model";

type HighlightRingProps = Readonly<{
  color?: WalkthroughRingColor;
  selector: string;
  slot: WalkthroughStyleSlot;
}>;

enum HighlightRingSpacing {
  Offset = 5,
}

enum AnimationFrameId {
  Initial = 0,
}

export function HighlightRing({
  color = WalkthroughRingColor.Accent,
  selector,
  slot,
}: HighlightRingProps) {
  const ringRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(AnimationFrameId.Initial);

  useEffect(() => {
    let mounted = true;
    const track = () => {
      if (!mounted) return;
      const rect = getWalkthroughTargetRect(selector);
      const ring = ringRef.current;
      if (ring && rect && rect.width > 0) {
        const offset = HighlightRingSpacing.Offset;
        setWalkthroughStyleRule(slot, {
          top: rect.top + window.scrollY - offset,
          left: rect.left + window.scrollX - offset,
          width: rect.width + offset * 2,
          height: rect.height + offset * 2,
        });
        ring.hidden = false;
      } else if (ring) {
        ring.hidden = true;
      }
      frameRef.current = requestAnimationFrame(track);
    };

    frameRef.current = requestAnimationFrame(track);
    return () => {
      mounted = false;
      cancelAnimationFrame(frameRef.current);
      removeWalkthroughStyleRule(slot);
    };
  }, [selector, slot]);

  return createPortal(
    <div
      ref={ringRef}
      hidden
      aria-hidden="true"
      data-wt-ring=""
      data-wt-ring-color={color}
      data-wt-style={slot}
      className="absolute z-9998 rounded-[6px] border-2 pointer-events-none [animation:pulse_1.5s_infinite]"
    />,
    document.body,
  );
}
