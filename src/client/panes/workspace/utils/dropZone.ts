import { Placement } from "@/layout-mode/model/layoutMode";
import { PaneDropZoneThreshold, type PaneDropZoneValue } from "../model/pane";

export type PaneDropBounds = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

export function paneDropZoneForPoint(
  clientX: number,
  clientY: number,
  bounds: PaneDropBounds,
): PaneDropZoneValue {
  const x = (clientX - bounds.left) / bounds.width;
  const y = (clientY - bounds.top) / bounds.height;
  if (y < PaneDropZoneThreshold.Edge) {
    return Placement.Top;
  }
  if (
    y >
    PaneDropZoneThreshold.Full - PaneDropZoneThreshold.Edge
  ) {
    return Placement.Bottom;
  }
  if (x < PaneDropZoneThreshold.Edge) {
    return Placement.Left;
  }
  if (
    x >
    PaneDropZoneThreshold.Full - PaneDropZoneThreshold.Edge
  ) {
    return Placement.Right;
  }
  return Placement.Center;
}
