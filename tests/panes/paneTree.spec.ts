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
  type LeafNode,
} from "@/panes/paneTree";

describe("leaf()", () => {
  test("creates a leaf node with correct type", () => {
    const l = leaf("globe");
    expect(l.type).toBe("leaf");
    expect(l.paneType).toBe("globe");
    expect(typeof l.id).toBe("string");
    expect(l.id.length).toBeGreaterThan(0);
  });

  test("generates unique ids", () => {
    const a = leaf("globe");
    const b = leaf("globe");
    expect(a.id).not.toBe(b.id);
  });
});

describe("split()", () => {
  test("creates a horizontal split", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const s = split("h", a, b, 0.75);
    expect(s.type).toBe("split");
    expect(s.direction).toBe("h");
    expect(s.ratio).toBe(0.75);
    expect(s.children[0]).toBe(a);
    expect(s.children[1]).toBe(b);
  });

  test("defaults ratio to 0.5", () => {
    const s = split("v", leaf("globe"), leaf("dossier"));
    expect(s.ratio).toBe(0.5);
  });
});

describe("collectLeafTypes()", () => {
  test("single leaf returns set of one", () => {
    const result = collectLeafTypes(leaf("globe"));
    expect(result.size).toBe(1);
    expect(result.has("globe")).toBe(true);
  });

  test("split with two different types returns both", () => {
    const tree = split("h", leaf("globe"), leaf("dossier"));
    const result = collectLeafTypes(tree);
    expect(result.size).toBe(2);
    expect(result.has("globe")).toBe(true);
    expect(result.has("dossier")).toBe(true);
  });

  test("nested tree collects all types", () => {
    const tree = split(
      "h",
      split("v", leaf("globe"), leaf("data-table")),
      split("v", leaf("dossier"), leaf("intel-feed")),
    );
    const result = collectLeafTypes(tree);
    expect(result.size).toBe(4);
  });

  test("duplicate types are deduped", () => {
    const tree = split("h", leaf("globe"), leaf("globe"));
    const result = collectLeafTypes(tree);
    expect(result.size).toBe(1);
  });
});

describe("leafCount()", () => {
  test("single leaf = 1", () => {
    expect(leafCount(leaf("globe"))).toBe(1);
  });

  test("split with two leaves = 2", () => {
    expect(leafCount(split("h", leaf("globe"), leaf("dossier")))).toBe(2);
  });

  test("nested tree counts all leaves", () => {
    const tree = split(
      "h",
      split("v", leaf("globe"), leaf("data-table")),
      leaf("dossier"),
    );
    expect(leafCount(tree)).toBe(3);
  });
});

describe("hasDossierInTree()", () => {
  test("returns false when no dossier", () => {
    expect(hasDossierInTree(leaf("globe"))).toBe(false);
  });

  test("returns true for dossier leaf", () => {
    expect(hasDossierInTree(leaf("dossier"))).toBe(true);
  });

  test("finds dossier nested in split", () => {
    const tree = split(
      "h",
      leaf("globe"),
      split("v", leaf("data-table"), leaf("dossier")),
    );
    expect(hasDossierInTree(tree)).toBe(true);
  });
});

describe("replaceNode()", () => {
  test("replaces root leaf", () => {
    const original = leaf("globe");
    const replacement = leaf("dossier");
    const result = replaceNode(original, original.id, replacement);
    expect(result).toBe(replacement);
  });

  test("replaces nested leaf in split", () => {
    const target = leaf("globe");
    const other = leaf("data-table");
    const tree = split("h", target, other);
    const replacement = leaf("dossier");
    const result = replaceNode(tree, target.id, replacement) as any;
    expect(result.children[0].paneType).toBe("dossier");
    expect(result.children[1]).toBe(other);
  });

  test("does not modify tree when id not found", () => {
    const tree = split("h", leaf("globe"), leaf("data-table"));
    const result = replaceNode(tree, "nonexistent", leaf("dossier"));
    expect(result).toEqual(tree);
  });
});

describe("removeLeaf()", () => {
  test("removing sole leaf returns null", () => {
    const l = leaf("globe");
    expect(removeLeaf(l, l.id)).toBeNull();
  });

  test("removing first child returns second", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const tree = split("h", a, b);
    expect(removeLeaf(tree, a.id)).toBe(b);
  });

  test("removing second child returns first", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const tree = split("h", a, b);
    expect(removeLeaf(tree, b.id)).toBe(a);
  });

  test("removing nested leaf collapses parent split", () => {
    const target = leaf("dossier");
    const sibling = leaf("data-table");
    const other = leaf("globe");
    const tree = split("h", other, split("v", sibling, target));
    const result = removeLeaf(tree, target.id);
    expect(result).not.toBeNull();
    expect(leafCount(result!)).toBe(2);
    expect(collectLeafTypes(result!).has("dossier")).toBe(false);
  });

  test("returns unchanged tree when id not found", () => {
    const tree = split("h", leaf("globe"), leaf("data-table"));
    expect(removeLeaf(tree, "nonexistent")).toBe(tree);
  });
});

describe("findParentSplit()", () => {
  test("returns null for single leaf", () => {
    const l = leaf("globe");
    expect(findParentSplit(l, l.id)).toBeNull();
  });

  test("finds parent of first child", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const tree = split("h", a, b, 0.7);
    const result = findParentSplit(tree, a.id);
    expect(result).not.toBeNull();
    expect(result!.wasSecond).toBe(false);
    expect(result!.siblingId).toBe(b.id);
    expect(result!.ratio).toBe(0.7);
    expect(result!.dir).toBe("h");
  });

  test("finds parent of second child", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const tree = split("h", a, b, 0.7);
    const result = findParentSplit(tree, b.id);
    expect(result).not.toBeNull();
    expect(result!.wasSecond).toBe(true);
    expect(result!.siblingId).toBe(a.id);
  });
});

describe("updateRatio()", () => {
  test("updates ratio on matching split", () => {
    const tree = split("h", leaf("globe"), leaf("dossier"), 0.5);
    const result = updateRatio(tree, tree.id, 0.8) as any;
    expect(result.ratio).toBe(0.8);
  });

  test("does not modify unrelated splits", () => {
    const inner = split("v", leaf("data-table"), leaf("dossier"), 0.5);
    const tree = split("h", leaf("globe"), inner, 0.7);
    const result = updateRatio(tree, inner.id, 0.3) as any;
    expect(result.ratio).toBe(0.7);
    expect(result.children[1].ratio).toBe(0.3);
  });
});

describe("findNodeById()", () => {
  test("finds root node", () => {
    const l = leaf("globe");
    expect(findNodeById(l, l.id)).toBe(l);
  });

  test("finds nested node", () => {
    const target = leaf("dossier");
    const tree = split("h", leaf("globe"), target);
    expect(findNodeById(tree, target.id)).toBe(target);
  });

  test("returns null when not found", () => {
    expect(findNodeById(leaf("globe"), "nope")).toBeNull();
  });
});

describe("hasNodeId()", () => {
  test("returns true for existing id", () => {
    const target = leaf("dossier");
    const tree = split("h", leaf("globe"), target);
    expect(hasNodeId(tree, target.id)).toBe(true);
  });

  test("returns false for missing id", () => {
    expect(hasNodeId(leaf("globe"), "nope")).toBe(false);
  });
});

describe("collectLeaves()", () => {
  test("single leaf returns array of one", () => {
    const l = leaf("globe");
    const result = collectLeaves(l);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(l.id);
  });

  test("preserves left-to-right order", () => {
    const a = leaf("globe");
    const b = leaf("dossier");
    const c = leaf("data-table");
    const tree = split("h", a, split("v", b, c));
    const result = collectLeaves(tree);
    expect(result.map((l) => l.paneType)).toEqual([
      "globe",
      "dossier",
      "data-table",
    ]);
  });
});

describe("defaultLayout()", () => {
  test("returns globe leaf with empty minimized", () => {
    const layout = defaultLayout();
    expect(layout.root.type).toBe("leaf");
    expect((layout.root as LeafNode).paneType).toBe("globe");
    expect(layout.minimized).toEqual([]);
  });
});
