import type { MouseEvent } from "react";
import { ExternalLink, Locate } from "lucide-react";
import { DomAnchorTarget, DomLinkRelation } from "@/runtime";
import type { DataPoint } from "@/features/base/dataPoints";
import { IconStrokeWidth } from "@/features/base/types";
import { featureRegistry } from "@/features/registry";
import { ButtonType } from "@/lib/ui/button";
import { relativeAge } from "@/time";
import type { IntelFeedStyleAttributes } from "../hooks";
import {
  IntelFeedClassName,
  IntelFeedCopy,
  IntelFeedIconSize,
} from "../model";
import { IntelSeverityBadge } from "./IntelFeedBadges";

type RawIntelFeedProps = Readonly<{
  allowSelectionHighlight: boolean;
  itemCount: number;
  onItemClick: (item: DataPoint) => void;
  onZoomTo: (item: DataPoint, event: MouseEvent) => void;
  selectedId: string | null;
  styleAttributes: IntelFeedStyleAttributes;
  visibleItems: readonly DataPoint[];
}>;

export function RawIntelFeed({
  allowSelectionHighlight,
  itemCount,
  onItemClick,
  onZoomTo,
  selectedId,
  styleAttributes,
  visibleItems,
}: RawIntelFeedProps) {
  return (
    <>
      <div {...styleAttributes.virtualBody} className="relative">
        <div
          {...styleAttributes.virtualItems}
          className="absolute inset-x-0"
        >
          {visibleItems.map((item) => {
            const feature = featureRegistry.get(item.type);
            if (!feature) return null;

            const Icon = feature.icon;
            const presentation = feature.feedPresentation(item.data, item.id);
            const selected =
              allowSelectionHighlight && selectedId === item.id;
            return (
              <div
                {...styleAttributes.rawRow}
                key={item.id}
                className={`${IntelFeedClassName.RawRow} ${
                  selected
                    ? IntelFeedClassName.SelectedRow
                    : IntelFeedClassName.RawDefault
                }`}
              >
                <button
                  type={ButtonType.Button}
                  onClick={() => onItemClick(item)}
                  className="w-full h-full text-left px-3 py-1.5 cursor-pointer bg-transparent border-none"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      size={IntelFeedIconSize.Standard}
                      strokeWidth={IconStrokeWidth.Standard}
                      className={`shrink-0 ${feature.colorClassName}`}
                    />
                    <IntelSeverityBadge severity={presentation.severity} />
                    {presentation.category && (
                      <span
                        className={`text-(length:--sig-text-sm) font-semibold tracking-wider truncate ${feature.colorClassName}`}
                      >
                        {presentation.category}
                      </span>
                    )}
                    <span className={IntelFeedClassName.RawAge}>
                      {relativeAge(item.timestamp)}
                    </span>
                  </div>
                  <div className="text-sig-text text-(length:--sig-text-md) mt-0.5 truncate ml-5">
                    {presentation.headline}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 ml-5">
                    {presentation.source && (
                      <span className={IntelFeedClassName.RawMetadata}>
                        {presentation.source}
                      </span>
                    )}
                    {presentation.location && (
                      <span className={IntelFeedClassName.RawMetadata}>
                        {IntelFeedCopy.LocationPrefix}
                        {presentation.location}
                      </span>
                    )}
                  </div>
                </button>
                <div className="absolute right-3 bottom-1.5 flex items-center gap-1">
                  {presentation.url && (
                    <a
                      href={presentation.url}
                      target={DomAnchorTarget.Blank}
                      rel={DomLinkRelation.NoopenerNoreferrer}
                      className="p-0.5 rounded text-sig-dim hover:text-sig-accent transition-colors"
                      title={IntelFeedCopy.OpenSource}
                    >
                      <ExternalLink
                        size={IntelFeedIconSize.Standard}
                        strokeWidth={IconStrokeWidth.Standard}
                      />
                    </a>
                  )}
                  <button
                    type={ButtonType.Button}
                    onClick={(event) => onZoomTo(item, event)}
                    className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                    title={IntelFeedCopy.ZoomTo}
                  >
                    <Locate
                      size={IntelFeedIconSize.Standard}
                      strokeWidth={IconStrokeWidth.Standard}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {itemCount === 0 && (
        <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
          {IntelFeedCopy.NoData}
        </div>
      )}
    </>
  );
}
