export enum PaneType {
  Globe = "globe",
  DataTable = "data-table",
  Dossier = "dossier",
  IntelFeed = "intel-feed",
  AlertLog = "alert-log",
  RawConsole = "raw-console",
  VideoFeed = "video-feed",
  NewsFeed = "news-feed",
}

export enum PaneNodeType {
  Leaf = "leaf",
  Split = "split",
}

export enum SplitDirection {
  Horizontal = "h",
  Vertical = "v",
}

export enum PaneDropZone {
  Center = "center",
  Top = "top",
  Bottom = "bottom",
  Left = "left",
  Right = "right",
}

export enum PaneDragDataType {
  PlainText = "text/plain",
}

export enum PaneDragEffect {
  Move = "move",
}

export enum PaneLayoutRatio {
  Equal = 0.5,
  DetailNarrow = 0.6,
  WatchAlerts = 0.65,
  DetailMedium = 0.7,
  Detail = 0.75,
}

export enum PaneDropZoneThreshold {
  Edge = 0.25,
  Full = 1,
}

export enum PaneSearchIndex {
  NotFound = -1,
}

export enum PaneWorkspaceIconMetric {
  XSmallSize = 8,
  SmallSize = 9,
  CompactSize = 10,
  LightStroke = 2,
  StandardStroke = 2.5,
  ToolbarSize = 11,
  MediumSize = 12,
  LargeSize = 14,
}

export enum PaneWorkspaceMenuMetric {
  BoundaryWidth = 200,
}

export enum PaneMobileHeight {
  Minimum = 160,
  XSmall = 280,
  Small = 300,
  Standard = 320,
  Medium = 340,
  Large = 360,
  XLarge = 400,
  XXLarge = 420,
}

export enum PaneMobileRatio {
  MaximumViewportHeight = 0.8,
}

export enum PaneIdSequence {
  Start = 0,
  Step = 1,
}

export enum PaneTreeArity {
  Binary = 2,
}

export enum PaneIdToken {
  NodePrefix = "n",
  SegmentSeparator = "-",
}

export type PaneTypeValue = `${PaneType}`;
export type PaneNodeTypeValue = `${PaneNodeType}`;
export type PaneLeafNodeType = `${PaneNodeType.Leaf}`;
export type PaneSplitNodeType = `${PaneNodeType.Split}`;
export type SplitDirectionValue = `${SplitDirection}`;
export type PaneDropZoneValue = `${PaneDropZone}`;
export type PaneEdgeDropZoneValue = Exclude<
  PaneDropZoneValue,
  `${PaneDropZone.Center}`
>;
