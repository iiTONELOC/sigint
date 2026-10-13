import { describe, expect, test } from "bun:test";
import { PaneLayoutRatio, SplitDirection } from "@/panes/workspace/model/pane";
import { PaneResizeMetric, PANE_RESIZE_AXIS_POLICY } from "@/panes/workspace/model/resize";
import { DomInputType, DomKey } from "@/runtime";
import {
  dispatchResizeKey,
  lastResize,
  renderResizeHandle,
  ResizeExpectedRatio,
  ResizeFixtureSplitId,
} from "./ResizeHandle.fixture";

enum ResizeAriaAttribute {
  Label = "aria-label",
}

enum ResizeExpectedTabIndex {
  Default = 0,
}

describe("ResizeHandle keyboard interaction", () => {
  test("exposes the native horizontal resize control state", () => {
    const { control } = renderResizeHandle(SplitDirection.Horizontal);

    expect(control.getAttribute(ResizeAriaAttribute.Label)).toBe(
      PANE_RESIZE_AXIS_POLICY[SplitDirection.Horizontal].accessibleName,
    );
    expect(control.valueAsNumber).toBe(
      PaneLayoutRatio.Equal * PaneResizeMetric.FullPercent,
    );
    expect(Number(control.min)).toBe(PaneResizeMetric.EmptyPixels);
    expect(Number(control.max)).toBe(PaneResizeMetric.FullPercent);
    expect(Number(control.step)).toBe(
      PaneResizeMetric.KeyboardStep * PaneResizeMetric.FullPercent,
    );
    expect(control.type).toBe(DomInputType.Range);
    expect(control.tabIndex).toBe(ResizeExpectedTabIndex.Default);

    control.focus();
    expect(document.activeElement).toBe(control);
  });

  test("identifies the vertical resize axis", () => {
    const { control } = renderResizeHandle(SplitDirection.Vertical);

    expect(control.getAttribute(ResizeAriaAttribute.Label)).toBe(
      PANE_RESIZE_AXIS_POLICY[SplitDirection.Vertical].accessibleName,
    );
  });

  test("moves the split with the arrows of its axis and jumps to its bounds with Home and End", () => {
    const axes: ReadonlyArray<readonly [SplitDirection, ReadonlyArray<readonly [DomKey, ResizeExpectedRatio]>]> = [
      [SplitDirection.Horizontal, [
        [DomKey.ArrowRight, ResizeExpectedRatio.Increased],
        [DomKey.ArrowLeft, ResizeExpectedRatio.Decreased],
        [DomKey.Home, ResizeExpectedRatio.HorizontalMinimum],
        [DomKey.End, ResizeExpectedRatio.HorizontalMaximum],
      ]],
      [SplitDirection.Vertical, [
        [DomKey.ArrowDown, ResizeExpectedRatio.Increased],
        [DomKey.ArrowUp, ResizeExpectedRatio.Decreased],
        [DomKey.Home, ResizeExpectedRatio.VerticalMinimum],
        [DomKey.End, ResizeExpectedRatio.VerticalMaximum],
      ]],
    ];

    for (const [direction, keys] of axes) {
      const fixture = renderResizeHandle(direction);
      for (const [key, ratio] of keys) {
        dispatchResizeKey(fixture.control, key);
        const resize = lastResize(fixture);
        expect([direction, key, resize.splitId]).toEqual([direction, key, ResizeFixtureSplitId.Primary]);
        expect(resize.ratio).toBeCloseTo(ratio);
      }
    }
  });

  test("ignores keys that do not apply to the split", () => {
    const horizontal = renderResizeHandle(SplitDirection.Horizontal);
    const vertical = renderResizeHandle(SplitDirection.Vertical);

    dispatchResizeKey(horizontal.control, DomKey.ArrowDown);
    dispatchResizeKey(vertical.control, DomKey.ArrowRight);
    dispatchResizeKey(horizontal.control, DomKey.Escape);

    expect(horizontal.onResize).not.toHaveBeenCalled();
    expect(vertical.onResize).not.toHaveBeenCalled();
  });
});
