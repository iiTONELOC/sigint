import {
  PaneLayoutRatio,
  SplitDirection,
  type SplitDirectionValue,
} from "./pane";

export enum PaneResizeMetric {
  EmptyPixels = 0,
  FullPercent = 100,
  HorizontalMinimumPixels = 340,
  KeyboardStep = 0.02,
  MaximumMinimumRatio = 0.4,
  RatioUnit = 1,
  VerticalMinimumPixels = 200,
}

export type PaneResizeAxisPolicy = Readonly<{
  accessibleName: string;
  minimumPixels: number;
}>;

export const PANE_RESIZE_AXIS_POLICY: Readonly<
  Record<SplitDirectionValue, PaneResizeAxisPolicy>
> = {
  [SplitDirection.Horizontal]: {
    accessibleName: "Resize panes horizontally",
    minimumPixels: PaneResizeMetric.HorizontalMinimumPixels,
  },
  [SplitDirection.Vertical]: {
    accessibleName: "Resize panes vertically",
    minimumPixels: PaneResizeMetric.VerticalMinimumPixels,
  },
};

const HORIZONTAL_RATIO_STEPS: readonly number[] = [
  PaneLayoutRatio.DetailMedium,
  PaneLayoutRatio.DetailNarrow,
  PaneLayoutRatio.Equal,
];

export function fittingHorizontalRatio(
  availableWidth: number,
  preferred: number,
): number | null {
  if (fitsHorizontalSplit(availableWidth, preferred)) {
    return preferred;
  }
  return (
    HORIZONTAL_RATIO_STEPS.find(
      (ratio) =>
        ratio < preferred && fitsHorizontalSplit(availableWidth, ratio),
    ) ?? null
  );
}

export function fitsHorizontalSplit(
  availableWidth: number,
  ratio: number,
): boolean {
  return (
    availableWidth * ratio >= PaneResizeMetric.HorizontalMinimumPixels &&
    availableWidth * (PaneResizeMetric.RatioUnit - ratio) >=
      PaneResizeMetric.HorizontalMinimumPixels
  );
}

export function renderedSplitDirection(
  direction: SplitDirectionValue,
  ratio: number,
  availableWidth: number | null,
): SplitDirectionValue {
  if (
    direction !== SplitDirection.Horizontal ||
    availableWidth === null ||
    fitsHorizontalSplit(availableWidth, ratio)
  ) {
    return direction;
  }
  return SplitDirection.Vertical;
}
