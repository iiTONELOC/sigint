import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Layers,
  Link2,
  Newspaper,
  TrendingUp,
} from "lucide-react";
import {
  IntelProductType,
  IntelSeverity,
} from "@shared/domain/correlation";

export enum IntelFeedVirtualization {
  RawRowHeight = 68,
  Overscan = 6,
  InitialPageMultiplier = 2,
}

export enum IntelFeedProgressScale {
  Percentage = 100,
}

export enum IntelFeedIconSize {
  Small = 9,
  Compact = 10,
  Standard = 12,
  Empty = 24,
}

export enum IntelPriorityThreshold {
  CriticalMinimum = 8,
  ElevatedMinimum = 5,
}

enum IntelSeverityBadgeLabel {
  Monitoring = "MON",
  ConcernOrConflict = "CON",
  Tension = "TEN",
  Crisis = "CRI",
}

export enum IntelFeedCopy {
  All = "ALL",
  Intel = "INTEL",
  Raw = "RAW",
  Watching = "WATCHING",
  NonGeographic = "NON-GEO",
  RelatedNews = "RELATED NEWS",
  More = "more",
  Products = "products",
  Items = "items",
  PriorityPrefix = "P",
  Unknown = "UNK",
  NoProducts = "No intel products",
  NoData = "No intel data available",
  CorrelationHint = "Correlations appear when multiple data sources show related activity",
  NoGeographicData = "Statistical observation. No geographic source data. Derived from regional baseline analysis.",
  OpenSource = "Open source",
  ZoomTo = "Zoom to",
  LocationPrefix = "· ",
}

export enum IntelFeedClassName {
  ActiveControl = "text-sig-accent bg-sig-accent/10 border-sig-accent/30",
  InactiveControl = "text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright",
  InactiveFilter = "text-sig-dim bg-transparent border-sig-border/40",
  CriticalPriority = "text-red-400 bg-red-400/10 border-red-400/30",
  ElevatedPriority = "text-orange-400 bg-orange-400/10 border-orange-400/30",
  RoutinePriority = "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  WatchTarget = "bg-sig-accent/15",
  SelectedRow = "bg-sig-accent/10",
  ProductExpanded = "bg-sig-accent/5 border-l-2 border-l-sig-accent/30",
  ProductDefault = "bg-transparent",
  RawDefault = "bg-transparent hover:bg-sig-panel/40",
  RawRow = "relative border-b border-sig-border/20 transition-colors",
  RawAge = "ml-auto mr-12 text-(length:--sig-text-sm) text-sig-dim shrink-0",
  RawMetadata = "text-(length:--sig-text-sm) text-sig-dim truncate",
  ProductContainer = "border-b border-sig-border/20",
  ProductWatchRing = "ring-1 ring-sig-accent/30",
  ProductButton = "w-full text-left px-3 py-2 transition-colors cursor-pointer hover:bg-sig-panel/40 bg-transparent border-none",
  SecondaryText = "text-(length:--sig-text-sm) text-sig-dim",
}

export type IntelProductPresentation = Readonly<{
  icon: LucideIcon;
  label: string;
  summaryLabel?: string;
}>;

export const INTEL_PRODUCT_PRESENTATION: Readonly<
  Record<IntelProductType, IntelProductPresentation>
> = {
  [IntelProductType.CrossSource]: {
    icon: Link2,
    label: "CORRELATION",
    summaryLabel: "correlations",
  },
  [IntelProductType.Anomaly]: {
    icon: AlertTriangle,
    label: "ANOMALY",
    summaryLabel: "anomalies",
  },
  [IntelProductType.Cluster]: {
    icon: Layers,
    label: "CLUSTER",
    summaryLabel: "clusters",
  },
  [IntelProductType.Trend]: {
    icon: TrendingUp,
    label: "TREND",
  },
  [IntelProductType.NewsLink]: {
    icon: Newspaper,
    label: "NEWS",
  },
};

export type IntelSeverityPresentation = Readonly<{
  className: string;
  label: string;
}>;

export const INTEL_SEVERITY_PRESENTATION: Readonly<
  Record<IntelSeverity, IntelSeverityPresentation>
> = {
  [IntelSeverity.Monitoring]: {
    className: "text-sig-dim bg-sig-dim/10 border-sig-dim/30",
    label: IntelSeverityBadgeLabel.Monitoring,
  },
  [IntelSeverity.Concern]: {
    className: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    label: IntelSeverityBadgeLabel.ConcernOrConflict,
  },
  [IntelSeverity.Tension]: {
    className: "text-orange-400 bg-orange-400/10 border-orange-400/30",
    label: IntelSeverityBadgeLabel.Tension,
  },
  [IntelSeverity.Conflict]: {
    className: "text-red-400 bg-red-400/10 border-red-400/30",
    label: IntelSeverityBadgeLabel.ConcernOrConflict,
  },
  [IntelSeverity.Crisis]: {
    className: "text-red-500 bg-red-500/15 border-red-500/40",
    label: IntelSeverityBadgeLabel.Crisis,
  },
};

export type IntelProductRowState = Readonly<{
  expanded: boolean;
  selected: boolean;
  watchTarget: boolean;
}>;

export function intelPriorityClassName(priority: number): string {
  if (priority >= IntelPriorityThreshold.CriticalMinimum) {
    return IntelFeedClassName.CriticalPriority;
  }
  if (priority >= IntelPriorityThreshold.ElevatedMinimum) {
    return IntelFeedClassName.ElevatedPriority;
  }
  return IntelFeedClassName.RoutinePriority;
}

export function intelProductRowClassName(
  state: IntelProductRowState,
): string {
  if (state.watchTarget) return IntelFeedClassName.WatchTarget;
  if (state.selected) return IntelFeedClassName.SelectedRow;
  if (state.expanded) return IntelFeedClassName.ProductExpanded;
  return IntelFeedClassName.ProductDefault;
}
