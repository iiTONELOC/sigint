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

enum WalkthroughCompletionCount {
  Required = 1,
  SplitLayout = 3,
}

export const ESSENTIAL_STEPS: readonly WalkthroughStep[] = [
  welcomeStep(WalkthroughPlacement.Bottom),
  layersStep(WalkthroughPlacement.Bottom, false),
  {
    id: WalkthroughStepId.GlobeSelect,
    targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
    title: "Select a Target",
    description:
      "Click any point on the globe to select it. A detail panel will appear.",
    placement: WalkthroughPlacement.Right,
    mode: WalkthroughStepMode.Action,
    completionCheck: (_types, _count, _presets, selectedId) =>
      selectedId !== null,
    buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
  },
  {
    id: WalkthroughStepId.GlobeDragDetail,
    targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
    title: "Move the Detail Panel",
    description:
      "Grab the drag handle at the top of the detail panel and drag it out of the way.",
    placement: WalkthroughPlacement.Right,
    mode: WalkthroughStepMode.Information,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.DetailDragHandle,
    ),
  },
  {
    id: WalkthroughStepId.GlobeDeselect,
    targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
    title: "Deselect",
    description:
      "Click empty space outside the globe to deselect. The detail panel will close.",
    placement: WalkthroughPlacement.Right,
    mode: WalkthroughStepMode.Action,
    completionCheck: (_types, _count, _presets, selectedId) =>
      selectedId === null,
  },
  {
    id: WalkthroughStepId.FocusEnter,
    targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
    title: "Enter Focus Mode",
    description:
      "Click empty space outside the globe to hide all chrome and go fullscreen.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (
      _types,
      _count,
      _presets,
      _selectedId,
      chromeHidden,
    ) => chromeHidden,
  },
  {
    id: WalkthroughStepId.FocusExit,
    targetSelector: WalkthroughSelector.None,
    title: "Exit Focus Mode",
    description:
      "Click empty space outside the globe to restore all controls. This mode is useful for presentations and briefings.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (
      _types,
      _count,
      _presets,
      _selectedId,
      chromeHidden,
    ) => !chromeHidden,
  },
  SEARCH_STEP,
  {
    id: WalkthroughStepId.SplitRight,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitRightButton,
    ),
    title: "Add a Pane: Split Right",
    description:
      'Click the highlighted "Split right" button, then select VIDEO FEED from the menu.',
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (types) => types.has(PaneType.VideoFeed),
    expectedPaneType: PaneType.VideoFeed,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitRightButton,
    ),
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitMenuVideoFeed,
    ),
  },
  {
    id: WalkthroughStepId.SplitDown,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitDownButton,
    ),
    title: "Add Another: Split Down",
    description:
      'Click the highlighted "Split down" button, then select ALERTS.',
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (types, count) =>
      types.has(PaneType.VideoFeed) &&
      types.has(PaneType.AlertLog) &&
      count >= WalkthroughCompletionCount.SplitLayout,
    expectedPaneType: PaneType.AlertLog,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitDownButton,
    ),
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SplitMenuAlertLog,
    ),
    highlightColor: WalkthroughRingColor.Danger,
  },
  {
    id: WalkthroughStepId.SavePreset,
    targetSelector: WalkthroughSelector.None,
    title: "Save Your Layout",
    description:
      "Click VIEWS, type a name, and click the save icon. Your layout is now a reusable preset.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (_types, _count, presetCount) =>
      presetCount >= WalkthroughCompletionCount.Required,
    buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.ViewsButton),
    highlightSelector: walkthroughTourSelector(
      WalkthroughTourTarget.PresetInput,
    ),
    tertiarySelector: walkthroughTourSelector(
      WalkthroughTourTarget.PresetSaveButton,
    ),
  },
  {
    id: WalkthroughStepId.SaveVideoPreset,
    targetSelector: WalkthroughSelector.None,
    title: "Save Video Channels",
    description:
      "Click the bookmark icon on the video pane, type a name, and save. Your channel selections are now a reusable preset.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Action,
    completionCheck: (
      _types,
      _count,
      _presetCount,
      _selectedId,
      _chromeHidden,
      videoPresetCount,
    ) => videoPresetCount >= WalkthroughCompletionCount.Required,
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
    id: WalkthroughStepId.Ticker,
    targetSelector: walkthroughTourSelector(WalkthroughTourTarget.Ticker),
    title: "Live Feed",
    description:
      "The scrolling ticker shows the latest activity from all sources. Click an item to select it and zoom on the globe.",
    placement: WalkthroughPlacement.Top,
    mode: WalkthroughStepMode.Information,
  },
];

export const ADVANCED_STEPS: readonly WalkthroughStep[] = [
  {
    id: WalkthroughStepId.AircraftFilter,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.AircraftFilter,
    ),
    title: "Aircraft Filters",
    description:
      "Filter by flight status, aircraft type, squawk code, and country of origin.",
    placement: WalkthroughPlacement.Bottom,
    mode: WalkthroughStepMode.Information,
  },
  {
    id: WalkthroughStepId.WatchMode,
    targetSelector: WalkthroughSelector.None,
    title: "Watch Mode",
    description:
      "Auto-tour through alerts and intel products. The globe cycles through high-priority events every 8 seconds. Try WATCH in the globe controls.",
    placement: WalkthroughPlacement.Center,
    mode: WalkthroughStepMode.Information,
    buttonSelector: walkthroughTourSelector(
      WalkthroughTourTarget.GlobeControls,
    ),
  },
  {
    id: WalkthroughStepId.GlobeControls,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.GlobeControls,
    ),
    title: "Globe Controls",
    description:
      "Toggle flat or globe projection. Enable auto-rotation. FLAT view shows a full equirectangular map.",
    placement: WalkthroughPlacement.Bottom,
    mode: WalkthroughStepMode.Information,
  },
  {
    id: WalkthroughStepId.Settings,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.SettingsButton,
    ),
    title: "Settings",
    description:
      "Manage the theme, layer colors, ticker speed, data transfer, and storage.",
    placement: WalkthroughPlacement.Left,
    mode: WalkthroughStepMode.Information,
  },
  {
    id: WalkthroughStepId.Complete,
    targetSelector: WalkthroughSelector.None,
    title: "You're Ready",
    description:
      "That is the full tour. Relaunch it from Settings, Walkthrough. Happy hunting.",
    placement: WalkthroughPlacement.Bottom,
    mode: WalkthroughStepMode.Information,
  },
];
