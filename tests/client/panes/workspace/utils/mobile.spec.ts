import { describe, expect, test } from "bun:test";
import { leaf, split } from "@/panes/paneTree";
import { PaneType, SplitDirection } from "@/panes/workspace/model/pane";
import {
  collectFirstLeaf,
  collectLeafIds,
  collectMobileBlocks,
  reconcileMobileBlockOrder,
  type MobileBlock,
} from "@/panes/workspace/utils/mobile";

enum MobileProjectionCount {
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
}

enum MobileProjectionTestError {
  BlockRequired = "The mobile projection did not return a block.",
}

function requireBlock(block: MobileBlock | undefined): MobileBlock {
  if (!block) {
    throw new Error(MobileProjectionTestError.BlockRequired);
  }
  return block;
}

describe("mobile pane projection", () => {
  test("projects one leaf without changing its identity", () => {
    const globe = leaf(PaneType.Globe);
    const blocks = collectMobileBlocks(globe);
    const block = requireBlock(blocks[0]);

    expect(blocks).toHaveLength(MobileProjectionCount.One);
    expect(block.id).toBe(globe.id);
    expect(block.node).toBe(globe);
    expect(block.primaryLeaf).toBe(globe);
    expect(block.leafIds).toEqual([globe.id]);
  });

  test("collects the first leaf and every leaf ID in source order", () => {
    const globe = leaf(PaneType.Globe);
    const dossier = leaf(PaneType.Dossier);
    const news = leaf(PaneType.NewsFeed);
    const root = split(
      SplitDirection.Vertical,
      globe,
      split(SplitDirection.Horizontal, dossier, news),
    );

    expect(collectFirstLeaf(root)).toBe(globe);
    expect(collectLeafIds(root)).toEqual([
      globe.id,
      dossier.id,
      news.id,
    ]);
  });

  test("keeps a shallow horizontal pair in one block", () => {
    const globe = leaf(PaneType.Globe);
    const table = leaf(PaneType.DataTable);
    const blocks = collectMobileBlocks(
      split(SplitDirection.Horizontal, globe, table),
    );
    const block = requireBlock(blocks[0]);

    expect(blocks).toHaveLength(MobileProjectionCount.One);
    expect(block.primaryLeaf).toBe(globe);
    expect(block.leafIds).toEqual([globe.id, table.id]);
  });

  test("flattens a deep horizontal tree in source order", () => {
    const globe = leaf(PaneType.Globe);
    const table = leaf(PaneType.DataTable);
    const dossier = leaf(PaneType.Dossier);
    const blocks = collectMobileBlocks(
      split(
        SplitDirection.Horizontal,
        globe,
        split(SplitDirection.Horizontal, table, dossier),
      ),
    );

    expect(blocks).toHaveLength(MobileProjectionCount.Two);
    expect(requireBlock(blocks[0]).leafIds).toEqual([globe.id]);
    expect(requireBlock(blocks[1]).leafIds).toEqual([
      table.id,
      dossier.id,
    ]);
  });

  test("flattens vertical trees from top to bottom", () => {
    const alerts = leaf(PaneType.AlertLog);
    const news = leaf(PaneType.NewsFeed);
    const globe = leaf(PaneType.Globe);
    const blocks = collectMobileBlocks(
      split(
        SplitDirection.Vertical,
        alerts,
        split(SplitDirection.Vertical, news, globe),
      ),
    );

    expect(blocks).toHaveLength(MobileProjectionCount.Three);
    expect(blocks.map(({ primaryLeaf }) => primaryLeaf)).toEqual([
      alerts,
      news,
      globe,
    ]);
  });

  test("keeps four shallow pairs in a complex desktop tree", () => {
    const globe = leaf(PaneType.Globe);
    const table = leaf(PaneType.DataTable);
    const dossier = leaf(PaneType.Dossier);
    const video = leaf(PaneType.VideoFeed);
    const alerts = leaf(PaneType.AlertLog);
    const intel = leaf(PaneType.IntelFeed);
    const news = leaf(PaneType.NewsFeed);
    const consolePane = leaf(PaneType.RawConsole);
    const root = split(
      SplitDirection.Horizontal,
      split(
        SplitDirection.Horizontal,
        split(SplitDirection.Horizontal, globe, table),
        split(SplitDirection.Horizontal, dossier, video),
      ),
      split(
        SplitDirection.Horizontal,
        split(SplitDirection.Horizontal, alerts, intel),
        split(SplitDirection.Horizontal, news, consolePane),
      ),
    );

    const blocks = collectMobileBlocks(root);
    expect(blocks).toHaveLength(MobileProjectionCount.Four);
    expect(blocks.map(({ leafIds }) => leafIds)).toEqual([
      [globe.id, table.id],
      [dossier.id, video.id],
      [alerts.id, intel.id],
      [news.id, consolePane.id],
    ]);
  });

  test("inserts replacement blocks at the first removed position", () => {
    const globe = leaf(PaneType.Globe);
    const table = leaf(PaneType.DataTable);
    const dossier = leaf(PaneType.Dossier);
    const video = leaf(PaneType.VideoFeed);

    expect(
      reconcileMobileBlockOrder(
        [globe.id, table.id, dossier.id],
        [video.id],
        new Set([table.id]),
      ),
    ).toEqual([globe.id, video.id, dossier.id]);
  });

  test("appends new blocks when no removed position exists", () => {
    const globe = leaf(PaneType.Globe);
    const table = leaf(PaneType.DataTable);

    expect(
      reconcileMobileBlockOrder([globe.id], [table.id], new Set()),
    ).toEqual([globe.id, table.id]);
  });
});
