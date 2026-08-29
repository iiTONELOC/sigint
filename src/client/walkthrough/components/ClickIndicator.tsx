import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DomEvent } from "@/runtime";
import { WalkthroughClickMode } from "../model/vocabulary";
import { clickIndicatorPoint } from "../utils/clickIndicator";
import {
  removeWalkthroughStyleRule,
  setWalkthroughStyleRule,
  WalkthroughStyleSlot,
} from "../utils/stylesheet";

type ClickIndicatorProps = Readonly<{
  mode: WalkthroughClickMode;
}>;

enum ClickIndicatorLabel {
  EmptySpace = "CLICK EMPTY SPACE",
  Point = "CLICK A POINT",
}

export function ClickIndicator({ mode }: ClickIndicatorProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const recalculate = () => {
      const point = clickIndicatorPoint(mode);
      if (!point) {
        setReady(false);
        return;
      }
      setWalkthroughStyleRule(WalkthroughStyleSlot.Indicator, {
        top: point.y,
        left: point.x,
      });
      setReady(true);
    };

    recalculate();
    window.addEventListener(DomEvent.Resize, recalculate);
    return () => {
      window.removeEventListener(DomEvent.Resize, recalculate);
      removeWalkthroughStyleRule(WalkthroughStyleSlot.Indicator);
    };
  }, [mode]);

  const label =
    mode === WalkthroughClickMode.Select
      ? ClickIndicatorLabel.Point
      : ClickIndicatorLabel.EmptySpace;

  return createPortal(
    <div
      hidden={!ready}
      aria-hidden="true"
      data-wt-indicator=""
      data-wt-click-mode={mode}
      data-wt-style={WalkthroughStyleSlot.Indicator}
      className="walkthrough-indicator fixed z-(--layer-guidance) pointer-events-none -translate-x-1/2 -translate-y-1/2"
    >
      <div className="walkthrough-indicator-ring absolute rounded-full top-1/2 left-1/2 w-20 h-20 -mt-10 -ml-10 border-2 animate-walkthrough-ring" />
      <div className="walkthrough-indicator-ring absolute rounded-full top-1/2 left-1/2 w-20 h-20 -mt-10 -ml-10 border-2 animate-walkthrough-ring-delayed" />
      <div className="walkthrough-indicator-dot absolute rounded-full top-1/2 left-1/2 size-3.5 -mt-1.75 -ml-1.75 animate-walkthrough-pulse" />
      <div className="walkthrough-indicator-label absolute text-(length:--sig-text-md) tracking-widest font-bold whitespace-nowrap top-1/2 left-1/2 -translate-x-1/2 translate-y-7.5">
        {label}
      </div>
    </div>,
    document.body,
  );
}
