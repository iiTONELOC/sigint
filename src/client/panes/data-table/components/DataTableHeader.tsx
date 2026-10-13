import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { IconStrokeWidth } from "@/features/base/types";
import { PanelSide } from "@/layout-mode";
import { ButtonType } from "@/lib/ui/button";
import { DomTableScope } from "@/runtime";
import {
  TableSortDirection,
  TableSortKey,
} from "@/workers/data/uiQuery";
import {
  DATA_TABLE_COLUMNS,
  DataTableAriaSort,
  DataTableClassName,
  DataTableCopy,
  DataTableIconSize,
  dataTableCellClass,
} from "../model/table";

type DataTableHeaderProps = Readonly<{
  onSort: (key: TableSortKey) => void;
  sortDirection: TableSortDirection;
  sortKey: TableSortKey;
}>;

function ariaSort(
  active: boolean,
  ascending: boolean,
): DataTableAriaSort {
  if (!active) return DataTableAriaSort.None;
  return ascending
    ? DataTableAriaSort.Ascending
    : DataTableAriaSort.Descending;
}

export function DataTableHeader({
  onSort,
  sortDirection,
  sortKey,
}: DataTableHeaderProps) {
  return (
    <table className="shrink-0 w-full border-b border-sig-border/40 bg-sig-panel/40 select-none">
      <thead>
        <tr className={`grid items-center px-2 py-1 ${DataTableClassName.Grid}`}>
          {Array.from(DATA_TABLE_COLUMNS.entries()).map(([key, metadata]) => {
            const active = sortKey === key;
            const ascending =
              active && sortDirection === TableSortDirection.Ascending;
            const rightAligned =
              metadata.alignment === PanelSide.Right;
            return (
              <th
                key={key}
                scope={DomTableScope.Column}
                aria-sort={ariaSort(active, ascending)}
                className={`${
                  rightAligned
                    ? DataTableClassName.RightAligned
                    : DataTableClassName.LeftAligned
                } ${dataTableCellClass(metadata.wideOnly)}`}
              >
                <Tooltip content={metadata.tooltip} placement="bottom">
                  <button
                    type={ButtonType.Button}
                    onClick={() => onSort(key)}
                    className={`${DataTableClassName.SortButton} ${
                      active
                        ? DataTableClassName.ActiveSort
                        : DataTableClassName.InactiveSort
                    } ${
                      rightAligned
                        ? DataTableClassName.EndJustified
                        : DataTableClassName.StartJustified
                    }`}
                  >
                    {metadata.label}
                    {!active && (
                      <ArrowUpDown
                        size={DataTableIconSize.SortInactive}
                        strokeWidth={IconStrokeWidth.Standard}
                        className="opacity-30"
                      />
                    )}
                    {ascending && (
                      <ArrowUp
                        size={DataTableIconSize.SortActive}
                        strokeWidth={IconStrokeWidth.Standard}
                      />
                    )}
                    {active && !ascending && (
                      <ArrowDown
                        size={DataTableIconSize.SortActive}
                        strokeWidth={IconStrokeWidth.Standard}
                      />
                    )}
                  </button>
                </Tooltip>
              </th>
            );
          })}
          <th
            scope={DomTableScope.Column}
            aria-label={DataTableCopy.Actions}
            className={DataTableClassName.WideOnly}
          />
        </tr>
      </thead>
    </table>
  );
}
