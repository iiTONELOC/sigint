import { describe, expect, mock, test, type Mock } from "bun:test";
import { SplitDirection } from "@/panes/workspace/model/pane";
import { DomEvent } from "@/runtime";
import {
  dispatchResizePointer,
  renderResizeHandle,
  type ResizeCallback,
  ResizeExpectedRatio,
  ResizeFixtureSplitId,
  ResizePointerCoordinate,
  ResizePointerId,
} from "./ResizeHandle.fixture";

function lastResize(callback: Mock<ResizeCallback>): readonly [string, number] | undefined {
  return callback.mock.calls.at(-1);
}

describe("ResizeHandle pointer interaction", () => {
  test("reports the horizontal ratio and split identity", () => {
    const fixture = renderResizeHandle(SplitDirection.Horizontal);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown, ResizePointerCoordinate.HorizontalCenter);
    dispatchResizePointer(fixture.control, DomEvent.PointerMove, ResizePointerCoordinate.HorizontalStep);

    expect(lastResize(fixture.onResize)?.[0]).toBe(ResizeFixtureSplitId.Primary);
    expect(lastResize(fixture.onResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.Increased);
  });

  test("reports the vertical ratio and split identity", () => {
    const fixture = renderResizeHandle(SplitDirection.Vertical);

    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerDown,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalCenter,
    );
    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalStep,
    );

    expect(lastResize(fixture.onResize)?.[0]).toBe(ResizeFixtureSplitId.Primary);
    expect(lastResize(fixture.onResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.Increased);
  });

  test("keeps the ratio when pressed off the line without moving", () => {
    const fixture = renderResizeHandle(SplitDirection.Horizontal);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown, ResizePointerCoordinate.HorizontalOffLine);
    dispatchResizePointer(fixture.control, DomEvent.PointerMove, ResizePointerCoordinate.HorizontalOffLine);

    expect(lastResize(fixture.onResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.Center);
  });

  test("clamps horizontal panes to their pixel floor", () => {
    const fixture = renderResizeHandle(SplitDirection.Horizontal);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown, ResizePointerCoordinate.HorizontalCenter);
    dispatchResizePointer(fixture.control, DomEvent.PointerMove, ResizePointerCoordinate.HorizontalStart);
    expect(lastResize(fixture.onResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.HorizontalMinimum);

    dispatchResizePointer(fixture.control, DomEvent.PointerMove, ResizePointerCoordinate.HorizontalEnd);
    expect(lastResize(fixture.onResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.HorizontalMaximum);
  });

  test("clamps vertical panes to their pixel floor", () => {
    const fixture = renderResizeHandle(SplitDirection.Vertical);

    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerDown,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalCenter,
    );
    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalStart,
    );
    expect(lastResize(fixture.onResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.VerticalMinimum);

    dispatchResizePointer(
      fixture.control,
      DomEvent.PointerMove,
      ResizePointerCoordinate.HorizontalStart,
      ResizePointerCoordinate.VerticalEnd,
    );
    expect(lastResize(fixture.onResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.VerticalMaximum);
  });

  test("captures, focuses, and releases the active pointer", () => {
    const fixture = renderResizeHandle();
    const bodyClassBefore = document.body.className;

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    expect(fixture.setPointerCapture).toHaveBeenCalledWith(ResizePointerId.Primary);
    expect(document.activeElement).toBe(fixture.control);
    expect(document.body.className).not.toBe(bodyClassBefore);

    dispatchResizePointer(fixture.control, DomEvent.PointerUp);
    expect(fixture.releasePointerCapture).toHaveBeenCalledWith(ResizePointerId.Primary);
    expect(document.body.className).toBe(bodyClassBefore);
  });

  test("releases pointer and body state when a drag is cancelled", () => {
    const fixture = renderResizeHandle();
    const bodyClassBefore = document.body.className;

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    dispatchResizePointer(fixture.control, DomEvent.PointerCancel);

    expect(fixture.releasePointerCapture).toHaveBeenCalledWith(ResizePointerId.Primary);
    expect(document.body.className).toBe(bodyClassBefore);
  });

  test("releases pointer and body state when the handle unmounts", () => {
    const fixture = renderResizeHandle();
    const bodyClassBefore = document.body.className;

    dispatchResizePointer(fixture.control, DomEvent.PointerDown);
    fixture.rendered.unmount();

    expect(fixture.releasePointerCapture).toHaveBeenCalledWith(ResizePointerId.Primary);
    expect(document.body.className).toBe(bodyClassBefore);
  });

  test("uses the latest resize callback after a rerender", () => {
    const fixture = renderResizeHandle();
    const nextOnResize = mock<ResizeCallback>(() => undefined);
    fixture.rerender(nextOnResize);

    dispatchResizePointer(fixture.control, DomEvent.PointerDown, ResizePointerCoordinate.HorizontalCenter);
    dispatchResizePointer(fixture.control, DomEvent.PointerMove, ResizePointerCoordinate.HorizontalCenter);

    expect(fixture.onResize).not.toHaveBeenCalled();
    expect(lastResize(nextOnResize)?.[1]).toBeCloseTo(ResizeExpectedRatio.Center);
  });
});
