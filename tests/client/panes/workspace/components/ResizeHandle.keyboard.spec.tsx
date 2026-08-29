import { describe, expect, test } from "bun:test";
import { PaneLayoutRatio, SplitDirection } from "@/panes/workspace/model/pane";
import { PaneResizeMetric, PANE_RESIZE_AXIS_POLICY } from "@/panes/workspace/model/resize";
import { DomInputType, DomKey } from "@/runtime";
import {
  dispatchResizeKey,
  expectLastResize,
  renderResizeHandle,
  ResizeExpectedRatio,
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

  test("supports horizontal arrow and boundary keys", () => {
    const fixture = renderResizeHandle(SplitDirection.Horizontal);

    dispatchResizeKey(fixture.control, DomKey.ArrowRight);
    expectLastResize(fixture, ResizeExpectedRatio.Increased);

    dispatchResizeKey(fixture.control, DomKey.ArrowLeft);
    expectLastResize(fixture, ResizeExpectedRatio.Decreased);

    dispatchResizeKey(fixture.control, DomKey.Home);
    expectLastResize(fixture, ResizeExpectedRatio.HorizontalMinimum);

    dispatchResizeKey(fixture.control, DomKey.End);
    expectLastResize(fixture, ResizeExpectedRatio.HorizontalMaximum);
  });

  test("supports vertical arrow and boundary keys", () => {
    const fixture = renderResizeHandle(SplitDirection.Vertical);

    dispatchResizeKey(fixture.control, DomKey.ArrowDown);
    expectLastResize(fixture, ResizeExpectedRatio.Increased);

    dispatchResizeKey(fixture.control, DomKey.ArrowUp);
    expectLastResize(fixture, ResizeExpectedRatio.Decreased);

    dispatchResizeKey(fixture.control, DomKey.Home);
    expectLastResize(fixture, ResizeExpectedRatio.VerticalMinimum);

    dispatchResizeKey(fixture.control, DomKey.End);
    expectLastResize(fixture, ResizeExpectedRatio.VerticalMaximum);
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
