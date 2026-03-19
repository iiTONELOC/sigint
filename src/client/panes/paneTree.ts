import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

// ── Types ────────────────────────────────────────────────────────────

export type PaneType =
  | "globe"
  | "data-table"
  | "dossier"
  | "intel-feed"
  | "alert-log"
  | "raw-console"
  | "video-feed";

export type LeafNode = {
  type: "leaf";
  id: string;
  paneType: PaneType;
};

export type SplitNode = {
  type: "split";
  id: string;
  direction: "h" | "v";
  ratio: number;
  children: [LayoutNode, LayoutNode];
};

export type LayoutNode = LeafNode | SplitNode;

export type LayoutState = {
  root: LayoutNode;
  minimized: {
    id: string;
    paneType: PaneType;
    dir: "h" | "v";
    ratio: number;
    wasSecond: boolean;
    siblingId: string | null;
  }[];
};

export type LayoutPreset = { name: string; state: LayoutState };

// ── Tree helpers ─────────────────────────────────────────────────────

let _idC = 0;
export function uid(): string {
  _idC += 1;
  return `n${Date.now()}-${_idC}`;
}

export function leaf(paneType: PaneType): LeafNode {
  return { type: "leaf", id: uid(), paneType };
}

export function split(
  dir: "h" | "v",
  a: LayoutNode,
  b: LayoutNode,
  ratio = 0.5,
): SplitNode {
  return { type: "split", id: uid(), direction: dir, ratio, children: [a, b] };
}

export function collectLeafTypes(node: LayoutNode): Set<PaneType> {
  if (node.type === "leaf") return new Set([node.paneType]);
  const s = collectLeafTypes(node.children[0]);
  for (const t of collectLeafTypes(node.children[1])) s.add(t);
  return s;
}

export function leafCount(node: LayoutNode): number {
  if (node.type === "leaf") return 1;
  return leafCount(node.children[0]) + leafCount(node.children[1]);
}

export function hasDossierInTree(node: LayoutNode): boolean {
  if (node.type === "leaf") return node.paneType === "dossier";
  return (
    hasDossierInTree(node.children[0]) || hasDossierInTree(node.children[1])
  );
}

export function replaceNode(
  root: LayoutNode,
  targetId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (root.id === targetId) return replacement;
  if (root.type === "leaf") return root;
  return {
    ...root,
    children: [
      replaceNode(root.children[0], targetId, replacement),
      replaceNode(root.children[1], targetId, replacement),
    ],
  };
}

export function removeLeaf(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.type === "leaf") {
    return root.id === targetId ? null : root;
  }
  const [a, b] = root.children;
  if (a.id === targetId) return b;
  if (b.id === targetId) return a;
  const newA = removeLeaf(a, targetId);
  if (newA !== a) return newA === null ? b : { ...root, children: [newA, b] };
  const newB = removeLeaf(b, targetId);
  if (newB !== b) return newB === null ? a : { ...root, children: [a, newB] };
  return root;
}

export function findParentSplit(
  root: LayoutNode,
  leafId: string,
): {
  dir: "h" | "v";
  ratio: number;
  wasSecond: boolean;
  siblingId: string;
} | null {
  if (root.type === "leaf") return null;
  const [a, b] = root.children;
  if (a.type === "leaf" && a.id === leafId)
    return { dir: root.direction, ratio: root.ratio, wasSecond: false, siblingId: b.id };
  if (b.type === "leaf" && b.id === leafId)
    return { dir: root.direction, ratio: root.ratio, wasSecond: true, siblingId: a.id };
  return findParentSplit(a, leafId) ?? findParentSplit(b, leafId);
}

export function updateRatio(
  root: LayoutNode,
  splitId: string,
  ratio: number,
): LayoutNode {
  if (root.type === "leaf") return root;
  if (root.id === splitId) return { ...root, ratio };
  return {
    ...root,
    children: [
      updateRatio(root.children[0], splitId, ratio),
      updateRatio(root.children[1], splitId, ratio),
    ],
  };
}

export function findNodeById(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node;
  if (node.type === "split")
    return findNodeById(node.children[0], id) ?? findNodeById(node.children[1], id);
  return null;
}

export function hasNodeId(node: LayoutNode, id: string): boolean {
  if (node.id === id) return true;
  if (node.type === "split")
    return hasNodeId(node.children[0], id) || hasNodeId(node.children[1], id);
  return false;
}

export function collectLeaves(node: LayoutNode): LeafNode[] {
  if (node.type === "leaf") return [node];
  return [...collectLeaves(node.children[0]), ...collectLeaves(node.children[1])];
}

// ── Persistence ──────────────────────────────────────────────────────

const CACHE_KEY = CACHE_KEYS.layout;
const PRESETS_KEY = CACHE_KEYS.layoutPresets;

export function defaultLayout(): LayoutState {
  return { root: leaf("globe"), minimized: [] };
}

function isValidTree(node: unknown): node is LayoutNode {
  if (!node || typeof node !== "object") return false;
  const n = node as any;
  if (n.type === "leaf")
    return typeof n.id === "string" && typeof n.paneType === "string";
  if (n.type === "split") {
    return (
      typeof n.id === "string" &&
      (n.direction === "h" || n.direction === "v") &&
      typeof n.ratio === "number" &&
      Array.isArray(n.children) &&
      n.children.length === 2 &&
      isValidTree(n.children[0]) &&
      isValidTree(n.children[1])
    );
  }
  return false;
}

export function loadLayout(): LayoutState {
  try {
    const cached = cacheGet<LayoutState>(CACHE_KEY);
    if (cached && isValidTree(cached.root)) {
      const minimized = (cached.minimized ?? []).map((m: any) => ({
        id: m.id,
        paneType: m.paneType,
        dir: m.dir ?? "h",
        ratio: m.ratio ?? 0.5,
        wasSecond: m.wasSecond ?? true,
        siblingId: m.siblingId ?? null,
      }));
      return { root: cached.root, minimized };
    }
  } catch {
    /* ignore */
  }
  return defaultLayout();
}

export function persistLayout(layout: LayoutState) {
  cacheSet(CACHE_KEY, layout);
}

export function loadPresets(): LayoutPreset[] {
  return cacheGet<LayoutPreset[]>(PRESETS_KEY) ?? [];
}

export function savePresets(presets: LayoutPreset[]) {
  cacheSet(PRESETS_KEY, presets);
}
