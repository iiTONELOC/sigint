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
  NoMatches = "No data matching filters",
  ZoomToGlobe = "Zoom to on globe",
}

export enum DataTableClassName {
  MobileGrid = "grid-cols-[52px_1fr_70px_60px_40px]",
  DesktopGrid = "grid-cols-[64px_1fr_90px_80px_72px_72px_48px_32px]",
  ActiveFilter = "text-sig-accent bg-sig-accent/10 border-sig-accent/30",
  InactiveFilter = "text-sig-dim bg-transparent border-sig-border/50",
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
  hideOnMobile: boolean;
  label: string;
  tooltip: string;
}>;

export const DATA_TABLE_COLUMNS: ReadonlyMap<
  TableSortKey,
  DataTableColumnMetadata
> = new Map([
  [
    TableSortKey.Type,
    {
      alignment: PanelSide.Left,
      hideOnMobile: false,
      label: "TYPE",
      tooltip: "Entity type",
    },
  ],
  [
    TableSortKey.Name,
    {
      alignment: PanelSide.Left,
      hideOnMobile: false,
      label: "NAME",
      tooltip: "Callsign / name / headline",
    },
  ],
  [
    TableSortKey.Value1,
    {
      alignment: PanelSide.Left,
      hideOnMobile: true,
      label: "CLS",
      tooltip: "Classification (aircraft type, vessel type, category, magnitude)",
    },
  ],
  [
    TableSortKey.Value2,
    {
      alignment: PanelSide.Right,
      hideOnMobile: false,
      label: "DTL",
      tooltip: "Detail (altitude, speed, severity, FRP)",
    },
  ],
  [
    TableSortKey.Latitude,
    {
      alignment: PanelSide.Right,
      hideOnMobile: false,
      label: "LAT",
      tooltip: "Latitude",
    },
  ],
  [
    TableSortKey.Longitude,
    {
      alignment: PanelSide.Right,
      hideOnMobile: true,
      label: "LON",
      tooltip: "Longitude",
    },
  ],
  [
    TableSortKey.Age,
    {
      alignment: PanelSide.Right,
      hideOnMobile: false,
      label: "AGE",
      tooltip: "Time since last update",
    },
  ],
]);

export function dataTableGridClass(isMobile: boolean): DataTableClassName {
  return isMobile
    ? DataTableClassName.MobileGrid
    : DataTableClassName.DesktopGrid;
}

export function dataTableColumns(
  isMobile: boolean,
): readonly (readonly [TableSortKey, DataTableColumnMetadata])[] {
  const columns = Array.from(DATA_TABLE_COLUMNS.entries());
  return isMobile
    ? columns.filter(([, metadata]) => !metadata.hideOnMobile)
    : columns;
}
