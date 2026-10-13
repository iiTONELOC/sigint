import { Placement } from "@/layout-mode/model/layoutMode";
import {
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { act } from "react";
import {
  PaneType,
  SplitDirection,
  type PaneTypeValue,
} from "@/panes/workspace/model/pane";
import { MobileBlockActionLabel } from "@/panes/MobileBlockActions";
import { flushReactUpdates } from "../../../../support/react";
import {
  MobileFixtureLabel,
  MobileFixtureNodeId,
  mobileLayout,
  mobileLeaf,
  mobileSplit,
  openBlockActions,
  renderMobileFixture,
  requireCancelMoveButton,
  requireLeafHeader,
  requireLeafPopOutButton,
  requireMobileBlock,
  requireMoveZoneButtons,
  requireSheetAction,
  requireToolbar,
  resetMobileFixture,
} from "./fixture";

enum MobileMovementExpectedCount {
  NoZones = 0,
  FullWidthZones = 3,
  AllZones = 5,
}

enum MobileMovementTestErrorMessage {
  ControlsMissing = "The expected mobile movement controls did not render.",
}

type AllMoveControls = Readonly<{
  above: HTMLButtonElement;
  below: HTMLButtonElement;
  left: HTMLButtonElement;
  right: HTMLButtonElement;
}>;

beforeEach(() => {
  resetMobileFixture();
});

function movableLayout(
  sourceType: PaneTypeValue,
  targetType: PaneTypeValue,
) {
  return mobileLayout(
    mobileSplit(
      MobileFixtureNodeId.Root,
      SplitDirection.Vertical,
      mobileLeaf(MobileFixtureNodeId.DataTable, sourceType),
      mobileLeaf(MobileFixtureNodeId.Dossier, targetType),
    ),
  );
}

function enterBlockMoveMode(sourceType: PaneTypeValue): HTMLElement {
  openBlockActions(requireMobileBlock(MobileFixtureNodeId.DataTable), sourceType);
  act(() => requireSheetAction(MobileBlockActionLabel.Move).click());
  return requireMobileBlock(MobileFixtureNodeId.Dossier);
}

function requireAllMoveControls(target: HTMLElement): AllMoveControls {
  const controls = requireMoveZoneButtons(target);
  const [above, left, , right, below] = controls;
  if (
    controls.length !== MobileMovementExpectedCount.AllZones ||
    above === undefined ||
    left === undefined ||
    right === undefined ||
    below === undefined
  ) {
    throw new TypeError(MobileMovementTestErrorMessage.ControlsMissing);
  }
  return { above, below, left, right };
}

describe("PaneMobile block movement", () => {
  test("swaps a full-width pane without side insertion actions", async () => {
    const fixture = renderMobileFixture({
      layout: movableLayout(PaneType.Globe, PaneType.DataTable),
    });
    const target = enterBlockMoveMode(PaneType.Globe);
    const controls = requireMoveZoneButtons(target);
    const [, swap] = controls;

    expect(controls).toHaveLength(
      MobileMovementExpectedCount.FullWidthZones,
    );
    if (swap === undefined) {
      throw new TypeError(MobileMovementTestErrorMessage.ControlsMissing);
    }
    act(() => swap.click());
    await flushReactUpdates();

    expect(fixture.callbacks.swapPanes).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
    );
  });

  test("maps side actions to side insertion zones", async () => {
    const fixture = renderMobileFixture({
      layout: movableLayout(PaneType.DataTable, PaneType.Dossier),
    });
    let controls = requireAllMoveControls(enterBlockMoveMode(PaneType.DataTable));

    act(() => controls.left.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      Placement.Left,
    );

    controls = requireAllMoveControls(enterBlockMoveMode(PaneType.DataTable));
    act(() => controls.right.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      Placement.Right,
    );
  });

  test("maps vertical actions to vertical insertion zones", async () => {
    const fixture = renderMobileFixture({
      layout: movableLayout(PaneType.DataTable, PaneType.Dossier),
    });
    let controls = requireAllMoveControls(enterBlockMoveMode(PaneType.DataTable));

    act(() => controls.above.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      Placement.Top,
    );

    controls = requireAllMoveControls(enterBlockMoveMode(PaneType.DataTable));
    act(() => controls.below.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      Placement.Bottom,
    );
  });
});

describe("PaneMobile move cancellation", () => {
  test("cancels a move from the tab strip", async () => {
    renderMobileFixture({
      layout: movableLayout(PaneType.DataTable, PaneType.Dossier),
    });
    const target = enterBlockMoveMode(PaneType.DataTable);
    expect(requireMoveZoneButtons(target)).toHaveLength(
      MobileMovementExpectedCount.AllZones,
    );

    act(() => requireCancelMoveButton(requireToolbar(target)).click());
    await flushReactUpdates();

    expect(requireMoveZoneButtons(target)).toHaveLength(
      MobileMovementExpectedCount.NoZones,
    );
  });
});

describe("PaneMobile split-leaf movement", () => {
  test("pops one shallow-split leaf into its own block", async () => {
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
    const leafHeader = requireLeafHeader(
      block,
      MobileFixtureLabel.Globe,
    );

    act(() => requireLeafPopOutButton(leafHeader).click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.Globe,
      MobileFixtureNodeId.DataTable,
      Placement.Bottom,
    );
  });
});
