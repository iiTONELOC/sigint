import {
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
