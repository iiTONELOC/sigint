import { describe, expect, test } from "bun:test";
import {
  PaneDropZone,
  PaneLayoutRatio,
  PaneNodeType,
  PaneType,
  SplitDirection,
  type PaneTypeValue,
} from "@/panes/workspace/model/pane";
import {
  changePaneTypeInLayout,
  closePaneLayout,
  insertPaneBesideInLayout,
  minimizePaneLayout,
  openDossierInLayout,
  resizePaneLayout,
  restorePaneLayout,
  splitPaneLayout,
  swapPanesInLayout,
  type PanePlacementContext,
} from "@/panes/workspace/utils/operations";
import {
  collectLeafTypes,
  leaf,
  leafCount,
  split,
  type LayoutNode,
  type LayoutState,
  type LeafNode,
  type SplitNode,
} from "@/panes/paneTree";

enum PaneFixtureCount {
  Empty = 0,
  Single = 1,
  Pair = 2,
  Triple = 3,
}

enum PaneFixtureId {
  Missing = "missing-pane",
}

enum PaneFixtureRatio {
  Custom = 0.6,
}

enum PaneOperationTestError {
  LeafRequired = "The pane operation did not return a leaf.",
  SplitRequired = "The pane operation did not return a split.",
}

function layout(root: LayoutNode): LayoutState {
  return { minimized: [], root };
}

function requireLeaf(node: LayoutNode): LeafNode {
  if (node.type !== PaneNodeType.Leaf) {
    throw new Error(PaneOperationTestError.LeafRequired);
  }
  return node;
}

function requireSplit(node: LayoutNode): SplitNode {
  if (node.type !== PaneNodeType.Split) {
    throw new Error(PaneOperationTestError.SplitRequired);
  }
  return node;
}

describe("splitPaneLayout", () => {
  test("uses the detail ratio for dossier and video panes", () => {
    const globe = leaf(PaneType.Globe);
    const dossierLayout = splitPaneLayout(
      layout(globe),
      globe.id,
      SplitDirection.Horizontal,
      PaneType.Dossier,
    );
    expect(requireSplit(dossierLayout.root).ratio).toBe(
      PaneLayoutRatio.Detail,
    );

    const videoLayout = splitPaneLayout(
      layout(globe),
      globe.id,
      SplitDirection.Vertical,
      PaneType.VideoFeed,
    );
    expect(requireSplit(videoLayout.root).ratio).toBe(
      PaneLayoutRatio.Detail,
    );
  });

  test("uses the equal ratio for other panes", () => {
    const globe = leaf(PaneType.Globe);
    const result = splitPaneLayout(
      layout(globe),
      globe.id,
      SplitDirection.Vertical,
      PaneType.DataTable,
    );
    const root = requireSplit(result.root);
    expect(root.direction).toBe(SplitDirection.Vertical);
    expect(root.ratio).toBe(PaneLayoutRatio.Equal);
  });

  test("returns the same layout for a missing target", () => {
    const initial = layout(leaf(PaneType.Globe));
    expect(
      splitPaneLayout(
        initial,
        PaneFixtureId.Missing,
        SplitDirection.Horizontal,
        PaneType.Dossier,
      ),
    ).toBe(initial);
  });
});

describe("closePaneLayout", () => {
  test("promotes the remaining sibling", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const result = closePaneLayout(
      layout(split(SplitDirection.Horizontal, globe, dossier)),
      dossier.id,
    );

    expect(requireLeaf(result.root).paneType).toBe(PaneType.Globe);
  });

  test("returns the default layout after the final pane closes", () => {
    const dossier = leaf(PaneType.Dossier);
    const result = closePaneLayout(layout(dossier), dossier.id);

    expect(requireLeaf(result.root).paneType).toBe(PaneType.Globe);
    expect(result.minimized).toHaveLength(PaneFixtureCount.Empty);
  });

  test("collapses a nested split", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const table = leaf(PaneType.DataTable);
    const initial = layout(
      split(
        SplitDirection.Horizontal,
        globe,
        split(SplitDirection.Vertical, dossier, table),
      ),
    );

    const result = closePaneLayout(initial, table.id);
    expect(leafCount(result.root)).toBe(PaneFixtureCount.Pair);
    expect(collectLeafTypes(result.root).has(PaneType.DataTable)).toBe(false);
  });
});

describe("minimizePaneLayout and restorePaneLayout", () => {
  test("stores the parent metadata", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const initial = layout(
      split(
        SplitDirection.Horizontal,
        globe,
        dossier,
        PaneLayoutRatio.Detail,
      ),
    );

    const result = minimizePaneLayout(
      initial,
      dossier.id,
      PaneType.Dossier,
    );
    expect(leafCount(result.root)).toBe(PaneFixtureCount.Single);
    expect(result.minimized).toHaveLength(PaneFixtureCount.Single);
    expect(result.minimized[0]).toEqual({
      dir: SplitDirection.Horizontal,
      id: dossier.id,
      paneType: PaneType.Dossier,
      ratio: PaneLayoutRatio.Detail,
      siblingId: globe.id,
      wasSecond: true,
    });
  });

  test("restores beside the original sibling", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const minimized = minimizePaneLayout(
      layout(
        split(
          SplitDirection.Vertical,
          globe,
          dossier,
          PaneFixtureRatio.Custom,
        ),
      ),
      dossier.id,
      PaneType.Dossier,
    );

    const restored = restorePaneLayout(
      minimized,
      PaneFixtureCount.Empty,
    );
    const root = requireSplit(restored.root);
    expect(root.direction).toBe(SplitDirection.Vertical);
    expect(root.ratio).toBe(PaneFixtureRatio.Custom);
    expect(collectLeafTypes(root)).toEqual(
      new Set([PaneType.Globe, PaneType.Dossier]),
    );
    expect(restored.minimized).toHaveLength(PaneFixtureCount.Empty);
  });

  test("restores at the root when the original sibling is gone", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const table = leaf(PaneType.DataTable);
    const initial = layout(
      split(
        SplitDirection.Horizontal,
        globe,
        split(SplitDirection.Vertical, dossier, table),
      ),
    );
    const minimized = minimizePaneLayout(
      initial,
      dossier.id,
      PaneType.Dossier,
    );
    const withoutSibling = closePaneLayout(minimized, table.id);
    const restored = restorePaneLayout(
      withoutSibling,
      PaneFixtureCount.Empty,
    );

    expect(leafCount(restored.root)).toBe(PaneFixtureCount.Pair);
    expect(collectLeafTypes(restored.root).has(PaneType.Dossier)).toBe(true);
  });

  test("returns the same layout for a missing minimized entry", () => {
    const initial = layout(leaf(PaneType.Globe));
    expect(
      restorePaneLayout(initial, PaneFixtureCount.Triple),
    ).toBe(initial);
  });
});

describe("resizePaneLayout and changePaneTypeInLayout", () => {
  test("updates a split ratio", () => {
    const root = split(
      SplitDirection.Horizontal,
      leaf(PaneType.Globe),
      leaf(PaneType.Dossier),
    );
    const result = resizePaneLayout(
      layout(root),
      root.id,
      PaneFixtureRatio.Custom,
    );

    expect(requireSplit(result.root).ratio).toBe(PaneFixtureRatio.Custom);
  });

  test("replaces the pane type and leaf identity", () => {
    const dossier = leaf(PaneType.Dossier);
    const result = changePaneTypeInLayout(
      layout(dossier),
      dossier.id,
      PaneType.IntelFeed,
    );
    const changed = requireLeaf(result.root);

    expect(changed.paneType).toBe(PaneType.IntelFeed);
    expect(changed.id).not.toBe(dossier.id);
  });

  test("swaps instead of duplicating an open pane type", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const result = changePaneTypeInLayout(
      layout(split(SplitDirection.Horizontal, globe, dossier)),
      dossier.id,
      PaneType.Globe,
    );
    const root = requireSplit(result.root);

    expect(requireLeaf(root.children[0]).paneType).toBe(PaneType.Dossier);
    expect(requireLeaf(root.children[1]).paneType).toBe(PaneType.Globe);
  });
});

describe("swapPanesInLayout", () => {
  test("swaps types without moving leaf identities", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const initial = layout(
      split(SplitDirection.Horizontal, globe, dossier),
    );
    const result = swapPanesInLayout(initial, globe.id, dossier.id);
    const root = requireSplit(result.root);

    expect(requireLeaf(root.children[0]).id).toBe(globe.id);
    expect(requireLeaf(root.children[0]).paneType).toBe(PaneType.Dossier);
    expect(requireLeaf(root.children[1]).id).toBe(dossier.id);
    expect(requireLeaf(root.children[1]).paneType).toBe(PaneType.Globe);
  });

  test("returns the same layout for a self swap", () => {
    const globe = leaf(PaneType.Globe);
    const initial = layout(globe);
    expect(swapPanesInLayout(initial, globe.id, globe.id)).toBe(initial);
  });
});

describe("insertPaneBesideInLayout", () => {
  function paneOrder(
    zone: PaneDropZone.Left | PaneDropZone.Right,
  ): readonly PaneTypeValue[] {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const table = leaf(PaneType.DataTable);
    const initial = layout(
      split(
        SplitDirection.Horizontal,
        globe,
        split(SplitDirection.Vertical, dossier, table),
      ),
    );
    const result = insertPaneBesideInLayout(
      initial,
      globe.id,
      table.id,
      zone,
    );
    const root = requireSplit(result.root);
    const inserted = requireSplit(root.children[1]);
    return [
      requireLeaf(inserted.children[0]).paneType,
      requireLeaf(inserted.children[1]).paneType,
    ];
  }

  test("inserts left and right in source order", () => {
    expect(paneOrder(PaneDropZone.Left)).toEqual([
      PaneType.Globe,
      PaneType.DataTable,
    ]);
    expect(paneOrder(PaneDropZone.Right)).toEqual([
      PaneType.DataTable,
      PaneType.Globe,
    ]);
  });

  test("inserts above with a vertical split", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const result = insertPaneBesideInLayout(
      layout(split(SplitDirection.Horizontal, globe, dossier)),
      globe.id,
      dossier.id,
      PaneDropZone.Top,
    );
    const root = requireSplit(result.root);

    expect(root.direction).toBe(SplitDirection.Vertical);
    expect(requireLeaf(root.children[0]).paneType).toBe(PaneType.Globe);
    expect(requireLeaf(root.children[1]).paneType).toBe(PaneType.Dossier);
  });

  test("inserts below with the target first", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const result = insertPaneBesideInLayout(
      layout(split(SplitDirection.Horizontal, globe, dossier)),
      globe.id,
      dossier.id,
      PaneDropZone.Bottom,
    );
    const root = requireSplit(result.root);

    expect(root.direction).toBe(SplitDirection.Vertical);
    expect(requireLeaf(root.children[0]).paneType).toBe(PaneType.Dossier);
    expect(requireLeaf(root.children[1]).paneType).toBe(PaneType.Globe);
  });

  test("returns the same layout for a self insert", () => {
    const globe = leaf(PaneType.Globe);
    const initial = layout(globe);
    expect(
      insertPaneBesideInLayout(
        initial,
        globe.id,
        globe.id,
        PaneDropZone.Left,
      ),
    ).toBe(initial);
  });
});

enum DossierFixtureWidth {
  Narrow = 1120,
  Unfit = 600,
  Wide = 1600,
}

function desktopContext(availableWidth: number): PanePlacementContext {
  return { availableWidth, isMobile: false };
}

describe("openDossierInLayout", () => {
  test("opens beside the globe at the preferred ratio when wide", () => {
    const result = openDossierInLayout(
      layout(leaf(PaneType.Globe)),
      desktopContext(DossierFixtureWidth.Wide),
    );
    const root = requireSplit(result.root);

    expect(root.direction).toBe(SplitDirection.Horizontal);
    expect(root.ratio).toBe(PaneLayoutRatio.Detail);
  });

  test("steps the ratio down to keep the dossier beside", () => {
    const result = openDossierInLayout(
      layout(leaf(PaneType.Globe)),
      desktopContext(DossierFixtureWidth.Narrow),
    );
    const root = requireSplit(result.root);

    expect(root.direction).toBe(SplitDirection.Horizontal);
    expect(root.ratio).toBe(PaneLayoutRatio.DetailNarrow);
  });

  test("opens below when no ratio fits", () => {
    const result = openDossierInLayout(
      layout(leaf(PaneType.Globe)),
      desktopContext(DossierFixtureWidth.Unfit),
    );

    expect(requireSplit(result.root).direction).toBe(
      SplitDirection.Vertical,
    );
  });

  test("opens below on mobile at any width", () => {
    const result = openDossierInLayout(layout(leaf(PaneType.Globe)), {
      availableWidth: DossierFixtureWidth.Wide,
      isMobile: true,
    });

    expect(requireSplit(result.root).direction).toBe(
      SplitDirection.Vertical,
    );
  });
});
