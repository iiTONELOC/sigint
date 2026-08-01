import {
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { act } from "react";
import {
  PaneDropZone,
  PaneType,
  SplitDirection,
  type PaneTypeValue,
} from "@/panes/workspace/model";
import { flushReactUpdates } from "../../../../support/react";
import {
  MobileFixtureLabel,
  MobileFixtureNodeId,
  mobileLayout,
  mobileLeaf,
  mobileSplit,
  renderMobileFixture,
  requireBlockMoveButton,
  requireLeafHeader,
  requireLeafPopOutButton,
  requireMobileBlock,
  requireMoveZoneButtons,
  resetMobileFixture,
} from "./fixture";

enum MobileMovementExpectedCount {
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

function enterBlockMoveMode(): HTMLElement {
  const source = requireMobileBlock(MobileFixtureNodeId.DataTable);
  act(() => requireBlockMoveButton(source).click());
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
      chromeHidden: true,
      layout: movableLayout(PaneType.Globe, PaneType.DataTable),
    });
    const target = enterBlockMoveMode();
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
      chromeHidden: true,
      layout: movableLayout(PaneType.DataTable, PaneType.Dossier),
    });
    let controls = requireAllMoveControls(enterBlockMoveMode());

    act(() => controls.left.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      PaneDropZone.Left,
    );

    controls = requireAllMoveControls(enterBlockMoveMode());
    act(() => controls.right.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      PaneDropZone.Right,
    );
  });

  test("maps vertical actions to vertical insertion zones", async () => {
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: movableLayout(PaneType.DataTable, PaneType.Dossier),
    });
    let controls = requireAllMoveControls(enterBlockMoveMode());

    act(() => controls.above.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      PaneDropZone.Top,
    );

    controls = requireAllMoveControls(enterBlockMoveMode());
    act(() => controls.below.click());
    await flushReactUpdates();

    expect(fixture.callbacks.insertPaneBeside).toHaveBeenCalledWith(
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      PaneDropZone.Bottom,
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
      PaneDropZone.Bottom,
    );
  });
});
