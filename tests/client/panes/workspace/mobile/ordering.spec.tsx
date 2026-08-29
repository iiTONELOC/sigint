import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act } from "react";
import { PaneType, SplitDirection, type PaneTypeValue } from "@/panes/workspace/model/pane";
import {
  flushReactUpdates,
  waitForReact,
} from "../../../../support/react";
import {
  MobileFixtureIndex,
  MobileFixtureLabel,
  MobileFixtureNodeId,
  buttonsWithText,
  mobileBlockIds,
  mobileLayout,
  mobileLeaf,
  mobileSplit,
  renderMobileFixture,
  requireMobileBlock,
  resetMobileFixture,
} from "./fixture";

enum MobileOrderingExpectedCount {
  Single = 1,
  Three = 3,
}

enum MobileOrderingTestErrorMessage {
  TabMissing = "The expected mobile pane tab did not render.",
}

beforeEach(() => {
  resetMobileFixture();
});

function threeBlockLayout(
  middleId: MobileFixtureNodeId,
  middleType: PaneTypeValue,
) {
  return mobileLayout(
    mobileSplit(
      MobileFixtureNodeId.Root,
      SplitDirection.Vertical,
      mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
      mobileSplit(
        MobileFixtureNodeId.SecondaryRoot,
        SplitDirection.Vertical,
        mobileLeaf(middleId, middleType),
        mobileLeaf(MobileFixtureNodeId.Dossier, PaneType.Dossier),
      ),
    ),
  );
}

describe("PaneMobile block ordering", () => {
  test("inserts a replacement where the removed block was", async () => {
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: threeBlockLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });

    expect(mobileBlockIds()).toEqual([
      MobileFixtureNodeId.Globe,
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
    ]);

    fixture.rerender({
      layout: threeBlockLayout(
        MobileFixtureNodeId.Replacement,
        PaneType.AlertLog,
      ),
    });
    await waitForReact(
      () =>
        mobileBlockIds().at(MobileFixtureIndex.Second) ===
        MobileFixtureNodeId.Replacement,
    );

    expect(mobileBlockIds()).toEqual([
      MobileFixtureNodeId.Globe,
      MobileFixtureNodeId.Replacement,
      MobileFixtureNodeId.Dossier,
    ]);
  });

  test("appends a new block when no block was removed", async () => {
    const initial = mobileLayout(
      mobileSplit(
        MobileFixtureNodeId.Root,
        SplitDirection.Vertical,
        mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
        mobileLeaf(MobileFixtureNodeId.Dossier, PaneType.Dossier),
      ),
    );
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: initial,
    });
    const addedFirstInSource = mobileLayout(
      mobileSplit(
        MobileFixtureNodeId.SecondaryRoot,
        SplitDirection.Vertical,
        mobileLeaf(MobileFixtureNodeId.Added, PaneType.AlertLog),
        initial.root,
      ),
    );

    fixture.rerender({ layout: addedFirstInSource });
    await waitForReact(
      () =>
        mobileBlockIds().length === MobileOrderingExpectedCount.Three,
    );

    expect(mobileBlockIds()).toEqual([
      MobileFixtureNodeId.Globe,
      MobileFixtureNodeId.Dossier,
      MobileFixtureNodeId.Added,
    ]);
  });
});

describe("PaneMobile tab navigation", () => {
  test("scrolls the selected block into view", async () => {
    renderMobileFixture({
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
    const block = requireMobileBlock(MobileFixtureNodeId.DataTable);
    const scrollIntoView = mock(() => undefined);
    block.scrollIntoView = scrollIntoView;
    const tab = buttonsWithText(MobileFixtureLabel.DataTable).find(
      (button) => !block.contains(button),
    );
    if (!(tab instanceof HTMLButtonElement)) {
      throw new TypeError(MobileOrderingTestErrorMessage.TabMissing);
    }

    act(() => tab.click());
    await flushReactUpdates();

    expect(scrollIntoView).toHaveBeenCalledTimes(
      MobileOrderingExpectedCount.Single,
    );
  });
});
