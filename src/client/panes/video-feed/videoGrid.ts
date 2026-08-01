import type { GridLayout } from "./videoFeedTypes";

export enum VideoGridLabel {
  Fallback = "GRID",
  Single = "Single",
  SingleCompact = "1",
  ThreeByThree = "3×3",
  TwoByOne = "2×1",
  TwoByTwo = "2×2",
}

export function videoGridLabel(
  grid: GridLayout | null,
): VideoGridLabel {
  switch (grid) {
    case 1:
      return VideoGridLabel.Single;
    case 2:
      return VideoGridLabel.TwoByOne;
    case 4:
      return VideoGridLabel.TwoByTwo;
    case 9:
      return VideoGridLabel.ThreeByThree;
    default:
      return VideoGridLabel.Fallback;
  }
}

export function videoPresetGridLabel(
  grid: GridLayout,
): VideoGridLabel {
  if (grid === 1) return VideoGridLabel.SingleCompact;
  if (grid === 4) return VideoGridLabel.TwoByTwo;
  return VideoGridLabel.ThreeByThree;
}
