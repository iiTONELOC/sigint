import {
  afterEach,
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
import { ReactTestWaitTimeoutError } from "../../../../support/react/errors";
import {
  MobileFixtureIndex,
  MobileFixtureLabel,
  MobileFixtureNodeId,
  buttonWithText,
  buttonsWithText,
  emitDossierOpenRequest,
  emitMobileIntersection,
  mobileBlockIds,
  mobileLayout,
  mobileLeaf,
  mobileObservationCount,
  mobileSplit,
  paneProbeElement,
  renderMobileFixture,
  requireAddButton,
  requireButtonWithText,
  requireMobileBlock,
  requirePortal,
  requireToolbar,
  fixturePreset,
  requireViewsButton,
  requireViewTab,
  resetMobileFixture,
} from "./fixture";

enum MobileOrderingExpectedCount {
  Single = 1,
  Three = 3,
}

enum MobileVisibilityMetric {
  IdleMs = 100,
  ObserverTop = 0,
}

enum MobileOrderingFixtureName {
  Preset = "Fixture preset",
}

enum MobileOrderingTestErrorMessage {
  ScrollerMissing = "The mobile scroll column did not render.",
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

  test("shows an added block at its tree position", async () => {
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
      MobileFixtureNodeId.Added,
      MobileFixtureNodeId.Globe,
      MobileFixtureNodeId.Dossier,
    ]);
  });

  test("shows a moved pane at its new tree position", async () => {
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: threeBlockLayout(
        MobileFixtureNodeId.DataTable,
        PaneType.DataTable,
      ),
    });

    fixture.rerender({
      layout: mobileLayout(
        mobileSplit(
          MobileFixtureNodeId.Root,
          SplitDirection.Vertical,
          mobileLeaf(MobileFixtureNodeId.DataTable, PaneType.DataTable),
          mobileSplit(
            MobileFixtureNodeId.SecondaryRoot,
            SplitDirection.Vertical,
            mobileLeaf(MobileFixtureNodeId.Dossier, PaneType.Dossier),
            mobileLeaf(MobileFixtureNodeId.Replacement, PaneType.Globe),
          ),
        ),
      ),
    });
    await waitForReact(
      () =>
        mobileBlockIds().at(MobileFixtureIndex.First) ===
        MobileFixtureNodeId.DataTable,
    );

    expect(mobileBlockIds()).toEqual([
      MobileFixtureNodeId.DataTable,
      MobileFixtureNodeId.Dossier,
      MobileFixtureNodeId.Replacement,
    ]);
  });
});

describe("PaneMobile shell bar", () => {
  test("keeps VIEWS beside the shell chrome, ahead of the tabs", () => {
    renderMobileFixture({
      chrome: <output data-fixture-chrome="">chrome</output>,
      layout: mobileLayout(mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe)),
      presets: [fixturePreset(MobileOrderingFixtureName.Preset, globeLayout())],
    });
    const toolbar = requireToolbar(requireMobileBlock(MobileFixtureNodeId.Globe));
    const views = requireViewsButton(toolbar);
    const globeTab = requireViewTab(toolbar, PaneType.Globe);

    expect(views.compareDocumentPosition(globeTab) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(globeTab.parentElement?.contains(views)).toBe(false);
  });

  test("renders the shell chrome inside the tab bar", () => {
    renderMobileFixture({
      chrome: <output data-fixture-chrome="">chrome</output>,
      layout: mobileLayout(mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe)),
    });
    const toolbar = requireToolbar(requireMobileBlock(MobileFixtureNodeId.Globe));

    expect(toolbar.querySelector("[data-fixture-chrome]") !== null).toBe(true);
    expect(toolbar.firstElementChild?.hasAttribute("data-fixture-chrome")).toBe(true);
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

describe("PaneMobile block visibility", () => {
  function renderTableInView() {
    const fixture = renderMobileFixture({
      chromeHidden: true,
      layout: mobileLayout(
        mobileSplit(
          MobileFixtureNodeId.Root,
          SplitDirection.Vertical,
          mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
          mobileLeaf(MobileFixtureNodeId.DataTable, PaneType.DataTable),
        ),
      ),
    });
    act(() => {
      emitMobileIntersection(
        requireMobileBlock(MobileFixtureNodeId.DataTable),
        true,
        MobileVisibilityMetric.ObserverTop,
      );
    });
    return fixture;
  }

  test("renders a block body when the block first scrolls into view", async () => {
    renderTableInView();
    await flushReactUpdates();

    expect(paneProbeElement(PaneType.DataTable)).not.toBeNull();
  });

  test("stops observing blocks once the layout is idle", async () => {
    const fixture = renderTableInView();
    fixture.rerender({});
    await waitForReact(() => paneProbeElement(PaneType.DataTable) !== null);
    const observations = mobileObservationCount();

    await expect(
      waitForReact(
        () => mobileObservationCount() > observations,
        MobileVisibilityMetric.IdleMs,
      ),
    ).rejects.toThrow(ReactTestWaitTimeoutError);
  });
});

function globeLayout() {
  return mobileLayout(mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe));
}

function globeAndLayout(id: MobileFixtureNodeId, paneType: PaneTypeValue) {
  return mobileLayout(
    mobileSplit(
      MobileFixtureNodeId.Root,
      SplitDirection.Vertical,
      mobileLeaf(MobileFixtureNodeId.Globe, PaneType.Globe),
      mobileLeaf(id, paneType),
    ),
  );
}

function requireScroller(): HTMLElement {
  const scroller = requireMobileBlock(MobileFixtureNodeId.Globe).parentElement;
  if (!scroller) throw new TypeError(MobileOrderingTestErrorMessage.ScrollerMissing);
  return scroller;
}

describe("PaneMobile view placement", () => {
  const scrollIntoView = HTMLElement.prototype.scrollIntoView;

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  test("keeps the view when a saved layout replaces the default", async () => {
    const scrolled = mock(() => undefined);
    HTMLElement.prototype.scrollIntoView = scrolled;
    const fixture = renderMobileFixture({ chromeHidden: true, layout: globeLayout() });

    fixture.rerender({ layout: globeAndLayout(MobileFixtureNodeId.Dossier, PaneType.Dossier) });

    await expect(
      waitForReact(() => scrolled.mock.calls.length > 0, MobileVisibilityMetric.IdleMs),
    ).rejects.toThrow(ReactTestWaitTimeoutError);
  });

  test("reveals a pane the user adds", async () => {
    const scrolled: Element[] = [];
    HTMLElement.prototype.scrollIntoView = function scrollIntoViewProbe(this: HTMLElement) {
      scrolled.push(this);
    };
    const fixture = renderMobileFixture({ availableTypes: [PaneType.NewsFeed], layout: globeLayout() });

    act(() => requireAddButton(requireToolbar(requireMobileBlock(MobileFixtureNodeId.Globe))).click());
    await waitForReact(() => buttonWithText(MobileFixtureLabel.NewsFeed) !== null);
    act(() => {
      requireButtonWithText(MobileFixtureLabel.NewsFeed, requirePortal(fixture.rendered.container)).click();
    });
    fixture.rerender({ layout: globeAndLayout(MobileFixtureNodeId.Added, PaneType.NewsFeed) });

    await waitForReact(() => scrolled.length > 0);

    expect(scrolled).toEqual([requireMobileBlock(MobileFixtureNodeId.Added)]);
  });

  test("makes a pane the user adds the active tab", async () => {
    HTMLElement.prototype.scrollIntoView = mock(() => undefined);
    const fixture = renderMobileFixture({ availableTypes: [PaneType.NewsFeed], layout: globeLayout() });

    act(() => requireAddButton(requireToolbar(requireMobileBlock(MobileFixtureNodeId.Globe))).click());
    await waitForReact(() => buttonWithText(MobileFixtureLabel.NewsFeed) !== null);
    act(() => {
      requireButtonWithText(MobileFixtureLabel.NewsFeed, requirePortal(fixture.rendered.container)).click();
    });
    fixture.rerender({ layout: globeAndLayout(MobileFixtureNodeId.Added, PaneType.NewsFeed) });

    const toolbar = requireToolbar(requireMobileBlock(MobileFixtureNodeId.Added));
    await waitForReact(
      () => requireViewTab(toolbar, PaneType.NewsFeed).getAttribute("aria-haspopup") === "dialog",
    );

    expect(requireViewTab(toolbar, PaneType.NewsFeed).getAttribute("aria-expanded")).toBe("false");
    expect(requireViewTab(toolbar, PaneType.Globe).hasAttribute("aria-haspopup")).toBe(false);
  });

  test("reveals the dossier when it opens", async () => {
    const fixture = renderMobileFixture({ chromeHidden: true, layout: globeLayout() });
    const scrollTo = mock(() => undefined);
    requireScroller().scrollTo = scrollTo;

    act(() => emitDossierOpenRequest());
    fixture.rerender({ layout: globeAndLayout(MobileFixtureNodeId.Dossier, PaneType.Dossier) });
    await flushReactUpdates();
    expect(scrollTo).toHaveBeenCalledTimes(MobileOrderingExpectedCount.Single);

    act(() => emitDossierOpenRequest());
    expect(scrollTo).toHaveBeenCalledTimes(MobileOrderingExpectedCount.Single + MobileOrderingExpectedCount.Single);
  });
});
