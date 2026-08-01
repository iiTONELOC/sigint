import { Eye, Filter, List } from "lucide-react";
import type { DataType } from "@/features/base/dataPoints";
import { IconStrokeWidth } from "@/features/base/types";
import { featureList } from "@/features/registry";
import {
  IntelFeedClassName,
  IntelFeedCopy,
  IntelFeedIconSize,
} from "../model";

type IntelFeedToolbarProps = Readonly<{
  feedFilter: DataType | null;
  isIntelActive: boolean;
  isRawView: boolean;
  onFeedFilterChange: (type: DataType | null) => void;
  onRawViewChange: (raw: boolean) => void;
  productCount: number;
  rawItemCount: number;
  typeCounts: Readonly<Partial<Record<DataType, number>>>;
}>;

export function IntelFeedToolbar({
  feedFilter,
  isIntelActive,
  isRawView,
  onFeedFilterChange,
  onRawViewChange,
  productCount,
  rawItemCount,
  typeCounts,
}: IntelFeedToolbarProps) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-sig-border/40 flex-wrap">
      <button
        onClick={() => onRawViewChange(false)}
        className={`flex items-center gap-1 touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wider font-semibold shrink-0 transition-colors border ${
          isRawView
            ? IntelFeedClassName.InactiveControl
            : IntelFeedClassName.ActiveControl
        }`}
      >
        <Eye
          size={IntelFeedIconSize.Small}
          strokeWidth={IconStrokeWidth.Standard}
        />
        {IntelFeedCopy.Intel}
      </button>
      <button
        onClick={() => onRawViewChange(true)}
        className={`flex items-center gap-1 touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wider font-semibold shrink-0 transition-colors border ${
          isRawView
            ? IntelFeedClassName.ActiveControl
            : IntelFeedClassName.InactiveControl
        }`}
      >
        <List
          size={IntelFeedIconSize.Small}
          strokeWidth={IconStrokeWidth.Standard}
        />
        {IntelFeedCopy.Raw}
      </button>

      {isRawView && (
        <>
          <div className="w-px h-3 bg-sig-border/40 shrink-0 mx-0.5" />
          <Filter
            size={IntelFeedIconSize.Small}
            strokeWidth={IconStrokeWidth.Standard}
            className="text-sig-dim shrink-0"
          />
          <button
            onClick={() => onFeedFilterChange(null)}
            className={`touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wider font-semibold shrink-0 transition-colors border ${
              feedFilter === null
                ? IntelFeedClassName.ActiveControl
                : IntelFeedClassName.InactiveFilter
            }`}
          >
            {IntelFeedCopy.All}
          </button>
          {featureList
            .filter((feature) => feature.includeInRawFeed === true)
            .map((feature) => {
              const Icon = feature.icon;
              const active = feedFilter === feature.id;
              const count = typeCounts[feature.id] ?? 0;
              return (
                <button
                  key={feature.id}
                  aria-label={`${feature.label}: ${count}`}
                  onClick={() =>
                    onFeedFilterChange(active ? null : feature.id)
                  }
                  className={`flex items-center gap-1 touch-target px-1.5 py-0.5 rounded text-(length:--sig-text-sm) tracking-wider font-semibold shrink-0 transition-colors border ${
                    active
                      ? IntelFeedClassName.ActiveControl
                      : IntelFeedClassName.InactiveFilter
                  }`}
                >
                  <Icon
                    size={IntelFeedIconSize.Small}
                    strokeWidth={IconStrokeWidth.Standard}
                    className={feature.colorClassName}
                  />
                  {count}
                </button>
              );
            })}
        </>
      )}

      <div className="flex-1" />
      {isIntelActive && (
        <span className="text-(length:--sig-text-sm) text-sig-accent tracking-wider font-mono shrink-0 px-1.5 py-0.5 rounded bg-sig-accent/10 border border-sig-accent/30 mr-1">
          {IntelFeedCopy.Watching}
        </span>
      )}
      <span className="text-sig-dim text-(length:--sig-text-sm) shrink-0">
        {isRawView
          ? `${rawItemCount} ${IntelFeedCopy.Items}`
          : `${productCount} ${IntelFeedCopy.Products}`}
      </span>
    </div>
  );
}
