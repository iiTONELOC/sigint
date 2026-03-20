// ── PaneManager operations spec ─────────────────────────────────────
// Tests the layout manipulation logic. These are pure tree operations
// extracted from PaneManager's callbacks — no DOM rendering needed.

import { describe, test, expect } from "bun:test";
import {
  leaf,
  split,
  collectLeafTypes,
  leafCount,
  hasDossierInTree,
  replaceNode,
  removeLeaf,
  findParentSplit,
  updateRatio,
  findNodeById,
  hasNodeId,
  collectLeaves,
  defaultLayout,
  type LayoutNode,
  type LayoutState,
  type LeafNode,
  type PaneType,
} from "@/panes/paneTree";

// ── Helpers ─────────────────────────────────────────────────────────

/** Simulate splitPane callback */
function splitPane(
  layout: LayoutState,
  leafId: string,
  dir: "h" | "v",
  newType: PaneType,
): LayoutState {
  const target = findNodeById(layout.root, leafId);
  if (!target) return layout;
  const ratio = newType === "dossier" || newType === "video-feed" ? 0.75 : 0.5;
  const newSplit = split(dir, target, leaf(newType), ratio);
  return { ...layout, root: replaceNode(layout.root, leafId, newSplit) };
}

/** Simulate closePane callback */
function closePane(layout: LayoutState, leafId: string): LayoutState {
  const result = removeLeaf(layout.root, leafId);
  if (!result) return defaultLayout();
  return { ...layout, root: result };
}

/** Simulate minimizePane callback */
function minimizePane(
  layout: LayoutState,
  leafId: string,
  paneType: PaneType,
): LayoutState {
  const result = removeLeaf(layout.root, leafId);
  if (!result) return layout;
  const parentInfo = findParentSplit(layout.root, leafId);
  return {
    root: result,
    minimized: [
      ...layout.minimized,
      {
        id: leafId,
        paneType,
        dir: parentInfo?.dir ?? "h",
        ratio: parentInfo?.ratio ?? 0.5,
        wasSecond: parentInfo?.wasSecond ?? true,
        siblingId: parentInfo?.siblingId ?? null,
      },
    ],
  };
}

/** Simulate restorePane callback */
function restorePane(layout: LayoutState, idx: number): LayoutState {
  const entry = layout.minimized[idx];
  if (!entry) return layout;
  const newLeaf = leaf(entry.paneType);
  const minimized = layout.minimized.filter((_, i) => i !== idx);

  if (entry.siblingId && hasNodeId(layout.root, entry.siblingId)) {
    const sibNode = findNodeById(layout.root, entry.siblingId);
    if (sibNode) {
      const newSplit = entry.wasSecond
        ? split(entry.dir, sibNode, newLeaf, entry.ratio)
        : split(entry.dir, newLeaf, sibNode, entry.ratio);
      return {
        root: replaceNode(layout.root, entry.siblingId, newSplit),
        minimized,
      };
    }
  }

  const newRoot = entry.wasSecond
    ? split(entry.dir, layout.root, newLeaf, entry.ratio)
    : split(entry.dir, newLeaf, layout.root, entry.ratio);
  return { root: newRoot, minimized };
}

/** Simulate swapPanes callback */
function swapPanes(
  layout: LayoutState,
  sourceLeafId: string,
  targetLeafId: string,
): LayoutState {
  if (sourceLeafId === targetLeafId) return layout;

  const findLeaf = (node: LayoutNode, id: string): LeafNode | null => {
    if (node.type === "leaf") return node.id === id ? node : null;
    return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
  };

  const src = findLeaf(layout.root, sourceLeafId);
  const tgt = findLeaf(layout.root, targetLeafId);
  if (!src || !tgt) return layout;

  const srcType = src.paneType;
  const tgtType = tgt.paneType;
  const swapInTree = (node: LayoutNode): LayoutNode => {
    if (node.type === "leaf") {
      if (node.id === sourceLeafId) return { ...node, paneType: tgtType };
      if (node.id === targetLeafId) return { ...node, paneType: srcType };
      return node;
    }
    return {
      ...node,
      children: [swapInTree(node.children[0]), swapInTree(node.children[1])],
    };
  };
  return { ...layout, root: swapInTree(layout.root) };
}

/** Simulate insertPaneBeside callback */
function insertPaneBeside(
  layout: LayoutState,
  sourceLeafId: string,
  targetLeafId: string,
  zone: "left" | "right" | "top" | "bottom",
): LayoutState {
  if (sourceLeafId === targetLeafId) return layout;

  const findLeaf = (node: LayoutNode, id: string): LeafNode | null => {
    if (node.type === "leaf") return node.id === id ? node : null;
    return findLeaf(node.children[0], id) ?? findLeaf(node.children[1], id);
  };

  const srcLeaf = findLeaf(layout.root, sourceLeafId);
  const tgtLeaf = findLeaf(layout.root, targetLeafId);
  if (!srcLeaf || !tgtLeaf) return layout;

  const withoutSrc = removeLeaf(layout.root, sourceLeafId);
  if (!withoutSrc) return layout;

  const newLeaf = leaf(srcLeaf.paneType);
  const tgtInPruned = findLeaf(withoutSrc, targetLeafId);
  if (!tgtInPruned) return layout;

  const dir: "h" | "v" = zone === "left" || zone === "right" ? "h" : "v";
  const sourceFirst = zone === "left" || zone === "top";
  const newSplit = sourceFirst
    ? split(dir, newLeaf, tgtInPruned, 0.5)
    : split(dir, tgtInPruned, newLeaf, 0.5);
  const newRoot = replaceNode(withoutSrc, targetLeafId, newSplit);

  return { ...layout, root: newRoot };
}

/** Simulate changePaneType callback */
function changePaneType(
  layout: LayoutState,
  leafId: string,
  newType: PaneType,
): LayoutState {
  return {
    ...layout,
    root: replaceNode(layout.root, leafId, leaf(newType)),
  };
}

// ── Split ───────────────────────────────────────────────────────────

describe("splitPane", () => {
  test("splits globe horizontally with dossier at 0.75 ratio", () => {
    const globe = leaf("globe");
    const layout: LayoutState = { root: globe, minimized: [] };
    const result = splitPane(layout, globe.id, "h", "dossier");

    expect(result.root.type).toBe("split");
    const s = result.root as any;
    expect(s.direction).toBe("h");
    expect(s.ratio).toBe(0.75);
    expect(s.children[0].paneType).toBe("globe");
    expect(s.children[1].paneType).toBe("dossier");
  });

  test("splits with 0.5 ratio for non-dossier/video types", () => {
    const globe = leaf("globe");
    const layout: LayoutState = { root: globe, minimized: [] };
    const result = splitPane(layout, globe.id, "v", "data-table");

    const s = result.root as any;
    expect(s.ratio).toBe(0.5);
  });

  test("splits vertically", () => {
    const globe = leaf("globe");
    const layout: LayoutState = { root: globe, minimized: [] };
    const result = splitPane(layout, globe.id, "v", "alert-log");

    const s = result.root as any;
    expect(s.direction).toBe("v");
  });

  test("returns unchanged layout when leafId not found", () => {
    const layout: LayoutState = { root: leaf("globe"), minimized: [] };
    const result = splitPane(layout, "nonexistent", "h", "dossier");
    expect(result).toBe(layout);
  });
});

// ── Close ───────────────────────────────────────────────────────────

describe("closePane", () => {
  test("closing one child of split promotes the other", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = { root: split("h", a, b), minimized: [] };

    const result = closePane(layout, b.id);
    expect(result.root.type).toBe("leaf");
    expect((result.root as LeafNode).paneType).toBe("globe");
  });

  test("closing last pane falls back to default layout", () => {
    const sole = leaf("dossier");
    const layout: LayoutState = { root: sole, minimized: [] };

    const result = closePane(layout, sole.id);
    expect(result.root.type).toBe("leaf");
    expect((result.root as LeafNode).paneType).toBe("globe");
  });

  test("closing nested pane collapses parent split", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const c = leaf("data-table");
    const layout: LayoutState = {
      root: split("h", a, split("v", b, c)),
      minimized: [],
    };

    const result = closePane(layout, c.id);
    expect(leafCount(result.root)).toBe(2);
    expect(collectLeafTypes(result.root).has("data-table")).toBe(false);
  });
});

// ── Minimize + Restore ──────────────────────────────────────────────

describe("minimizePane + restorePane", () => {
  test("minimize removes pane and stores metadata", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = {
      root: split("h", a, b, 0.75),
      minimized: [],
    };

    const result = minimizePane(layout, b.id, "dossier");
    expect(leafCount(result.root)).toBe(1);
    expect(result.minimized).toHaveLength(1);
    expect(result.minimized[0]!.paneType).toBe("dossier");
    expect(result.minimized[0]!.dir).toBe("h");
    expect(result.minimized[0]!.ratio).toBe(0.75);
    expect(result.minimized[0]!.wasSecond).toBe(true);
    expect(result.minimized[0]!.siblingId).toBe(a.id);
  });

  test("restore rebuilds pane next to original sibling", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = {
      root: split("h", a, b, 0.75),
      minimized: [],
    };

    const minimized = minimizePane(layout, b.id, "dossier");
    expect(leafCount(minimized.root)).toBe(1);

    const restored = restorePane(minimized, 0);
    expect(leafCount(restored.root)).toBe(2);
    expect(restored.minimized).toHaveLength(0);
    expect(collectLeafTypes(restored.root).has("dossier")).toBe(true);
    expect(collectLeafTypes(restored.root).has("globe")).toBe(true);
  });

  test("restore preserves direction and ratio", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = {
      root: split("v", a, b, 0.6),
      minimized: [],
    };

    const minimized = minimizePane(layout, b.id, "dossier");
    const restored = restorePane(minimized, 0);

    expect(restored.root.type).toBe("split");
    const s = restored.root as any;
    expect(s.direction).toBe("v");
    expect(s.ratio).toBe(0.6);
  });

  test("restore falls back to root split when sibling is gone", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const c = leaf("data-table");
    const layout: LayoutState = {
      root: split("h", a, split("v", b, c)),
      minimized: [],
    };

    // Minimize dossier (sibling is data-table)
    const minimized = minimizePane(layout, b.id, "dossier");
    // Now close data-table (the sibling)
    const leaves = collectLeaves(minimized.root);
    const dtLeaf = leaves.find((l) => l.paneType === "data-table");
    const afterClose = closePane(minimized, dtLeaf!.id);

    // Restore dossier — sibling is gone, should split on root
    const restored = restorePane(afterClose, 0);
    expect(collectLeafTypes(restored.root).has("dossier")).toBe(true);
    expect(collectLeafTypes(restored.root).has("globe")).toBe(true);
    expect(leafCount(restored.root)).toBe(2);
  });
});

// ── Swap ────────────────────────────────────────────────────────────

describe("swapPanes", () => {
  test("swaps pane types between two leaves", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = { root: split("h", a, b), minimized: [] };

    const result = swapPanes(layout, a.id, b.id);
    const leaves = collectLeaves(result.root);
    // Types swapped but IDs stay
    expect(leaves[0]!.id).toBe(a.id);
    expect(leaves[0]!.paneType).toBe("dossier");
    expect(leaves[1]!.id).toBe(b.id);
    expect(leaves[1]!.paneType).toBe("globe");
  });

  test("tree structure unchanged after swap", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const s = split("h", a, b, 0.75);
    const layout: LayoutState = { root: s, minimized: [] };

    const result = swapPanes(layout, a.id, b.id);
    expect(result.root.type).toBe("split");
    const rs = result.root as any;
    expect(rs.ratio).toBe(0.75);
    expect(rs.direction).toBe("h");
  });

  test("swap with self is no-op", () => {
    const a = leaf("globe");
    const layout: LayoutState = { root: a, minimized: [] };
    const result = swapPanes(layout, a.id, a.id);
    expect(result).toBe(layout);
  });
});

// ── Insert beside ───────────────────────────────────────────────────

describe("insertPaneBeside", () => {
  test("insert left creates horizontal split with source first", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const c = leaf("data-table");
    const layout: LayoutState = {
      root: split("h", a, split("v", b, c)),
      minimized: [],
    };

    const result = insertPaneBeside(layout, a.id, c.id, "left");
    // Globe removed from original spot, inserted left of data-table
    expect(collectLeafTypes(result.root).has("globe")).toBe(true);
    expect(collectLeafTypes(result.root).has("data-table")).toBe(true);
    expect(collectLeafTypes(result.root).has("dossier")).toBe(true);
  });

  test("insert right creates horizontal split with source second", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = {
      root: split("h", a, b),
      minimized: [],
    };

    const result = insertPaneBeside(layout, a.id, b.id, "right");
    expect(leafCount(result.root)).toBe(2);
    const leaves = collectLeaves(result.root);
    expect(leaves[0]!.paneType).toBe("dossier");
  });

  test("insert top creates vertical split with source first", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = { root: split("h", a, b), minimized: [] };

    const result = insertPaneBeside(layout, a.id, b.id, "top");
    expect(collectLeafTypes(result.root).has("globe")).toBe(true);
    expect(collectLeafTypes(result.root).has("dossier")).toBe(true);
  });

  test("insert with self is no-op", () => {
    const a = leaf("globe");
    const layout: LayoutState = { root: a, minimized: [] };
    const result = insertPaneBeside(layout, a.id, a.id, "left");
    expect(result).toBe(layout);
  });
});

// ── Change type ─────────────────────────────────────────────────────

describe("changePaneType", () => {
  test("replaces pane type in place", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const layout: LayoutState = { root: split("h", a, b), minimized: [] };

    const result = changePaneType(layout, b.id, "intel-feed");
    const leaves = collectLeaves(result.root);
    expect(leaves[1]!.paneType).toBe("intel-feed");
    expect(leaves[0]!.paneType).toBe("globe");
  });

  test("tree structure unchanged after type change", () => {
    const a = leaf("globe");
    const layout: LayoutState = { root: a, minimized: [] };

    const result = changePaneType(layout, a.id, "data-table");
    expect(result.root.type).toBe("leaf");
    expect((result.root as LeafNode).paneType).toBe("data-table");
  });
});

// ── Resize ──────────────────────────────────────────────────────────

describe("resize", () => {
  test("updates ratio on split node", () => {
    const s = split("h", leaf("globe"), leaf("dossier"), 0.5);
    const layout: LayoutState = { root: s, minimized: [] };

    const result: LayoutState = {
      ...layout,
      root: updateRatio(layout.root, s.id, 0.8),
    };
    expect((result.root as any).ratio).toBe(0.8);
  });

  test("only updates targeted split in nested tree", () => {
    const inner = split("v", leaf("data-table"), leaf("dossier"), 0.5);
    const outer = split("h", leaf("globe"), inner, 0.7);
    const layout: LayoutState = { root: outer, minimized: [] };

    const result: LayoutState = {
      ...layout,
      root: updateRatio(layout.root, inner.id, 0.3),
    };
    expect((result.root as any).ratio).toBe(0.7); // outer unchanged
    expect((result.root as any).children[1].ratio).toBe(0.3); // inner updated
  });
});

// ── Watch layout ────────────────────────────────────────────────────

describe("watch layout (ensure panes exist)", () => {
  test("globe-only layout gets dossier + alert-log + intel-feed added", () => {
    let layout: LayoutState = { root: leaf("globe"), minimized: [] };

    // Simulate watch layout: ensure dossier, alert-log, intel-feed exist
    const needed: PaneType[] = ["dossier", "alert-log", "intel-feed"];
    for (const paneType of needed) {
      if (!collectLeafTypes(layout.root).has(paneType)) {
        layout = splitPane(
          layout,
          collectLeaves(layout.root)[0]!.id,
          "h",
          paneType,
        );
      }
    }

    const types = collectLeafTypes(layout.root);
    expect(types.has("globe")).toBe(true);
    expect(types.has("dossier")).toBe(true);
    expect(types.has("alert-log")).toBe(true);
    expect(types.has("intel-feed")).toBe(true);
    expect(leafCount(layout.root)).toBe(4);
  });

  test("does not duplicate panes that already exist", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    let layout: LayoutState = { root: split("h", a, b), minimized: [] };

    // Try to ensure dossier — already exists
    if (!collectLeafTypes(layout.root).has("dossier")) {
      layout = splitPane(layout, a.id, "h", "dossier");
    }

    expect(leafCount(layout.root)).toBe(2); // unchanged
  });
});
