import { PanelSide } from "@/layout-mode/model/layoutMode";
import { TableSortKey } from "@/workers/data/uiQuery";

export enum DataTableVirtualization {
  RowHeight = 28,
  Overscan = 8,
  InitialPageMultiplier = 2,
}

export enum DataTableCoordinate {
  Precision = 2,
}

export enum DataTableIconSize {
  SortInactive = 9,
  SortActive = 10,
  Control = 11,
}

export enum DataTableAriaSort {
  None = "none",
  Ascending = "ascending",
  Descending = "descending",
}

export enum DataTableCopy {
  All = "ALL",
  Actions = "Actions",
  Items = "items",
  Loading = "Loading data table",
  NoMatches = "No data matching filters",
  ZoomToGlobe = "Zoom to on globe",
}

export enum DataTableClassName {
  Container = "@container/table",
  Grid = "grid-cols-[52px_1fr_70px_60px_40px] @min-[40rem]/table:grid-cols-[64px_1fr_90px_80px_72px_72px_48px_32px]",
  WideOnly = "hidden @min-[40rem]/table:block",
  WideOnlyActions = "hidden @min-[40rem]/table:flex justify-center",
  ActiveFilter = "text-sig-accent bg-sig-accent/10 border-sig-accent/30",
  InactiveFilter = "text-sig-dim bg-transparent border-sig-border/50",
  SortButton = "w-full flex items-center gap-0.5 bg-transparent border-none p-0 tracking-wider text-(length:--sig-text-sm) font-semibold transition-colors any-pointer-coarse:min-h-11",
  ActiveSort = "text-sig-accent",
  InactiveSort = "text-sig-dim",
  SelectedRow = "bg-sig-accent/15 border-l-2 border-l-sig-accent",
  DefaultRow = "bg-transparent hover:bg-sig-panel/40",
  LeftAligned = "text-left",
  RightAligned = "text-right",
  StartJustified = "justify-start",
  EndJustified = "justify-end",
  RowBase = "grid items-center px-2 border-b border-sig-border/20 cursor-pointer transition-colors",
  CoordinateCell = "text-right text-sig-dim text-(length:--sig-text-sm) tabular-nums",
}

export type DataTableColumnMetadata = Readonly<{
  alignment: PanelSide;
  label: string;
  tooltip: string;
  wideOnly: boolean;
}>;

export const DATA_TABLE_COLUMNS: ReadonlyMap<
  TableSortKey,
  DataTableColumnMetadata
> = new Map([
  [
    TableSortKey.Type,
    {
      alignment: PanelSide.Left,
      label: "TYPE",
      tooltip: "Entity type",
      wideOnly: false,
    },
  ],
  [
    TableSortKey.Name,
    {
      alignment: PanelSide.Left,
      label: "NAME",
      tooltip: "Callsign / name / headline",
      wideOnly: false,
    },
  ],
  [
    TableSortKey.Value1,
    {
      alignment: PanelSide.Left,
      label: "CLS",
      tooltip: "Classification (aircraft type, vessel type, category, magnitude)",
      wideOnly: true,
    },
  ],
  [
    TableSortKey.Value2,
    {
      alignment: PanelSide.Right,
      label: "DTL",
      tooltip: "Detail (altitude, speed, severity, FRP)",
      wideOnly: false,
    },
  ],
  [
    TableSortKey.Latitude,
    {
      alignment: PanelSide.Right,
      label: "LAT",
      tooltip: "Latitude",
      wideOnly: false,
    },
  ],
  [
    TableSortKey.Longitude,
    {
      alignment: PanelSide.Right,
      label: "LON",
      tooltip: "Longitude",
      wideOnly: true,
    },
  ],
  [
    TableSortKey.Age,
    {
      alignment: PanelSide.Right,
      label: "AGE",
      tooltip: "Time since last update",
      wideOnly: false,
    },
  ],
]);

export function dataTableCellClass(wideOnly: boolean): string {
  return wideOnly ? DataTableClassName.WideOnly : "";
}
