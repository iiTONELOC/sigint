import { describe, expect, test } from "bun:test";
import { PaneType } from "@/panes/workspace";
import {
  ADVANCED_STEPS,
  ESSENTIAL_STEPS,
  MOBILE_ADVANCED_STEPS,
  MOBILE_ESSENTIAL_STEPS,
  WalkthroughPlacement,
  WalkthroughRingColor,
  WalkthroughSelector,
  WalkthroughStepId,
  WalkthroughStepMode,
  WalkthroughTourTarget,
  walkthroughTourSelector,
  type WalkthroughStep,
} from "@/walkthrough";

enum WalkthroughCatalogSize {
  Advanced = 5,
  Essential = 13,
  MobileAdvanced = 0,
  MobileEssential = 11,
}

function requiredStep(
  steps: readonly WalkthroughStep[],
  id: WalkthroughStepId,
): WalkthroughStep {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Missing walkthrough step: ${id}`);
  return step;
}

function expectValidCatalog(steps: readonly WalkthroughStep[]): void {
  const placements = Object.values(WalkthroughPlacement);
  const modes = Object.values(WalkthroughStepMode);
  for (const step of steps) {
    expect(step.title.length).toBeGreaterThan(0);
    expect(step.description.length).toBeGreaterThan(0);
    expect(placements).toContain(step.placement);
    expect(modes).toContain(step.mode);
    if (step.mode === WalkthroughStepMode.Action) {
      expect(step.completionCheck).toBeFunction();
    }
  }
  const ids = steps.map((step) => step.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe("walkthrough step catalogs", () => {
  test("have the expected sizes and valid entries", () => {
    expect(ESSENTIAL_STEPS).toHaveLength(WalkthroughCatalogSize.Essential);
    expect(ADVANCED_STEPS).toHaveLength(WalkthroughCatalogSize.Advanced);
    expect(MOBILE_ESSENTIAL_STEPS).toHaveLength(
      WalkthroughCatalogSize.MobileEssential,
    );
    expect(MOBILE_ADVANCED_STEPS).toHaveLength(
      WalkthroughCatalogSize.MobileAdvanced,
    );
    expectValidCatalog(ESSENTIAL_STEPS);
    expectValidCatalog(ADVANCED_STEPS);
    expectValidCatalog(MOBILE_ESSENTIAL_STEPS);
  });

  test("start and finish with the intended information steps", () => {
    expect(ESSENTIAL_STEPS.at(0)?.id).toBe(WalkthroughStepId.Welcome);
    expect(ESSENTIAL_STEPS.at(-1)?.id).toBe(WalkthroughStepId.Ticker);
    expect(ADVANCED_STEPS.at(-1)?.id).toBe(WalkthroughStepId.Complete);
    expect(ADVANCED_STEPS.at(-1)?.targetSelector).toBe(
      WalkthroughSelector.None,
    );
    expect(
      ADVANCED_STEPS.every(
        (step) => step.mode === WalkthroughStepMode.Information,
      ),
    ).toBe(true);
  });

  test("keep the globe and focus actions in order", () => {
    const ids = ESSENTIAL_STEPS.map((step) => step.id);
    const selectIndex = ids.indexOf(WalkthroughStepId.GlobeSelect);
    const dragIndex = ids.indexOf(WalkthroughStepId.GlobeDragDetail);
    const deselectIndex = ids.indexOf(WalkthroughStepId.GlobeDeselect);
    const focusIndex = ids.indexOf(WalkthroughStepId.FocusEnter);
    expect(dragIndex).toBe(selectIndex + 1);
    expect(deselectIndex).toBe(dragIndex + 1);
    expect(focusIndex).toBe(deselectIndex + 1);
    expect(ids.at(focusIndex + 1)).toBe(WalkthroughStepId.FocusExit);
  });
});

describe("walkthrough completion checks", () => {
  test("track selection and focus state", () => {
    const select = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.GlobeSelect);
    const deselect = requiredStep(
      ESSENTIAL_STEPS,
      WalkthroughStepId.GlobeDeselect,
    );
    const focus = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.FocusEnter);
    const exit = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.FocusExit);
    expect(select.completionCheck?.(new Set(), 1, 0, null, false, 0)).toBe(
      false,
    );
    expect(select.completionCheck?.(new Set(), 1, 0, "Aabc123", false, 0)).toBe(
      true,
    );
    expect(deselect.completionCheck?.(new Set(), 1, 0, null, false, 0)).toBe(
      true,
    );
    expect(focus.completionCheck?.(new Set(), 1, 0, null, true, 0)).toBe(true);
    expect(exit.completionCheck?.(new Set(), 1, 0, null, false, 0)).toBe(true);
  });

  test("track the required pane layout", () => {
    const splitRight = requiredStep(
      ESSENTIAL_STEPS,
      WalkthroughStepId.SplitRight,
    );
    const splitDown = requiredStep(
      ESSENTIAL_STEPS,
      WalkthroughStepId.SplitDown,
    );
    expect(
      splitRight.completionCheck?.(
        new Set([PaneType.Globe, PaneType.VideoFeed]),
        2,
        0,
        null,
        false,
        0,
      ),
    ).toBe(true);
    expect(
      splitDown.completionCheck?.(
        new Set([PaneType.Globe, PaneType.VideoFeed, PaneType.AlertLog]),
        3,
        0,
        null,
        false,
        0,
      ),
    ).toBe(true);
  });

  test("track saved layout and video presets independently", () => {
    const layout = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.SavePreset);
    const video = requiredStep(
      ESSENTIAL_STEPS,
      WalkthroughStepId.SaveVideoPreset,
    );
    expect(layout.completionCheck?.(new Set(), 1, 1, null, false, 0)).toBe(true);
    expect(video.completionCheck?.(new Set(), 1, 0, null, false, 1)).toBe(true);
    expect(video.completionCheck?.(new Set(), 1, 1, null, false, 0)).toBe(false);
  });
});

describe("walkthrough targets", () => {
  test("derive selectors from the target enum", () => {
    const search = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.Search);
    const save = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.SavePreset);
    const video = requiredStep(
      ESSENTIAL_STEPS,
      WalkthroughStepId.SaveVideoPreset,
    );
    expect(search.targetSelector).toBe(WalkthroughSelector.None);
    expect(search.buttonSelector).toBe(
      walkthroughTourSelector(WalkthroughTourTarget.Search),
    );
    expect(save.highlightSelector).toBe(
      walkthroughTourSelector(WalkthroughTourTarget.PresetInput),
    );
    expect(video.tertiarySelector).toBe(
      walkthroughTourSelector(WalkthroughTourTarget.VideoPresetSaveButton),
    );
  });

  test("assign the expected pane and ring identities", () => {
    const split = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.SplitRight);
    const alert = requiredStep(ESSENTIAL_STEPS, WalkthroughStepId.SplitDown);
    const video = requiredStep(
      ESSENTIAL_STEPS,
      WalkthroughStepId.SaveVideoPreset,
    );
    expect(split.expectedPaneType).toBe(PaneType.VideoFeed);
    expect(alert.highlightColor).toBe(WalkthroughRingColor.Danger);
    expect(video.buttonColor).toBe(WalkthroughRingColor.Magenta);
    expect(video.highlightColor).toBe(WalkthroughRingColor.Magenta);
  });

  test("keep the advanced relaunch guidance in Settings", () => {
    const complete = requiredStep(ADVANCED_STEPS, WalkthroughStepId.Complete);
    expect(complete.description).toContain("Settings");
    expect(complete.description).toContain("Walkthrough");
    expect(complete.description).not.toContain("About");
  });
});
