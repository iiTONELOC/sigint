import {
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { act } from "react";
import {
  PaneLayoutRatio,
  PaneType,
  SplitDirection,
  type PaneTypeValue,
} from "@/panes/workspace/model";
import { DomEvent } from "@/runtime";
import {
  flushReactUpdates,
  waitForReact,
} from "../../../../support/react";
import {
  MobileFixtureIndex,
  MobileFixtureLabel,
  MobileFixtureNodeId,
  blockHeaderButtons,
  buttonWithText,
  emitMobileIntersection,
  fixturePreset,
  mobileLayout,
  mobileLeaf,
  mobileSplit,
  renderMobileFixture,
  requireAddButton,
  requireBlockTypeButton,
  requireButtonWithText,
  requireMobileBlock,
  requirePortal,
  requireRestoreButton,
  requireSideSplitButton,
  requireToolbar,
  requireVerticalSplitButton,
  requireViewsButton,
  resetMobileFixture,
} from "./fixture";

enum MobileMenuExpectedCount {
  FullWidthControls = 4,
}

enum MobileMenuObserverTop {
  Second = 20,
  First = 100,
}

enum MobileMenuPresetName {
  Fixture = "mobile-fixture-preset",
}

beforeEach(() => {
  resetMobileFixture();
});

function singlePaneLayout(
  id: MobileFixtureNodeId,
  paneType: PaneTypeValue,
) {
  return mobileLayout(mobileLeaf(id, paneType));
}

describe("PaneMobile split and type menus", () => {
  test("selects a type for a side-by-side split", async () => {
    const fixture = renderMobileFixture({
      availableTypes: [PaneType.Dossier, PaneType.AlertLog],
      chromeHidden: true,
      layout: singlePaneLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });
    const block = requireMobileBlock(MobileFixtureNodeId.DataTable);

    act(() => requireSideSplitButton(block).click());
    await waitForReact(
      () => buttonWithText(MobileFixtureLabel.Dossier) !== null,
    );
    act(() => {
      requireButtonWithText(
        MobileFixtureLabel.Dossier,
        requirePortal(fixture.rendered.container),
      ).click();
    });
    await flushReactUpdates();

    expect(fixture.callbacks.splitPane).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      SplitDirection.Horizontal,
      PaneType.Dossier,
    );
  });

  test("keeps a full-width pane vertical when one type is available", async () => {
    const fixture = renderMobileFixture({
      availableTypes: [PaneType.AlertLog],
      chromeHidden: true,
      layout: singlePaneLayout(
        MobileFixtureNodeId.Globe,
        PaneType.Globe,
      ),
    });
    const block = requireMobileBlock(MobileFixtureNodeId.Globe);

    expect(blockHeaderButtons(block)).toHaveLength(
      MobileMenuExpectedCount.FullWidthControls,
    );
    act(() => requireVerticalSplitButton(block).click());
    await flushReactUpdates();

    expect(fixture.callbacks.splitPane).toHaveBeenCalledWith(
      MobileFixtureNodeId.Globe,
      SplitDirection.Vertical,
      PaneType.AlertLog,
    );
  });

  test("changes the selected leaf through its type menu", async () => {
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: singlePaneLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });
    const block = requireMobileBlock(MobileFixtureNodeId.DataTable);

    act(() => {
      requireBlockTypeButton(
        block,
        MobileFixtureLabel.DataTable,
      ).click();
    });
    await waitForReact(
      () => buttonWithText(MobileFixtureLabel.AlertLog) !== null,
    );
    act(() => {
      requireButtonWithText(
        MobileFixtureLabel.AlertLog,
        requirePortal(fixture.rendered.container),
      ).click();
    });
    await flushReactUpdates();

    expect(fixture.callbacks.changePaneType).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      PaneType.AlertLog,
    );
  });
});

describe("PaneMobile add and restore controls", () => {
  test("adds below the topmost active block", async () => {
    const fixture = renderMobileFixture({
      availableTypes: [PaneType.NewsFeed],
      layout: mobileLayout(
        mobileSplit(
          MobileFixtureNodeId.Root,
          SplitDirection.Vertical,
          mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
          mobileLeaf(
            MobileFixtureNodeId.DataTable,
            PaneType.DataTable,
          ),
        ),
      ),
    });
    const globe = requireMobileBlock(MobileFixtureNodeId.Globe);
    const dataTable = requireMobileBlock(MobileFixtureNodeId.DataTable);

    act(() => {
      emitMobileIntersection(
        globe,
        true,
        MobileMenuObserverTop.First,
      );
      emitMobileIntersection(
        dataTable,
        true,
        MobileMenuObserverTop.Second,
      );
    });
    await flushReactUpdates();

    act(() => requireAddButton(requireToolbar(globe)).click());
    await waitForReact(
      () => buttonWithText(MobileFixtureLabel.NewsFeed) !== null,
    );
    act(() => {
      requireButtonWithText(
        MobileFixtureLabel.NewsFeed,
        requirePortal(fixture.rendered.container),
      ).click();
    });
    await flushReactUpdates();

    expect(fixture.callbacks.splitPane).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      SplitDirection.Vertical,
      PaneType.NewsFeed,
    );
  });

  test("restores a persisted minimized pane", async () => {
    const fixture = renderMobileFixture({
      layout: mobileLayout(
        mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
        [
          {
            dir: SplitDirection.Horizontal,
            id: MobileFixtureNodeId.Minimized,
            paneType: PaneType.Dossier,
            ratio: PaneLayoutRatio.Equal,
            siblingId: MobileFixtureNodeId.Globe,
            wasSecond: true,
          },
        ],
      ),
    });
    const globe = requireMobileBlock(MobileFixtureNodeId.Globe);

    act(() => requireRestoreButton(requireToolbar(globe)).click());
    await flushReactUpdates();

    expect(fixture.callbacks.restorePane).toHaveBeenCalledWith(
      MobileFixtureIndex.First,
    );
  });
});

describe("PaneMobile preset integration", () => {
  test("loads a selected mobile layout preset", async () => {
    const preset = fixturePreset(
      MobileMenuPresetName.Fixture,
      singlePaneLayout(
        MobileFixtureNodeId.Dossier,
        PaneType.Dossier,
      ),
    );
    const fixture = renderMobileFixture({
      layout: singlePaneLayout(
        MobileFixtureNodeId.Globe,
        PaneType.Globe,
      ),
      presets: [preset],
    });
    const globe = requireMobileBlock(MobileFixtureNodeId.Globe);

    act(() => {
      requireViewsButton(requireToolbar(globe)).dispatchEvent(
        new MouseEvent(DomEvent.MouseDown, { bubbles: true }),
      );
    });
    await waitForReact(
      () => buttonWithText(MobileMenuPresetName.Fixture) !== null,
    );
    act(() => {
      requireButtonWithText(MobileMenuPresetName.Fixture).click();
    });
    await flushReactUpdates();

    expect(fixture.callbacks.onLoadPreset).toHaveBeenCalledWith(preset);
  });
});
