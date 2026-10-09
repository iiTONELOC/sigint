import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act } from "react";
import {
  PANE_MOBILE_MINIMUM_HEIGHT,
  PaneMobileRatio,
  PaneType,
  SplitDirection,
} from "@/panes/workspace/model/pane";
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

enum MobileScreenClass {
  Full = "h-[100cqh]",
  Half = "h-[50cqh]",
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
  test("opens the globe one screen tall and a table half a screen tall", () => {
    renderMobileFixture({ chromeHidden: true, layout: twoBlockLayout() });

    expect(requireMobileBlock(MobileFixtureNodeId.Globe).className).toContain(MobileScreenClass.Full);
    expect(requireMobileBlock(MobileFixtureNodeId.DataTable).className).toContain(MobileScreenClass.Half);
  });

  test("clamps height dragging to the floor and the viewport share", async () => {
    renderMobileFixture({ chromeHidden: true, layout: twoBlockLayout() });
    const globe = requireMobileBlock(MobileFixtureNodeId.Globe);
    const handle = requireHeightHandle(globe);
    const setPointerCapture = mock((_pointerId: number) => undefined);
    handle.setPointerCapture = setPointerCapture;

    act(() => {
      handle.dispatchEvent(pointerEvent(DomEvent.PointerDown, MobileSizingMetric.StartPointerY));
      document.dispatchEvent(pointerEvent(DomEvent.PointerMove, MobileSizingMetric.MinimumPointerY));
    });
    await flushReactUpdates();

    expect(setPointerCapture).toHaveBeenCalledWith(MobileSizingMetric.PointerId);
    expect(blockContentHeight(globe)).toBe(PANE_MOBILE_MINIMUM_HEIGHT);
    expect(globe.className).not.toContain(MobileScreenClass.Full);

    act(() => {
      document.dispatchEvent(pointerEvent(DomEvent.PointerUp, MobileSizingMetric.MinimumPointerY));
      handle.dispatchEvent(pointerEvent(DomEvent.PointerDown, MobileSizingMetric.StartPointerY));
      document.dispatchEvent(pointerEvent(DomEvent.PointerMove, MobileSizingMetric.MaximumPointerY));
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
