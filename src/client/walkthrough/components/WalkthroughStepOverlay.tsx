import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  WalkthroughClickMode,
  WalkthroughPhase,
  WalkthroughPlacement,
  WalkthroughRingColor,
  WalkthroughStepId,
  WalkthroughStepMode,
} from "../model/vocabulary";
import type { WalkthroughStep } from "../model/types";
import { useWalkthroughTooltip } from "../hooks/useWalkthroughTooltip";
import {
  removeWalkthroughStyleRule,
  setWalkthroughStyleRule,
  WalkthroughStyleSlot,
} from "../utils/stylesheet";
import { walkthroughCutoutRect, WalkthroughRadius, type WalkthroughRect } from "../utils/geometry";
import { ClickIndicator } from "./ClickIndicator";
import { HighlightRing } from "./HighlightRing";
import { LandingZone } from "./LandingZone";
import { WalkthroughTooltip } from "./WalkthroughTooltip";

type WalkthroughStepOverlayProps = Readonly<{
  chromeHidden: boolean;
  isMobile: boolean;
  onBack: () => void;
  onDismiss: () => void;
  onLandingDrop: () => void;
  onNext: () => void;
  onSkip: () => void;
  phase: WalkthroughPhase;
  selectedId: string | null;
  step: WalkthroughStep;
  stepIndex: number;
  steps: readonly WalkthroughStep[];
}>;

enum WalkthroughSvgId {
  Mask = "walkthrough-mask",
}

type WalkthroughHighlight = Readonly<{
  color: WalkthroughRingColor;
  selector: string;
}>;

type WalkthroughHighlightCatalog = Partial<
  Record<WalkthroughStyleSlot, WalkthroughHighlight | undefined>
>;

function highlight(
  selector: string | undefined,
  color: WalkthroughRingColor,
): WalkthroughHighlight | undefined {
  return selector ? { color, selector } : undefined;
}

function highlights(step: WalkthroughStep): WalkthroughHighlightCatalog {
  return {
    [WalkthroughStyleSlot.HighlightPrimary]: highlight(
      step.buttonSelector,
      step.buttonColor ?? WalkthroughRingColor.Accent,
    ),
    [WalkthroughStyleSlot.HighlightSecondary]: highlight(
      step.highlightSelector,
      step.highlightColor ?? WalkthroughRingColor.Warning,
    ),
    [WalkthroughStyleSlot.HighlightTertiary]: highlight(
      step.tertiarySelector,
      step.buttonColor ?? WalkthroughRingColor.Warning,
    ),
    [WalkthroughStyleSlot.HighlightQuaternary]: highlight(
      step.quaternarySelector,
      WalkthroughRingColor.Magenta,
    ),
  };
}

function WalkthroughHighlights({ step }: Readonly<{ step: WalkthroughStep }>) {
  const catalog = highlights(step);
  return Object.values(WalkthroughStyleSlot).map((slot) => {
    const highlight = catalog[slot];
    return highlight ? (
      <HighlightRing key={slot} slot={slot} {...highlight} />
    ) : null;
  });
}

function WalkthroughCutout({
  targetRect,
}: Readonly<{ targetRect: WalkthroughRect }>) {
  const cutout = walkthroughCutoutRect(targetRect);
  useEffect(() => {
    setWalkthroughStyleRule(WalkthroughStyleSlot.Cutout, cutout);
    setWalkthroughStyleRule(WalkthroughStyleSlot.MaskCutout, cutout);
    return () => {
      removeWalkthroughStyleRule(WalkthroughStyleSlot.Cutout);
      removeWalkthroughStyleRule(WalkthroughStyleSlot.MaskCutout);
    };
  }, [cutout]);

  return (
    <>
      <svg
        aria-hidden={true}
        data-wt-backdrop=""
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <mask id={WalkthroughSvgId.Mask}>
            <rect className="w-full h-full fill-white" />
            <rect
              data-wt-style={WalkthroughStyleSlot.MaskCutout}
              rx={WalkthroughRadius.Cutout}
              className="walkthrough-mask-cutout fill-black"
            />
          </mask>
        </defs>
        <rect
          className="w-full h-full fill-black/72"
          mask={`url(#${WalkthroughSvgId.Mask})`}
        />
      </svg>
      <div
        aria-hidden={true}
        data-wt-style={WalkthroughStyleSlot.Cutout}
        className="walkthrough-cutout absolute border-2 border-sig-accent/60 rounded-lg pointer-events-none"
      />
    </>
  );
}

function clickIndicatorMode(stepId: WalkthroughStepId): WalkthroughClickMode {
  if (stepId === WalkthroughStepId.GlobeSelect) {
    return WalkthroughClickMode.Select;
  }
  if (
    stepId === WalkthroughStepId.FocusEnter ||
    stepId === WalkthroughStepId.FocusExit
  ) {
    return WalkthroughClickMode.Focus;
  }
  return WalkthroughClickMode.Deselect;
}

function shouldShowClickIndicator(
  stepId: WalkthroughStepId,
  selectedId: string | null,
  chromeHidden: boolean,
): boolean {
  return (
    (stepId === WalkthroughStepId.GlobeSelect && selectedId === null) ||
    (stepId === WalkthroughStepId.GlobeDeselect && selectedId !== null) ||
    (stepId === WalkthroughStepId.FocusEnter && !chromeHidden) ||
    (stepId === WalkthroughStepId.FocusExit && chromeHidden)
  );
}

export function WalkthroughStepOverlay({
  chromeHidden,
  isMobile,
  onBack,
  onDismiss,
  onLandingDrop,
  onNext,
  onSkip,
  phase,
  selectedId,
  step,
  stepIndex,
  steps,
}: WalkthroughStepOverlayProps) {
  const tooltip = useWalkthroughTooltip({ isMobile, step });
  const action = step.mode === WalkthroughStepMode.Action;
  const centered = step.placement === WalkthroughPlacement.Center;
  const showCutout = !action && !centered && tooltip.targetRect !== null;
  const showClickIndicator = shouldShowClickIndicator(
    step.id,
    selectedId,
    chromeHidden,
  );

  return (
    <>
      {showClickIndicator && (
        <ClickIndicator mode={clickIndicatorMode(step.id)} />
      )}
      {step.id === WalkthroughStepId.GlobeDragDetail && (
        <LandingZone onDrop={onLandingDrop} />
      )}
      <WalkthroughHighlights step={step} />
      {createPortal(
        <div
          data-wt-overlay=""
          className="fixed inset-0 z-(--layer-blocking) pointer-events-none overscroll-contain"
        >
          {showCutout && tooltip.targetRect && (
            <WalkthroughCutout targetRect={tooltip.targetRect} />
          )}
          <WalkthroughTooltip
            dragging={tooltip.dragging}
            isMobile={isMobile}
            onBack={onBack}
            onDismiss={onDismiss}
            onNext={onNext}
            onPointerDown={tooltip.onPointerDown}
            onSkip={onSkip}
            phase={phase}
            ready={tooltip.ready}
            step={step}
            stepIndex={stepIndex}
            steps={steps}
            tooltipRef={tooltip.tooltipRef}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
