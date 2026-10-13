import { Placement } from "@/layout-mode/model/layoutMode";
import { PaneType } from "@/panes/workspace";
import type {
  WalkthroughCompletionCheck,
  WalkthroughStep,
} from "./types";
import {
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

type WalkthroughStepFields = Omit<WalkthroughStep, "id">;

type WalkthroughStepDefinition = Readonly<{
  desktopAdvancedOrder?: number;
  desktopEssentialOrder?: number;
  desktopOverrides?: Partial<WalkthroughStepFields>;
  mobileAdvancedOrder?: number;
  mobileEssentialOrder?: number;
  mobileOverrides?: Partial<WalkthroughStepFields>;
  step: WalkthroughStepFields;
}>;

type WalkthroughStepOrder = (
  definition: WalkthroughStepDefinition,
) => number | undefined;

type WalkthroughStepOverrides = (
  definition: WalkthroughStepDefinition,
) => Partial<WalkthroughStepFields> | undefined;

type OrderedWalkthroughStep = Readonly<{
  order: number;
  step: WalkthroughStep;
}>;

const selectionCleared: WalkthroughCompletionCheck = (
  _types,
  _count,
  _presets,
  selectedId,
) => selectedId === null;

const WALKTHROUGH_STEP_CATALOG: Readonly<
  Record<WalkthroughStepId, WalkthroughStepDefinition>
> = {
  [WalkthroughStepId.AircraftFilter]: {
    desktopAdvancedOrder: 0,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.AircraftFilter),
      title: "Aircraft Filters",
      description:
        "Filter by flight status, aircraft type, squawk code, and country of origin.",
      placement: Placement.Bottom,
      mode: WalkthroughStepMode.Information,
    },
  },
  [WalkthroughStepId.Complete]: {
    desktopAdvancedOrder: 4,
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "You're Ready",
      description:
        "That is the full tour. Relaunch it from Settings, Walkthrough. Happy hunting.",
      placement: Placement.Bottom,
      mode: WalkthroughStepMode.Information,
    },
  },
  [WalkthroughStepId.FocusEnter]: {
    desktopEssentialOrder: 5,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
      title: "Enter Focus Mode",
      description:
        "Click empty space outside the globe to hide all chrome and go fullscreen.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (
        _types,
        _count,
        _presets,
        _selectedId,
        chromeHidden,
      ) => chromeHidden,
    },
  },
  [WalkthroughStepId.FocusExit]: {
    desktopEssentialOrder: 6,
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "Exit Focus Mode",
      description:
        "Click empty space outside the globe to restore all controls. This mode is useful for presentations and briefings.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (
        _types,
        _count,
        _presets,
        _selectedId,
        chromeHidden,
      ) => !chromeHidden,
    },
  },
  [WalkthroughStepId.GlobeControls]: {
    desktopAdvancedOrder: 2,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobeControls),
      title: "Globe Controls",
      description:
        "Toggle flat or globe projection. Enable auto-rotation. FLAT view shows a full equirectangular map.",
      placement: Placement.Bottom,
      mode: WalkthroughStepMode.Information,
    },
  },
  [WalkthroughStepId.GlobeDeselect]: {
    desktopEssentialOrder: 4,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
      title: "Deselect",
      description:
        "Click empty space outside the globe to deselect. The detail panel will close.",
      placement: Placement.Right,
      mode: WalkthroughStepMode.Action,
      completionCheck: selectionCleared,
    },
  },
  [WalkthroughStepId.GlobeDragDetail]: {
    desktopEssentialOrder: 3,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
      title: "Move the Detail Panel",
      description:
        "Grab the drag handle at the top of the detail panel and drag it out of the way.",
      placement: Placement.Right,
      mode: WalkthroughStepMode.Information,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.DetailDragHandle),
    },
  },
  [WalkthroughStepId.GlobeSelect]: {
    desktopEssentialOrder: 2,
    desktopOverrides: {
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
    },
    mobileEssentialOrder: 2,
    mobileOverrides: {
      description:
        "Tap any point on the globe to select it. A detail panel will slide up from the bottom.",
      placement: Placement.Center,
    },
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobePane),
      title: "Select a Target",
      description:
        "Click any point on the globe to select it. A detail panel will appear.",
      placement: Placement.Right,
      mode: WalkthroughStepMode.Action,
      completionCheck: (_types, _count, _presets, selectedId) =>
        selectedId !== null,
    },
  },
  [WalkthroughStepId.Layers]: {
    desktopEssentialOrder: 1,
    mobileEssentialOrder: 1,
    mobileOverrides: {
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.LayerToggles),
      placement: Placement.Center,
    },
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.LayerToggles),
      title: "Data Layers",
      description:
        "Toggle layers on and off: aircraft, vessels, seismic, fires, weather, and GDELT events. Each layer is color-coded.",
      placement: Placement.Bottom,
      mode: WalkthroughStepMode.Information,
    },
  },
  [WalkthroughStepId.MobileComplete]: {
    mobileEssentialOrder: 10,
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "You're All Set",
      description:
        "You built a layout with live video, alerts, and intel. Explore the globe, track targets, and customize your workspace. Restart the tour from Settings.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Information,
    },
  },
  [WalkthroughStepId.MobileDetailSheet]: {
    mobileEssentialOrder: 3,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.DetailClose),
      title: "Detail Panel",
      description:
        "The detail panel shows information about the selected point. Swipe it up to expand or down to shrink. Tap the close button now.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: selectionCleared,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.DetailClose),
      buttonColor: WalkthroughRingColor.Danger,
    },
  },
  [WalkthroughStepId.SavePreset]: {
    desktopEssentialOrder: 10,
    mobileEssentialOrder: 9,
    mobileOverrides: {
      description:
        "Tap VIEWS, type a name, and tap the save icon. Your layout is now a reusable preset.",
    },
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "Save Your Layout",
      description:
        "Click VIEWS, type a name, and click the save icon. Your layout is now a reusable preset.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (_types, _count, presetCount) =>
        presetCount >= WalkthroughCompletionCount.Required,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.ViewsButton),
      highlightSelector: walkthroughTourSelector(WalkthroughTourTarget.PresetInput),
      tertiarySelector: walkthroughTourSelector(WalkthroughTourTarget.PresetSaveButton),
    },
  },
  [WalkthroughStepId.SaveVideoPreset]: {
    desktopEssentialOrder: 11,
    mobileEssentialOrder: 6,
    mobileOverrides: {
      description:
        "Tap the bookmark icon on the video pane, type a name, and save. Your channel selections are now a reusable preset.",
    },
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "Save Video Channels",
      description:
        "Click the bookmark icon on the video pane, type a name, and save. Your channel selections are now a reusable preset.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (
        _types,
        _count,
        _presetCount,
        _selectedId,
        _chromeHidden,
        videoPresetCount,
      ) => videoPresetCount >= WalkthroughCompletionCount.Required,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.VideoPresetButton),
      buttonColor: WalkthroughRingColor.Magenta,
      highlightSelector: walkthroughTourSelector(WalkthroughTourTarget.VideoPresetInput),
      highlightColor: WalkthroughRingColor.Magenta,
      tertiarySelector: walkthroughTourSelector(WalkthroughTourTarget.VideoPresetSaveButton),
    },
  },
  [WalkthroughStepId.Search]: {
    desktopEssentialOrder: 7,
    mobileEssentialOrder: 4,
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "Global Search",
      description:
        "Search across all data: callsigns, vessel names, and locations. Results filter the globe in real time. Try it or press NEXT.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Information,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.Search),
    },
  },
  [WalkthroughStepId.Settings]: {
    desktopAdvancedOrder: 3,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.SettingsButton),
      title: "Settings",
      description:
        "Manage the theme, layer colors, ticker speed, data transfer, and storage.",
      placement: Placement.Left,
      mode: WalkthroughStepMode.Information,
    },
  },
  [WalkthroughStepId.SplitDown]: {
    desktopEssentialOrder: 9,
    mobileEssentialOrder: 5,
    mobileOverrides: {
      targetSelector: WalkthroughSelector.None,
      title: "Add VIDEO FEED",
      description:
        "Tap the + button in the view tabs, then select VIDEO FEED from the list.",
      completionCheck: (types) => types.has(PaneType.VideoFeed),
      expectedPaneType: PaneType.VideoFeed,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.AddView),
      highlightSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitMenuVideoFeed),
      highlightColor: WalkthroughRingColor.Warning,
    },
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitDownButton),
      title: "Add Another: Split Down",
      description:
        "Click the highlighted \"Split down\" button, then select ALERTS.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (types, count) =>
        types.has(PaneType.VideoFeed) &&
        types.has(PaneType.AlertLog) &&
        count >= WalkthroughCompletionCount.SplitLayout,
      expectedPaneType: PaneType.AlertLog,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitDownButton),
      highlightSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitMenuAlertLog),
      highlightColor: WalkthroughRingColor.Danger,
    },
  },
  [WalkthroughStepId.SplitDownAlerts]: {
    mobileEssentialOrder: 7,
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "Add ALERTS",
      description:
        "Tap the + button again, then select ALERTS from the list.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (types) => types.has(PaneType.AlertLog),
      expectedPaneType: PaneType.AlertLog,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.AddView),
      highlightSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitMenuAlertLog),
      highlightColor: WalkthroughRingColor.Danger,
    },
  },
  [WalkthroughStepId.SplitRight]: {
    desktopEssentialOrder: 8,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitRightButton),
      title: "Add a Pane: Split Right",
      description:
        "Click the highlighted \"Split right\" button, then select VIDEO FEED from the menu.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (types) => types.has(PaneType.VideoFeed),
      expectedPaneType: PaneType.VideoFeed,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitRightButton),
      highlightSelector: walkthroughTourSelector(WalkthroughTourTarget.SplitMenuVideoFeed),
    },
  },
  [WalkthroughStepId.SplitRightAlerts]: {
    mobileEssentialOrder: 8,
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "Add INTEL FEED",
      description:
        "Tap the ALERTS tab, tap it again for its actions, choose ADD A VIEW BESIDE, then INTEL FEED.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Action,
      completionCheck: (types) => types.has(PaneType.IntelFeed),
      expectedPaneType: PaneType.IntelFeed,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.ViewTabAlertLog),
      highlightSelector: walkthroughTourSelector(WalkthroughTourTarget.BlockActionSplitRight),
      tertiarySelector: walkthroughTourSelector(WalkthroughTourTarget.SplitMenuIntelFeed),
    },
  },
  [WalkthroughStepId.Ticker]: {
    desktopEssentialOrder: 12,
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.Ticker),
      title: "Live Feed",
      description:
        "The scrolling ticker shows the latest activity from all sources. Click an item to select it and zoom on the globe.",
      placement: Placement.Top,
      mode: WalkthroughStepMode.Information,
    },
  },
  [WalkthroughStepId.WatchMode]: {
    desktopAdvancedOrder: 1,
    step: {
      targetSelector: WalkthroughSelector.None,
      title: "Watch Mode",
      description:
        "Auto-tour through alerts and intel products. The globe cycles through high-priority events every 8 seconds. Try WATCH in the globe controls.",
      placement: Placement.Center,
      mode: WalkthroughStepMode.Information,
      buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.GlobeControls),
    },
  },
  [WalkthroughStepId.Welcome]: {
    desktopEssentialOrder: 0,
    mobileEssentialOrder: 0,
    mobileOverrides: {
      placement: Placement.Center,
    },
    step: {
      targetSelector: walkthroughTourSelector(WalkthroughTourTarget.HeaderBrand),
      title: "Welcome to SIGINT",
      description:
        "Real-time global intelligence dashboard with live aircraft, vessel, seismic, fire, weather, and event tracking.",
      placement: Placement.Bottom,
      mode: WalkthroughStepMode.Information,
    },
  },
};

function walkthroughSteps(
  orderFor: WalkthroughStepOrder,
  overridesFor?: WalkthroughStepOverrides,
): readonly WalkthroughStep[] {
  const orderedSteps: OrderedWalkthroughStep[] = [];
  for (const id of Object.values(WalkthroughStepId)) {
    const definition = WALKTHROUGH_STEP_CATALOG[id];
    const order = orderFor(definition);
    if (order === undefined) continue;
    orderedSteps.push({
      order,
      step: {
        id,
        ...definition.step,
        ...overridesFor?.(definition),
      },
    });
  }
  orderedSteps.sort((left, right) => left.order - right.order);
  return orderedSteps.map(({ step }) => step);
}

export const ESSENTIAL_STEPS = walkthroughSteps(
  ({ desktopEssentialOrder }) => desktopEssentialOrder,
  ({ desktopOverrides }) => desktopOverrides,
);

export const ADVANCED_STEPS = walkthroughSteps(
  ({ desktopAdvancedOrder }) => desktopAdvancedOrder,
  ({ desktopOverrides }) => desktopOverrides,
);

export const MOBILE_ESSENTIAL_STEPS = walkthroughSteps(
  ({ mobileEssentialOrder }) => mobileEssentialOrder,
  ({ mobileOverrides }) => mobileOverrides,
);

export const MOBILE_ADVANCED_STEPS = walkthroughSteps(
  ({ mobileAdvancedOrder }) => mobileAdvancedOrder,
  ({ mobileOverrides }) => mobileOverrides,
);
