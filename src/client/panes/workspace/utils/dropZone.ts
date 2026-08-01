import {
  PaneDropZone,
  PaneDropZoneThreshold,
  type PaneDropZoneValue,
} from "../model";

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
    return PaneDropZone.Top;
  }
  if (
    y >
    PaneDropZoneThreshold.Full - PaneDropZoneThreshold.Edge
  ) {
    return PaneDropZone.Bottom;
  }
  if (x < PaneDropZoneThreshold.Edge) {
    return PaneDropZone.Left;
  }
  if (
    x >
    PaneDropZoneThreshold.Full - PaneDropZoneThreshold.Edge
  ) {
    return PaneDropZone.Right;
  }
  return PaneDropZone.Center;
}
