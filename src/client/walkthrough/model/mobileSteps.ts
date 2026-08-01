import { PaneType } from "@/panes/workspace";
import { layersStep, SEARCH_STEP, welcomeStep } from "./sharedSteps";
import type { WalkthroughStep } from "./types";
import {
  WalkthroughPlacement,
  WalkthroughRingColor,
  WalkthroughSelector,
  WalkthroughStepId,
  WalkthroughStepMode,
  WalkthroughTourTarget,
  walkthroughTourSelector,
} from "./vocabulary";

enum MobileWalkthroughCompletionCount {
  Required = 1,
}

export const MOBILE_ESSENTIAL_STEPS: readonly WalkthroughStep[] = [
  welcomeStep(WalkthroughPlacement.Center),
  layersStep(WalkthroughPlacement.Center, true),
  {
    id: WalkthroughStepId.GlobeSelect,
    targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
    title: "Select a Target",
    description:
      "Tap any point on the globe to select it. A detail panel will slide up from the bottom.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (_types, _count, _presets, selectedId) =>
      selectedId !== null,
  },
  {
    id: WalkthroughStepId.MobileDetailSheet,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.DetailClose,
    ),
    title: "Detail Panel",
    description:
      "The detail panel shows information about the selected point. Swipe it up to expand or down to shrink. Tap the close button now.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (_types, _count, _presets, selectedId) =>
      selectedId === null,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.DetailClose,
    ),
    buttonColor: WalkthroughRingColor.Danger,
  },
  SEARCH_STEP,
  {
    id: WalkthroughStepId.SplitDown,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitDownButton,
    ),
    title: "Add VIDEO FEED",
    description:
      "Tap the split-down button in the globe pane header, then select VIDEO FEED from the menu.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (types) => types.has(PaneType.VideoFeed),
    expectedPaneType: PaneType.VideoFeed,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitDownButton,
    ),
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitMenuVideoFeed,
    ),
    highlightColor: WalkthroughRingColor.Warning,
  },
  {
    id: WalkthroughStepId.SaveVideoPreset,
    targetSelector: WalkthroughSelector.None,
    title: "Save Video Channels",
    description:
      "Tap the bookmark icon on the video pane, type a name, and save. Your channel selections are now a reusable preset.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (
      _types,
      _count,
      _presetCount,
      _selectedId,
      _chromeHidden,
      videoPresetCount,
    ) => videoPresetCount >= MobileWalkthroughCompletionCount.Required,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.VideoPresetButton,
    ),
    buttonColor: WalkthroughRingColor.Magenta,
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.VideoPresetInput,
    ),
    highlightColor: WalkthroughRingColor.Magenta,
    tertiarySelector: walkthroughTourSelector(
      WalkthroughTourTarget.VideoPresetSaveButton,
    ),
  },
  {
    id: WalkthroughStepId.SplitDownAlerts,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitDownVideoFeed,
    ),
    title: "Add ALERTS",
    description:
      "Tap the split-down button on the VIDEO FEED pane header, then select ALERTS from the menu.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (types) => types.has(PaneType.AlertLog),
    expectedPaneType: PaneType.AlertLog,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitDownVideoFeed,
    ),
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitMenuAlertLog,
    ),
    highlightColor: WalkthroughRingColor.Danger,
  },
  {
    id: WalkthroughStepId.SplitRightAlerts,
    targetSelector: WalkthroughSelector.None,
    title: "Add INTEL FEED",
    description:
      "Tap the split-right button in the ALERTS pane header, then select INTEL FEED from the menu.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (types) => types.has(PaneType.IntelFeed),
    expectedPaneType: PaneType.IntelFeed,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitRightAlertLog,
    ),
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitMenuIntelFeed,
    ),
  },
  {
    id: WalkthroughStepId.SavePreset,
    targetSelector: WalkthroughSelector.None,
    title: "Save Your Layout",
    description:
      "Tap VIEWS, type a name, and tap the save icon. Your layout is now a reusable preset.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (_types, _count, presetCount) =>
      presetCount >= MobileWalkthroughCompletionCount.Required,
    buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.ViewsButton),
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.PresetInput,
    ),
    tertiarySelector: walkthroughTourSelector(
      WalkthroughTourTarget.PresetSaveButton,
    ),
  },
  {
    id: WalkthroughStepId.MobileComplete,
    targetSelector: WalkthroughSelector.None,
    title: "You're All Set",
    description:
      "You built a layout with live video, alerts, and intel. Explore the globe, track targets, and customize your workspace. Restart the tour from Settings.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Information,
  },
];

export const MOBILE_ADVANCED_STEPS: readonly WalkthroughStep[] = [];
