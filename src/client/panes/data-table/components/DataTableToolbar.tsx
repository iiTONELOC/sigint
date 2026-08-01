import { Filter } from "lucide-react";
import type { DataType } from "@/features/base/dataPoints";
import { featureList } from "@/features/registry";
import { IconStrokeWidth } from "@/features/base/types";
import {
  DataTableClassName,
  DataTableCopy,
  DataTableIconSize,
} from "../model";

type DataTableToolbarProps = Readonly<{
  featureCounts: Readonly<Partial<Record<DataType, number>>>;
  itemCount: number;
  onTypeFilterChange: (type: DataType | null) => void;
  typeFilter: DataType | null;
}>;

export function DataTableToolbar({
  featureCounts,
  itemCount,
  onTypeFilterChange,
  typeFilter,
}: DataTableToolbarProps) {
  return (
    <div className="shrink-0 flex items-center flex-wrap gap-1 px-2 py-1 border-b border-sig-border/40">
      <Filter
        size={DataTableIconSize.Control}
        strokeWidth={IconStrokeWidth.Standard}
        className="text-sig-dim shrink-0"
      />
      <button
        onClick={() => onTypeFilterChange(null)}
        className={`touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
          typeFilter === null
            ? DataTableClassName.ActiveFilter
            : DataTableClassName.InactiveFilter
        }`}
      >
        {DataTableCopy.All}
      </button>
      {featureList
        .filter((feature) => feature.includeInDataTable !== false)
        .map((feature) => {
          const Icon = feature.icon;
          const active = typeFilter === feature.id;
          const count = featureCounts[feature.id] ?? 0;
          return (
            <button
              key={feature.id}
              aria-label={`${feature.label}: ${count}`}
              onClick={() =>
                onTypeFilterChange(active ? null : feature.id)
              }
              className={`flex items-center gap-0.5 touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wide font-semibold transition-colors border ${
                active
                  ? `${DataTableClassName.ActiveFilter} ${feature.colorClassName}`
                  : DataTableClassName.InactiveFilter
              }`}
            >
              <Icon
                size={DataTableIconSize.Control}
                strokeWidth={IconStrokeWidth.Standard}
              />
              <span>{count}</span>
            </button>
          );
        })}
      <div className="flex-1" />
      <span className="text-sig-dim text-(length:--sig-text-sm)">
        {itemCount} {DataTableCopy.Items}
      </span>
    </div>
  );
}
