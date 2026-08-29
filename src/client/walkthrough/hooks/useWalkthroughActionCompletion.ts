import { useEffect, useRef } from "react";
import { PaneType, type PaneTypeValue } from "@/panes/workspace";
import { WalkthroughStepId, WalkthroughStepMode } from "../model/vocabulary";
import type { WalkthroughStep } from "../model/types";
import { requestWalkthroughUndo } from "../utils/signals";

type UseWalkthroughActionCompletionOptions = Readonly<{
  chromeHidden: boolean;
  leafCount: number;
  leafTypes: ReadonlySet<PaneTypeValue>;
  onComplete: () => void;
  presetCount: number;
  selectedId: string | null;
  step?: WalkthroughStep;
  videoPresetCount: number;
}>;

enum WalkthroughCompletionTiming {
  DelayMs = 600,
}

function effectiveCount(
  stepId: WalkthroughStepId,
  expectedStepId: WalkthroughStepId,
  current: number,
  baseline: number | null,
): number {
  return stepId === expectedStepId
    ? Math.max(0, current - (baseline ?? 0))
    : current;
}

export function useWalkthroughActionCompletion({
  chromeHidden,
  leafCount,
  leafTypes,
  onComplete,
  presetCount,
  selectedId,
  step,
  videoPresetCount,
}: UseWalkthroughActionCompletionOptions): void {
  const baselinePresetCountRef = useRef<number | null>(null);
  const baselineVideoPresetCountRef = useRef<number | null>(null);
  const previousLeafTypesRef = useRef<ReadonlySet<PaneTypeValue>>(
    new Set([PaneType.Globe]),
  );

  useEffect(() => {
    if (
      step?.mode !== WalkthroughStepMode.Action ||
      !step.completionCheck
    ) {
      return;
    }
    if (
      step.id === WalkthroughStepId.SavePreset &&
      baselinePresetCountRef.current === null
    ) {
      baselinePresetCountRef.current = presetCount;
    }
    if (
      step.id === WalkthroughStepId.SaveVideoPreset &&
      baselineVideoPresetCountRef.current === null
    ) {
      baselineVideoPresetCountRef.current = videoPresetCount;
    }

    const effectivePresetCount = effectiveCount(
      step.id,
      WalkthroughStepId.SavePreset,
      presetCount,
      baselinePresetCountRef.current,
    );
    const effectiveVideoPresetCount = effectiveCount(
      step.id,
      WalkthroughStepId.SaveVideoPreset,
      videoPresetCount,
      baselineVideoPresetCountRef.current,
    );
    if (
      !step.completionCheck(
        leafTypes,
        leafCount,
        effectivePresetCount,
        selectedId,
        chromeHidden,
        effectiveVideoPresetCount,
      )
    ) {
      return;
    }

    const timer = setTimeout(() => {
      if (step.id === WalkthroughStepId.SavePreset) {
        baselinePresetCountRef.current = null;
      }
      if (step.id === WalkthroughStepId.SaveVideoPreset) {
        baselineVideoPresetCountRef.current = null;
      }
      previousLeafTypesRef.current = leafTypes;
      onComplete();
    }, WalkthroughCompletionTiming.DelayMs);
    return () => clearTimeout(timer);
  }, [
    chromeHidden,
    leafCount,
    leafTypes,
    onComplete,
    presetCount,
    selectedId,
    step,
    videoPresetCount,
  ]);

  useEffect(() => {
    if (
      step?.mode !== WalkthroughStepMode.Action ||
      !step.expectedPaneType
    ) {
      previousLeafTypesRef.current = leafTypes;
      return;
    }

    const addedTypes = [...leafTypes].filter(
      (paneType) => !previousLeafTypesRef.current.has(paneType),
    );
    for (const paneType of addedTypes) {
      if (
        paneType !== step.expectedPaneType &&
        paneType !== PaneType.Globe
      ) {
        requestWalkthroughUndo(paneType);
      }
    }
    previousLeafTypesRef.current = leafTypes;
  }, [leafTypes, step]);
}
