import type { KeyboardEvent, MouseEvent } from "react";
import { Locate } from "lucide-react";
import type { DataPoint } from "@/features/base/dataPoints";
import { featureRegistry } from "@/features/registry";
import { IconStrokeWidth } from "@/features/base/types";
import { relativeAge } from "@/time";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { useDataTableStylesheet } from "../hooks";
import {
  DataTableClassName,
  DataTableCoordinate,
  DataTableCopy,
  DataTableIconSize,
  dataTableGridClass,
} from "../model";
import { dataPointTablePresentation } from "../utils";

type DataTableRowsProps = Readonly<{
  isMobile: boolean;
  offsetY: number;
  onRowClick: (item: DataPoint) => void;
  onRowKeyDown: (item: DataPoint, event: KeyboardEvent) => void;
  onZoomTo: (item: DataPoint, event: MouseEvent) => void;
  selectedId: string | null;
  totalHeight: number;
  visibleItems: readonly DataPoint[];
}>;

export function DataTableRows({
  isMobile,
  offsetY,
  onRowClick,
  onRowKeyDown,
  onZoomTo,
  selectedId,
  totalHeight,
  visibleItems,
}: DataTableRowsProps) {
  const styleAttributes = useDataTableStylesheet(totalHeight, offsetY);
  const gridClass = dataTableGridClass(isMobile);

  return (
    <table className="w-full">
      <tbody {...styleAttributes.body} className="block relative">
        {visibleItems.map((item) => {
          const feature = featureRegistry.get(item.type);
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
              className={`${DataTableClassName.RowBase} ${gridClass} ${
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
              {!isMobile && (
                <td className="truncate text-sig-text text-(length:--sig-text-sm)">
                  {presentation.classification}
                </td>
              )}
              <td className="text-right truncate text-sig-dim text-(length:--sig-text-sm)">
                {presentation.detail}
              </td>
              <td className={DataTableClassName.CoordinateCell}>
                {recordLatitude(item).toFixed(DataTableCoordinate.Precision)}
              </td>
              {!isMobile && (
                <td className={DataTableClassName.CoordinateCell}>
                  {recordLongitude(item).toFixed(
                    DataTableCoordinate.Precision,
                  )}
                </td>
              )}
              <td className="text-right text-sig-dim text-(length:--sig-text-sm)">
                {relativeAge(item.timestamp)}
              </td>
              {!isMobile && (
                <td className="flex justify-center">
                  <button
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
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
