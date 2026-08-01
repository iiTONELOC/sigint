import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DomEvent } from "@/runtime";
import {
  WalkthroughTourTarget,
  walkthroughTourSelector,
} from "../model";
import type { WalkthroughRect } from "../utils/geometry";
import {
  removeWalkthroughStyleRule,
  setWalkthroughStyleRule,
  WalkthroughStyleSlot,
} from "../utils/stylesheet";

type LandingZoneProps = Readonly<{
  onDrop: () => void;
}>;

enum LandingZoneOffset {
  Left = 12,
  Top = 40,
}

enum LandingZoneRatio {
  Width = 0.28,
  Height = 0.55,
}

enum LandingZoneTiming {
  PositionCheckDelayMs = 50,
  CompletionDelayMs = 600,
}

enum LandingZoneDivisor {
  Half = 2,
}

function landingZoneRect(): WalkthroughRect | null {
  const canvas = document.querySelector(
    `${walkthroughTourSelector(WalkthroughTourTarget.GlobePane)} canvas`,
  );
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    top: rect.top + LandingZoneOffset.Top,
    left: rect.left + LandingZoneOffset.Left,
    width: rect.width * LandingZoneRatio.Width,
    height: rect.height * LandingZoneRatio.Height,
  };
}

export function LandingZone({ onDrop }: LandingZoneProps) {
  const [rect, setRect] = useState<WalkthroughRect | null>(null);
  const [dropped, setDropped] = useState(false);

  useEffect(() => {
    const recalculate = () => {
      const next = landingZoneRect();
      setRect(next);
      if (next) {
        setWalkthroughStyleRule(WalkthroughStyleSlot.LandingZone, next);
      }
    };
    recalculate();
    window.addEventListener(DomEvent.Resize, recalculate);
    return () => {
      window.removeEventListener(DomEvent.Resize, recalculate);
      removeWalkthroughStyleRule(WalkthroughStyleSlot.LandingZone);
    };
  }, []);

  useEffect(() => {
    if (dropped || !rect) return;
    let dragging = false;
    const handlePointerDown = () => {
      dragging = true;
    };
    const handlePointerUp = () => {
      if (!dragging) return;
      dragging = false;
      setTimeout(() => {
        const handle = document.querySelector(
          walkthroughTourSelector(WalkthroughTourTarget.DetailDragHandle),
        );
        if (!handle) return;
        const handleRect = handle.getBoundingClientRect();
        const centerX =
          handleRect.left + handleRect.width / LandingZoneDivisor.Half;
        if (centerX >= rect.left && centerX <= rect.left + rect.width) {
          setDropped(true);
          setTimeout(onDrop, LandingZoneTiming.CompletionDelayMs);
        }
      }, LandingZoneTiming.PositionCheckDelayMs);
    };

    document.addEventListener(DomEvent.PointerDown, handlePointerDown);
    document.addEventListener(DomEvent.PointerUp, handlePointerUp);
    return () => {
      document.removeEventListener(DomEvent.PointerDown, handlePointerDown);
      document.removeEventListener(DomEvent.PointerUp, handlePointerUp);
    };
  }, [rect, dropped, onDrop]);

  if (!rect || dropped) return null;
  return createPortal(
    <div
      aria-hidden="true"
      data-wt-style={WalkthroughStyleSlot.LandingZone}
      className="fixed z-9996 pointer-events-none border-2 border-dashed border-sig-accent/30 rounded-lg bg-sig-accent/[0.03] flex items-center justify-center animate-pulse"
    >
      <span className="text-[10px] tracking-widest font-bold text-sig-accent/50">
        DROP HERE
      </span>
    </div>,
    document.body,
  );
}
