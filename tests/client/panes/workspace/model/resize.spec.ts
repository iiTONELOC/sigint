import { describe, expect, test } from "bun:test";
import {
  fitsHorizontalSplit,
  fittingHorizontalRatio,
  renderedSplitDirection,
} from "@/panes/workspace/model/resize";
import {
  PaneLayoutRatio,
  SplitDirection,
} from "@/panes/workspace/model/pane";

enum ResizeFixtureWidth {
  Narrow = 1190,
  Unfit = 600,
  Wide = 1600,
}

describe("horizontal split fitting", () => {
  test("fits only when both panes keep their minimum width", () => {
    expect(
      fitsHorizontalSplit(ResizeFixtureWidth.Wide, PaneLayoutRatio.Detail),
    ).toBe(true);
    expect(
      fitsHorizontalSplit(ResizeFixtureWidth.Narrow, PaneLayoutRatio.Detail),
    ).toBe(false);
    expect(
      fitsHorizontalSplit(ResizeFixtureWidth.Narrow, PaneLayoutRatio.Equal),
    ).toBe(true);
    expect(
      fitsHorizontalSplit(ResizeFixtureWidth.Unfit, PaneLayoutRatio.Equal),
    ).toBe(false);
  });

  test("stacks an unfit horizontal split and restores it when it fits", () => {
    expect(
      renderedSplitDirection(
        SplitDirection.Horizontal,
        PaneLayoutRatio.Detail,
        ResizeFixtureWidth.Narrow,
      ),
    ).toBe(SplitDirection.Vertical);
    expect(
      renderedSplitDirection(
        SplitDirection.Horizontal,
        PaneLayoutRatio.Detail,
        ResizeFixtureWidth.Wide,
      ),
    ).toBe(SplitDirection.Horizontal);
    expect(
      renderedSplitDirection(
        SplitDirection.Horizontal,
        PaneLayoutRatio.Detail,
        null,
      ),
    ).toBe(SplitDirection.Horizontal);
    expect(
      renderedSplitDirection(
        SplitDirection.Vertical,
        PaneLayoutRatio.Equal,
        ResizeFixtureWidth.Unfit,
      ),
    ).toBe(SplitDirection.Vertical);
  });

  test("steps the ratio down until the split fits", () => {
    expect(
      fittingHorizontalRatio(ResizeFixtureWidth.Wide, PaneLayoutRatio.Detail),
    ).toBe(PaneLayoutRatio.Detail);
    expect(
      fittingHorizontalRatio(
        ResizeFixtureWidth.Narrow,
        PaneLayoutRatio.Detail,
      ),
    ).toBe(PaneLayoutRatio.DetailMedium);
    expect(
      fittingHorizontalRatio(ResizeFixtureWidth.Unfit, PaneLayoutRatio.Detail),
    ).toBeNull();
    expect(
      fittingHorizontalRatio(ResizeFixtureWidth.Unfit, PaneLayoutRatio.Equal),
    ).toBeNull();
  });
});
