import { useCallback, useEffect, useRef, useState } from "react";
import { cacheSet } from "@/lib/cache";
import { useUI } from "@/context/UIContext";
import { useIsMobileLayout } from "@/layout-mode";
import { DomEvent, DomKey } from "@/runtime";
import { CacheKey } from "@shared/domain/cache";
import { TransitionPrompt } from "../components/TransitionPrompt";
import { WalkthroughStepOverlay } from "../components/WalkthroughStepOverlay";
import { useWalkthroughActionCompletion } from "../hooks/useWalkthroughActionCompletion";
import {
  ADVANCED_STEPS,
  ESSENTIAL_STEPS,
  MOBILE_ADVANCED_STEPS,
  MOBILE_ESSENTIAL_STEPS,
} from "../model/sharedSteps";
import { WalkthroughLaunchMode, WalkthroughPhase, WalkthroughStepId } from "../model/vocabulary";
import type { WalkthroughStep } from "../model/types";
import {
  requestWalkthroughReset,
  setWalkthroughStepId,
  useVideoPresetCount,
  useWalkthroughLeafCount,
  useWalkthroughLeafTypes,
  useWalkthroughPresetCount,
} from "../utils/signals";

type WalkthroughProps = Readonly<{
  onComplete: () => void;
  startMode?: WalkthroughLaunchMode;
}>;

function initialPhase(startMode: WalkthroughLaunchMode): WalkthroughPhase {
  return startMode === WalkthroughLaunchMode.Advanced
    ? WalkthroughPhase.Advanced
    : WalkthroughPhase.Essential;
}

function phaseSteps(
  phase: WalkthroughPhase,
  isMobile: boolean,
): readonly WalkthroughStep[] {
  if (phase === WalkthroughPhase.Advanced) {
    return isMobile ? MOBILE_ADVANCED_STEPS : ADVANCED_STEPS;
  }
  return isMobile ? MOBILE_ESSENTIAL_STEPS : ESSENTIAL_STEPS;
}

export function Walkthrough({
  onComplete,
  startMode = WalkthroughLaunchMode.Both,
}: WalkthroughProps) {
  const [phase, setPhase] = useState(() => initialPhase(startMode));
  const [stepIndex, setStepIndex] = useState(0);
  const resetRequestedRef = useRef(false);
  const leafTypes = useWalkthroughLeafTypes();
  const leafCount = useWalkthroughLeafCount();
  const presetCount = useWalkthroughPresetCount();
  const videoPresetCount = useVideoPresetCount();
  const { chromeHidden, selectedCurrent, setSelected } = useUI();
  const isMobile = useIsMobileLayout();
  const steps = phaseSteps(phase, isMobile);
  const step = steps[stepIndex];
  const lastStep = stepIndex === steps.length - 1;
  const selectedId = selectedCurrent?.id ?? null;

  useEffect(() => {
    setWalkthroughStepId(step?.id ?? null);
  }, [step]);

  useEffect(() => {
    if (resetRequestedRef.current) return;
    resetRequestedRef.current = true;
    requestWalkthroughReset();
  }, []);

  const advanceAction = useCallback(() => {
    setStepIndex((current) => current + 1);
  }, []);

  useWalkthroughActionCompletion({
    chromeHidden,
    leafCount,
    leafTypes,
    onComplete: advanceAction,
    presetCount,
    selectedId,
    step,
    videoPresetCount,
  });

  const markComplete = useCallback(() => {
    cacheSet(CacheKey.WalkthroughComplete, true);
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (phase === WalkthroughPhase.Essential && lastStep) {
      if (startMode !== WalkthroughLaunchMode.Both || isMobile) {
        markComplete();
      } else {
        setPhase(WalkthroughPhase.Transition);
      }
      return;
    }
    if (phase === WalkthroughPhase.Advanced && lastStep) {
      markComplete();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [isMobile, lastStep, markComplete, phase, startMode]);

  const handleBack = useCallback(() => {
    if (stepIndex <= 0) return;
    const previousStep = steps[stepIndex - 1];
    if (previousStep?.id === WalkthroughStepId.GlobeSelect) {
      setSelected(null);
    }
    setStepIndex((current) => current - 1);
  }, [setSelected, stepIndex, steps]);

  const handleAcceptAdvanced = useCallback(() => {
    setPhase(WalkthroughPhase.Advanced);
    setStepIndex(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === DomKey.Escape) onComplete();
    };
    document.addEventListener(DomEvent.KeyDown, handleKeyDown);
    return () => document.removeEventListener(DomEvent.KeyDown, handleKeyDown);
  }, [onComplete]);

  if (phase === WalkthroughPhase.Transition) {
    return (
      <TransitionPrompt
        onAccept={handleAcceptAdvanced}
        onDecline={markComplete}
      />
    );
  }
  if (!step) return null;

  return (
    <WalkthroughStepOverlay
      chromeHidden={chromeHidden}
      isMobile={isMobile}
      onBack={handleBack}
      onDismiss={markComplete}
      onLandingDrop={advanceAction}
      onNext={handleNext}
      onSkip={onComplete}
      phase={phase}
      selectedId={selectedId}
      step={step}
      stepIndex={stepIndex}
      steps={steps}
    />
  );
}
