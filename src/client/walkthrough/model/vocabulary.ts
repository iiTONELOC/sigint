export enum WalkthroughLaunchMode {
  Advanced = "advanced",
  Both = "both",
  Essential = "essential",
}

export enum WalkthroughPhase {
  Advanced = "advanced",
  Essential = "essential",
  Transition = "transition",
}

export enum WalkthroughStepMode {
  Action = "action",
  Information = "info",
}

export enum WalkthroughPlacement {
  Bottom = "bottom",
  Center = "center",
  Left = "left",
  Right = "right",
  Top = "top",
}

export enum WalkthroughRingColor {
  Accent = "accent",
  Danger = "danger",
  Magenta = "magenta",
  Warning = "warn",
}

export enum WalkthroughClickMode {
  Deselect = "deselect",
  Focus = "focus",
  Select = "select",
}

export enum WalkthroughStepId {
  AircraftFilter = "aircraft-filter",
  Complete = "complete",
  FocusEnter = "focus-enter",
  FocusExit = "focus-exit",
  GlobeControls = "globe-controls",
  GlobeDeselect = "globe-deselect",
  GlobeDragDetail = "globe-drag-detail",
  GlobeSelect = "globe-select",
  Layers = "layers",
  MobileComplete = "mobile-complete",
  MobileDetailSheet = "mobile-detail-sheet",
  SavePreset = "save-preset",
  SaveVideoPreset = "save-video-preset",
  Search = "search",
  Settings = "settings",
  SplitDown = "split-down",
  SplitDownAlerts = "split-down-alerts",
  SplitRight = "split-right",
  SplitRightAlerts = "split-right-alerts",
  Ticker = "ticker",
  WatchMode = "watch-mode",
  Welcome = "welcome",
}

export enum WalkthroughTourTarget {
  AircraftFilter = "aircraft-filter",
  DetailClose = "detail-close",
  DetailDragHandle = "detail-drag-handle",
  GlobeControls = "globe-controls",
  GlobePane = "globe-pane",
  HeaderBrand = "header-brand",
  LayerToggles = "layer-toggles",
  PresetInput = "preset-input",
  PresetSaveButton = "preset-save-btn",
  Search = "search",
  SettingsButton = "settings-button",
  SplitDownButton = "split-down-btn",
  SplitDownVideoFeed = "split-down-video-feed",
  SplitMenuAlertLog = "split-menu-alert-log",
  SplitMenuIntelFeed = "split-menu-intel-feed",
  SplitMenuVideoFeed = "split-menu-video-feed",
  SplitRightAlertLog = "split-right-alert-log",
  SplitRightButton = "split-right-btn",
  Ticker = "ticker",
  VideoPresetButton = "video-preset-btn",
  VideoPresetInput = "video-preset-input",
  VideoPresetSaveButton = "video-preset-save-btn",
  ViewsButton = "views-btn",
}

export enum WalkthroughSelector {
  None = "",
}

export function walkthroughTourSelector(
  target: WalkthroughTourTarget,
): string {
  return `[data-tour="${target}"]`;
}
