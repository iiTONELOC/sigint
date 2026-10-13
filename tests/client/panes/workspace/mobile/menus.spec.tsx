import {
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { act } from "react";
import { MobileBlockActionLabel } from "@/panes/MobileBlockActions";
import {
  PaneLayoutRatio,
  PaneType,
  SplitDirection,
  type PaneTypeValue,
} from "@/panes/workspace/model/pane";
import { DomEvent } from "@/runtime";
import {
  flushReactUpdates,
  waitForReact,
} from "../../../../support/react";
import {
  MobileFixtureIndex,
  MobileFixtureLabel,
  MobileFixtureNodeId,
  buttonWithText,
  emitMobileIntersection,
  fixturePreset,
  mobileLayout,
  mobileLeaf,
  mobileSplit,
  openBlockActions,
  renderMobileFixture,
  requireAddButton,
  requireButtonWithText,
  requireMobileBlock,
  requirePortal,
  requireRestoreButton,
  requireSheetAction,
  requireSheetCloseButton,
  requireToolbar,
  requireViewsButton,
  resetMobileFixture,
} from "./fixture";

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

describe("PaneMobile view actions", () => {
  test("adds a view beside the active view", async () => {
    const fixture = renderMobileFixture({
      availableTypes: [PaneType.Dossier, PaneType.AlertLog],
      layout: singlePaneLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });

    openBlockActions(
      requireMobileBlock(MobileFixtureNodeId.DataTable),
      PaneType.DataTable,
    );
    act(() => requireSheetAction(MobileBlockActionLabel.AddBeside).click());
    await waitForReact(
      () => buttonWithText(MobileFixtureLabel.Dossier) !== null,
    );
    act(() => requireButtonWithText(MobileFixtureLabel.Dossier).click());
    await flushReactUpdates();

    expect(fixture.callbacks.splitPane).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      SplitDirection.Horizontal,
      PaneType.Dossier,
    );
    expect(buttonWithText(MobileBlockActionLabel.AddBeside)).toBeNull();
  });

  test("keeps a full-width view vertical and splits at once with one type", async () => {
    const fixture = renderMobileFixture({
      availableTypes: [PaneType.AlertLog],
      layout: singlePaneLayout(
        MobileFixtureNodeId.Globe,
        PaneType.Globe,
      ),
    });

    openBlockActions(
      requireMobileBlock(MobileFixtureNodeId.Globe),
      PaneType.Globe,
    );

    expect(buttonWithText(MobileBlockActionLabel.AddBeside)).toBeNull();
    act(() => requireSheetAction(MobileBlockActionLabel.AddBelow).click());
    await flushReactUpdates();

    expect(fixture.callbacks.splitPane).toHaveBeenCalledWith(
      MobileFixtureNodeId.Globe,
      SplitDirection.Vertical,
      PaneType.AlertLog,
    );
  });

  test("changes the active view through its actions", async () => {
    const fixture = renderMobileFixture({
      layout: singlePaneLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });

    openBlockActions(
      requireMobileBlock(MobileFixtureNodeId.DataTable),
      PaneType.DataTable,
    );
    act(() => requireSheetAction(MobileBlockActionLabel.ChangeView).click());
    await waitForReact(
      () => buttonWithText(MobileFixtureLabel.AlertLog) !== null,
    );
    act(() => requireButtonWithText(MobileFixtureLabel.AlertLog).click());
    await flushReactUpdates();

    expect(fixture.callbacks.changePaneType).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      PaneType.AlertLog,
    );
  });

  test("renders the actions sheet on the document body", () => {
    renderMobileFixture({
      layout: singlePaneLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });

    openBlockActions(
      requireMobileBlock(MobileFixtureNodeId.DataTable),
      PaneType.DataTable,
    );
    const sheet = requireSheetAction(MobileBlockActionLabel.ChangeView).closest("dialog");

    expect(sheet?.parentElement?.parentElement === document.body).toBe(true);
  });

  test("closes the actions sheet from its backdrop", async () => {
    renderMobileFixture({
      layout: singlePaneLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });

    openBlockActions(
      requireMobileBlock(MobileFixtureNodeId.DataTable),
      PaneType.DataTable,
    );
    requireSheetAction(MobileBlockActionLabel.ChangeView);
    act(() => requireSheetCloseButton().click());
    await flushReactUpdates();

    expect(buttonWithText(MobileBlockActionLabel.ChangeView)).toBeNull();
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
