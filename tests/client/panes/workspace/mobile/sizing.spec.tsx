import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act } from "react";
import {
  PaneMobileHeight,
  PaneMobileRatio,
  PaneType,
  SplitDirection,
} from "@/panes/workspace/model";
import { DomEvent } from "@/runtime";
import { flushReactUpdates } from "../../../../support/react";
import {
  MobileFixtureLabel,
  MobileFixtureNodeId,
  blockContentHeight,
  emitMobileIntersection,
  mobileLayout,
  mobileLeaf,
  mobileSplit,
  paneProbeElement,
  renderMobileFixture,
  requireBlockToggleButton,
  requireButtonWithText,
  requireHeightHandle,
  requireLeafHeader,
  requireLeafMinimizeButton,
  requireMobileBlock,
  requirePaneProbe,
  resetMobileFixture,
} from "./fixture";

enum MobileSizingMetric {
  MinimumPointerY = -1_000,
  ObserverTop = 10,
  PointerId = 7,
  StartPointerY = 500,
  ViewportHeight = 1_000,
  MaximumPointerY = 2_000,
}

type MobileSizingPointerEventName =
  | DomEvent.PointerDown
  | DomEvent.PointerMove
  | DomEvent.PointerUp;

beforeEach(() => {
  resetMobileFixture();
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: MobileSizingMetric.ViewportHeight,
  });
});

function twoBlockLayout() {
  return mobileLayout(
    mobileSplit(
      MobileFixtureNodeId.Root,
      SplitDirection.Vertical,
      mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
      mobileLeaf(MobileFixtureNodeId.DataTable, PaneType.DataTable),
    ),
  );
}

function pointerEvent(
  type: MobileSizingPointerEventName,
  clientY: number,
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    clientY,
    pointerId: MobileSizingMetric.PointerId,
  });
}

function maximumHeight(): number {
  return (
    MobileSizingMetric.ViewportHeight *
    PaneMobileRatio.MaximumViewportHeight
  );
}

describe("PaneMobile block sizing", () => {
  test("uses pane defaults and clamps height dragging", async () => {
    renderMobileFixture({
      chromeHidden: true,
      layout: twoBlockLayout(),
    });
    const globe = requireMobileBlock(MobileFixtureNodeId.Globe);
    const dataTable = requireMobileBlock(MobileFixtureNodeId.DataTable);
    const handle = requireHeightHandle(globe);
    const setPointerCapture = mock((_pointerId: number) => undefined);
    handle.setPointerCapture = setPointerCapture;

    expect(blockContentHeight(globe)).toBe(PaneMobileHeight.XXLarge);
    expect(blockContentHeight(dataTable)).toBe(
      PaneMobileHeight.Standard,
    );

    act(() => {
      handle.dispatchEvent(
        pointerEvent(
          DomEvent.PointerDown,
          MobileSizingMetric.StartPointerY,
        ),
      );
      document.dispatchEvent(
        pointerEvent(
          DomEvent.PointerMove,
          MobileSizingMetric.MinimumPointerY,
        ),
      );
    });
    await flushReactUpdates();

    expect(setPointerCapture).toHaveBeenCalledWith(
      MobileSizingMetric.PointerId,
    );
    expect(blockContentHeight(globe)).toBe(PaneMobileHeight.Minimum);

    act(() => {
      document.dispatchEvent(
        pointerEvent(
          DomEvent.PointerUp,
          MobileSizingMetric.MinimumPointerY,
        ),
      );
      handle.dispatchEvent(
        pointerEvent(
          DomEvent.PointerDown,
          MobileSizingMetric.StartPointerY,
        ),
      );
      document.dispatchEvent(
        pointerEvent(
          DomEvent.PointerMove,
          MobileSizingMetric.MaximumPointerY,
        ),
      );
    });
    await flushReactUpdates();

    expect(blockContentHeight(globe)).toBe(maximumHeight());
  });

  test("collapses and expands a complete block", async () => {
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: twoBlockLayout(),
    });
    const globe = requireMobileBlock(MobileFixtureNodeId.Globe);
    fixture.rerender({});
    await flushReactUpdates();
    act(() => {
      emitMobileIntersection(
        globe,
        true,
        MobileSizingMetric.ObserverTop,
      );
    });
    await flushReactUpdates();
    requirePaneProbe(PaneType.Globe);

    act(() => requireBlockToggleButton(globe).click());
    await flushReactUpdates();

    expect(paneProbeElement(PaneType.Globe)).toBeNull();

    act(() => requireBlockToggleButton(globe).click());
    await flushReactUpdates();

    expect(paneProbeElement(PaneType.Globe)).not.toBeNull();
  });
});

describe("PaneMobile split-leaf sizing", () => {
  test("collapses and expands one leaf inside a shallow split", async () => {
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: mobileLayout(
        mobileSplit(
          MobileFixtureNodeId.Root,
          SplitDirection.Horizontal,
          mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
          mobileLeaf(
            MobileFixtureNodeId.DataTable,
            PaneType.DataTable,
          ),
        ),
      ),
    });
    const block = requireMobileBlock(MobileFixtureNodeId.Root);
    fixture.rerender({});
    await flushReactUpdates();
    act(() => {
      emitMobileIntersection(
        block,
        true,
        MobileSizingMetric.ObserverTop,
      );
    });
    await flushReactUpdates();
    requirePaneProbe(PaneType.DataTable);
    const leafHeader = requireLeafHeader(
      block,
      MobileFixtureLabel.DataTable,
    );

    act(() => requireLeafMinimizeButton(leafHeader).click());
    await flushReactUpdates();

    expect(paneProbeElement(PaneType.DataTable)).toBeNull();

    act(() => {
      requireButtonWithText(MobileFixtureLabel.DataTable, block).click();
    });
    await flushReactUpdates();

    expect(paneProbeElement(PaneType.DataTable)).not.toBeNull();
  });
});
