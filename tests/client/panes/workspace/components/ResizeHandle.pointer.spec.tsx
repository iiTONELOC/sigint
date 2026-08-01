import { describe, expect, mock, test } from "bun:test";
import { SplitDirection } from "@/panes/workspace/model";
import { DomEvent } from "@/runtime";
import {
  dispatchResizePointer,
  expectLastResize,
  expectResizeCallback,
  renderResizeHandle,
  type ResizeCallback,
  ResizeExpectedRatio,
  ResizePointerCoordinate,
  ResizePointerId,
} from "./ResizeHandle.fixture";

describe("ResizeHandle pointer interaction", () => {
  test("reports the horizontal ratio and split identity", () => {
    const fixture = renderResizeHandle(SplitDirection.Horizontal);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalCenter,
    );

    expectLastResize(fixture, ResizeExpectedRatio.Center);
  });

  test("reports the vertical ratio and split identity", () => {
    const fixture = renderResizeHandle(SplitDirection.Vertical);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalCenter,
    );

    expectLastResize(fixture, ResizeExpectedRatio.Center);
  });

  test("clamps horizontal panes to their pixel floor", () => {
    const fixture = renderResizeHandle(SplitDirection.Horizontal);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalStart,
    );
    expectLastResize(fixture, ResizeExpectedRatio.HorizontalMinimum);

    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalEnd,
    );
    expectLastResize(fixture, ResizeExpectedRatio.HorizontalMaximum);
  });

  test("clamps vertical panes to their pixel floor", () => {
    const fixture = renderResizeHandle(SplitDirection.Vertical);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalStart,
    );
    expectLastResize(fixture, ResizeExpectedRatio.VerticalMinimum);

    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalEnd,
    );
    expectLastResize(fixture, ResizeExpectedRatio.VerticalMaximum);
  });

  test("captures, focuses, and releases the active pointer", () => {
    const fixture = renderResizeHandle();
    const bodyClassBefore = document.body.className;

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    expect(fixture.setPointerCapture).toHaveBeenCalledWith(
      ResizePointerId.Primary,
    );
    expect(document.activeElement).toBe(fixture.control);
    expect(document.body.className).not.toBe(bodyClassBefore);

    dispatchResizePointer(fixture.control, DomEvent.PointerUp);
    expect(fixture.releasePointerCapture).toHaveBeenCalledWith(
      ResizePointerId.Primary,
    );
    expect(document.body.className).toBe(bodyClassBefore);
  });

  test("releases pointer and body state when a drag is cancelled", () => {
    const fixture = renderResizeHandle();
    const bodyClassBefore = document.body.className;

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    dispatchResizePointer(fixture.control, DomEvent.PointerCancel);

    expect(fixture.releasePointerCapture).toHaveBeenCalledWith(
      ResizePointerId.Primary,
    );
    expect(document.body.className).toBe(bodyClassBefore);
  });

  test("releases pointer and body state when the handle unmounts", () => {
    const fixture = renderResizeHandle();
    const bodyClassBefore = document.body.className;

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    fixture.rendered.unmount();

    expect(fixture.releasePointerCapture).toHaveBeenCalledWith(
      ResizePointerId.Primary,
    );
    expect(document.body.className).toBe(bodyClassBefore);
  });

  test("uses the latest resize callback after a rerender", () => {
    const fixture = renderResizeHandle();
    const nextOnResize = mock<ResizeCallback>(() => undefined);
    fixture.rerender(nextOnResize);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalCenter,
    );

    expect(fixture.onResize).not.toHaveBeenCalled();
    expectResizeCallback(nextOnResize, ResizeExpectedRatio.Center);
  });
});
