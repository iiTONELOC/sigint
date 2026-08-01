import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  WalkthroughClickMode,
  WalkthroughPhase,
  WalkthroughPlacement,
  WalkthroughRingColor,
  WalkthroughStepId,
  WalkthroughStepMode,
  type WalkthroughStep,
} from "../model";
import { useWalkthroughTooltip } from "../hooks";
import {
  removeWalkthroughStyleRule,
  setWalkthroughStyleRule,
  walkthroughCutoutRect,
  WalkthroughRadius,
  WalkthroughStyleSlot,
  type WalkthroughRect,
} from "../utils";
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
  totalSteps: number;
}>;

enum WalkthroughSvgId {
  Mask = "walkthrough-mask",
}

type WalkthroughHighlight = Readonly<{
  color: WalkthroughRingColor;
  selector: string;
  slot: WalkthroughStyleSlot;
}>;

function highlights(step: WalkthroughStep): readonly WalkthroughHighlight[] {
  return [
    step.buttonSelector && {
      color: step.buttonColor ?? WalkthroughRingColor.Accent,
      selector: step.buttonSelector,
      slot: WalkthroughStyleSlot.HighlightPrimary,
    },
    step.highlightSelector && {
      color: step.highlightColor ?? WalkthroughRingColor.Warning,
      selector: step.highlightSelector,
      slot: WalkthroughStyleSlot.HighlightSecondary,
    },
    step.tertiarySelector && {
      color: step.buttonColor ?? WalkthroughRingColor.Warning,
      selector: step.tertiarySelector,
      slot: WalkthroughStyleSlot.HighlightTertiary,
    },
    step.quaternarySelector && {
      color: WalkthroughRingColor.Magenta,
      selector: step.quaternarySelector,
      slot: WalkthroughStyleSlot.HighlightQuaternary,
    },
  ].filter((value): value is WalkthroughHighlight => Boolean(value));
}

function WalkthroughHighlights({ step }: Readonly<{ step: WalkthroughStep }>) {
  return highlights(step).map((highlight) => (
    <HighlightRing key={highlight.slot} {...highlight} />
  ));
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
              className="fill-black"
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
        className="absolute border-2 border-sig-accent/60 rounded-lg pointer-events-none shadow-[0_0_0_4px_rgba(0,212,240,0.12),0_0_20px_rgba(0,212,240,0.08)]"
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
  totalSteps,
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
          className="fixed inset-0 z-9999 pointer-events-none overscroll-contain"
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
            tooltipRef={tooltip.tooltipRef}
            totalSteps={totalSteps}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
