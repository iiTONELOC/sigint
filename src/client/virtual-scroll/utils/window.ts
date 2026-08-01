import { VirtualScrollPolicy } from "../model";

export type VirtualWindowInput = Readonly<{
  itemCount: number;
  overscan: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}>;

export type VirtualWindow = Readonly<{
  endIdx: number;
  offsetY: number;
  startIdx: number;
  totalHeight: number;
}>;

/** Calculate the rendered window for a fixed-height virtual list. */
export function calculateVirtualWindow({
  itemCount,
  overscan,
  rowHeight,
  scrollTop,
  viewportHeight,
}: VirtualWindowInput): VirtualWindow {
  const totalHeight = itemCount * rowHeight;
  const startIdx = Math.max(
    VirtualScrollPolicy.Start,
    Math.floor(scrollTop / rowHeight) - overscan,
  );
  const endIdx = Math.min(
    itemCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  );
  return {
    endIdx,
    offsetY: startIdx * rowHeight,
    startIdx,
    totalHeight,
  };
}
