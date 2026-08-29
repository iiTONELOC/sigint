import { useEffect, useId, useMemo } from "react";
import { RuntimeStylesheet } from "@/styles";
import { IntelFeedProgressScale, IntelFeedVirtualization } from "../model/feed";

enum IntelFeedStyleAttribute {
  Progress = "data-intel-feed-progress",
  VirtualBody = "data-intel-feed-virtual-body",
  VirtualItems = "data-intel-feed-virtual-items",
  RawRow = "data-intel-feed-raw-row",
}

enum IntelFeedCssUnit {
  Percentage = "%",
  Pixel = "px",
}

type IntelFeedGeometry = Readonly<{
  offsetY: number;
  progress: number;
  totalHeight: number;
}>;

export type IntelFeedStyleAttributes = Readonly<{
  progress: Readonly<Record<IntelFeedStyleAttribute.Progress, string>>;
  rawRow: Readonly<Record<IntelFeedStyleAttribute.RawRow, string>>;
  virtualBody: Readonly<
    Record<IntelFeedStyleAttribute.VirtualBody, string>
  >;
  virtualItems: Readonly<
    Record<IntelFeedStyleAttribute.VirtualItems, string>
  >;
}>;

const intelFeedStylesheet = new RuntimeStylesheet();

function intelFeedRules(
  ownerId: string,
  geometry: IntelFeedGeometry,
): readonly string[] {
  const selectorId = JSON.stringify(ownerId);
  const offsetY = Math.max(0, geometry.offsetY);
  const progress = Math.min(1, Math.max(0, geometry.progress));
  const progressPercentage =
    progress * IntelFeedProgressScale.Percentage;
  const totalHeight = Math.max(0, geometry.totalHeight);
  return [
    `[${IntelFeedStyleAttribute.Progress}=${selectorId}]{width:${progressPercentage}${IntelFeedCssUnit.Percentage}}`,
    `[${IntelFeedStyleAttribute.VirtualBody}=${selectorId}]{height:${totalHeight}${IntelFeedCssUnit.Pixel}}`,
    `[${IntelFeedStyleAttribute.VirtualItems}=${selectorId}]{top:${offsetY}${IntelFeedCssUnit.Pixel}}`,
    `[${IntelFeedStyleAttribute.RawRow}=${selectorId}]{height:${IntelFeedVirtualization.RawRowHeight}${IntelFeedCssUnit.Pixel}}`,
  ];
}

export function useIntelFeedStylesheet(
  totalHeight: number,
  offsetY: number,
  progress: number,
): IntelFeedStyleAttributes {
  const ownerId = useId();
  const attributes = useMemo<IntelFeedStyleAttributes>(
    () => ({
      progress: { [IntelFeedStyleAttribute.Progress]: ownerId },
      rawRow: { [IntelFeedStyleAttribute.RawRow]: ownerId },
      virtualBody: { [IntelFeedStyleAttribute.VirtualBody]: ownerId },
      virtualItems: { [IntelFeedStyleAttribute.VirtualItems]: ownerId },
    }),
    [ownerId],
  );

  useEffect(() => {
    intelFeedStylesheet.update(
      ownerId,
      intelFeedRules(ownerId, { offsetY, progress, totalHeight }),
    );
    return () => intelFeedStylesheet.remove(ownerId);
  }, [offsetY, ownerId, progress, totalHeight]);

  return attributes;
}
