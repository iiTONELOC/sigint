import type { KeyboardEvent, MouseEvent } from "react";
import { Locate } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";
import { IconStrokeWidth } from "@/features/base/types";
import { ButtonType } from "@/lib/ui/button";
import { relativeAge } from "@/time";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { useDataTableStylesheet } from "../hooks/useDataTableStylesheet";
import {
  DataTableClassName,
  DataTableCoordinate,
  DataTableCopy,
  DataTableIconSize,
} from "../model/table";
import { dataPointTablePresentation } from "../utils/sort";

type DataTableRowsProps = Readonly<{
  offsetY: number;
  onRowClick: (item: DataPoint) => void;
  onRowKeyDown: (item: DataPoint, event: KeyboardEvent) => void;
  onZoomTo: (item: DataPoint, event: MouseEvent) => void;
  selectedId: string | null;
  totalHeight: number;
  visibleItems: readonly DataPoint[];
}>;

export function DataTableRows({
  offsetY,
  onRowClick,
  onRowKeyDown,
  onZoomTo,
  selectedId,
  totalHeight,
  visibleItems,
}: DataTableRowsProps) {
  const styleAttributes = useDataTableStylesheet(totalHeight, offsetY);

  return (
    <table className="w-full">
      <tbody {...styleAttributes.body} className="block relative">
        {visibleItems.map((item) => {
          const feature = featureRegistry[item.type];
          if (!feature) return null;

          const Icon = feature.icon;
          const presentation = dataPointTablePresentation(item);
          const selected = selectedId === item.id;
          return (
            <tr
              {...styleAttributes.row}
              key={item.id}
              tabIndex={0}
              onClick={() => onRowClick(item)}
              onKeyDown={(event) => onRowKeyDown(item, event)}
              className={`${DataTableClassName.RowBase} ${DataTableClassName.Grid} ${
                selected
                  ? DataTableClassName.SelectedRow
                  : DataTableClassName.DefaultRow
              }`}
            >
              <td className="flex items-center gap-1 overflow-hidden">
                <Icon
                  size={DataTableIconSize.Control}
                  strokeWidth={IconStrokeWidth.Standard}
                  className={`shrink-0 ${feature.colorClassName}`}
                />
                <span
                  className={`tracking-wider text-(length:--sig-text-sm) font-semibold truncate ${feature.colorClassName}`}
                >
                  {presentation.abbreviation}
                </span>
              </td>
              <td className="truncate text-sig-bright text-(length:--sig-text-md)">
                {presentation.name}
              </td>
              <td className={`${DataTableClassName.WideOnly} truncate text-sig-text text-(length:--sig-text-sm)`}>
                {presentation.classification}
              </td>
              <td className="text-right truncate text-sig-dim text-(length:--sig-text-sm)">
                {presentation.detail}
              </td>
              <td className={DataTableClassName.CoordinateCell}>
                {recordLatitude(item).toFixed(DataTableCoordinate.Precision)}
              </td>
              <td className={`${DataTableClassName.WideOnly} ${DataTableClassName.CoordinateCell}`}>
                {recordLongitude(item).toFixed(
                  DataTableCoordinate.Precision,
                )}
              </td>
              <td className="text-right text-sig-dim text-(length:--sig-text-sm)">
                {relativeAge(item.timestamp)}
              </td>
              <td className={DataTableClassName.WideOnlyActions}>
                <button
                  type={ButtonType.Button}
                  onClick={(event) => onZoomTo(item, event)}
                  className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                  title={DataTableCopy.ZoomToGlobe}
                >
                  <Locate
                    size={DataTableIconSize.Control}
                    strokeWidth={IconStrokeWidth.Standard}
                  />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
