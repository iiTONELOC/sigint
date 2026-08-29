import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import { isRecord } from "@shared/geo";
import {
  PaneIdSequence,
  PaneIdToken,
  PaneLayoutRatio,
  PaneNodeType,
  PaneTreeArity,
  PaneType as PaneTypeId,
  SplitDirection,
  type PaneLeafNodeType,
  type PaneSplitNodeType,
  type PaneTypeValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model/pane";

// ── Types ────────────────────────────────────────────────────────────

export type PaneType = PaneTypeValue;

export type LeafNode = {
  type: PaneLeafNodeType;
  id: string;
  paneType: PaneType;
};

export type SplitNode = {
  type: PaneSplitNodeType;
  id: string;
  direction: SplitDirectionValue;
  ratio: number;
  children: [LayoutNode, LayoutNode];
};

export type LayoutNode = LeafNode | SplitNode;

export type LayoutState = {
  root: LayoutNode;
  minimized: {
    id: string;
    paneType: PaneType;
    dir: SplitDirectionValue;
    ratio: number;
    wasSecond: boolean;
    siblingId: string | null;
  }[];
};

export type LayoutPreset = Readonly<{ name: string; state: LayoutState }>;
export type LayoutPresetCatalog = Readonly<Record<string, LayoutPreset>>;

// On mobile these stay full-width: children go below only (no side-by-side
// h-split, no left/right insert). Enforced in the mobile UI + auto-split logic.
export const FULL_WIDTH_ONLY: ReadonlySet<PaneType> = new Set([
  PaneTypeId.Globe,
  PaneTypeId.VideoFeed,
]);

/** Force a vertical split when the anchor must stay full-width on mobile. */
export function mobileSplitDir(
  dir: SplitDirectionValue,
  anchorType: PaneType,
  isMobile: boolean,
): SplitDirectionValue {
  return isMobile && FULL_WIDTH_ONLY.has(anchorType)
    ? SplitDirection.Vertical
    : dir;
}

// ── Tree helpers ─────────────────────────────────────────────────────

let _idC = PaneIdSequence.Start;
export function uid(): string {
  _idC += PaneIdSequence.Step;
  return `${PaneIdToken.NodePrefix}${Date.now()}${PaneIdToken.SegmentSeparator}${_idC}`;
}

export function leaf(paneType: PaneType): LeafNode {
  return { type: PaneNodeType.Leaf, id: uid(), paneType };
}

export function split(
  dir: SplitDirectionValue,
  a: LayoutNode,
  b: LayoutNode,
  ratio: number = PaneLayoutRatio.Equal,
): SplitNode {
  return {
    children: [a, b],
    direction: dir,
    id: uid(),
    ratio,
    type: PaneNodeType.Split,
  };
}

export function collectLeafTypes(node: LayoutNode): Set<PaneType> {
  if (node.type === PaneNodeType.Leaf) return new Set([node.paneType]);
  const s = collectLeafTypes(node.children[0]);
  for (const t of collectLeafTypes(node.children[1])) s.add(t);
  return s;
}

export function leafCount(node: LayoutNode): number {
  if (node.type === PaneNodeType.Leaf) return 1;
  return leafCount(node.children[0]) + leafCount(node.children[1]);
}

export function hasDossierInTree(node: LayoutNode): boolean {
  if (node.type === PaneNodeType.Leaf) {
    return node.paneType === PaneTypeId.Dossier;
  }
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
  if (root.type === PaneNodeType.Leaf) return root;
  return {
    ...root,
    children: [
      replaceNode(root.children[0], targetId, replacement),
      replaceNode(root.children[1], targetId, replacement),
    ],
  };
}

export function removeLeaf(
  root: LayoutNode,
  targetId: string,
): LayoutNode | null {
  if (root.type === PaneNodeType.Leaf) {
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
  dir: SplitDirectionValue;
  ratio: number;
  wasSecond: boolean;
  siblingId: string;
} | null {
  if (root.type === PaneNodeType.Leaf) return null;
  const [a, b] = root.children;
  if (a.type === PaneNodeType.Leaf && a.id === leafId)
    return {
      dir: root.direction,
      ratio: root.ratio,
      wasSecond: false,
      siblingId: b.id,
    };
  if (b.type === PaneNodeType.Leaf && b.id === leafId)
    return {
      dir: root.direction,
      ratio: root.ratio,
      wasSecond: true,
      siblingId: a.id,
    };
  return findParentSplit(a, leafId) ?? findParentSplit(b, leafId);
}

export function updateRatio(
  root: LayoutNode,
  splitId: string,
  ratio: number,
): LayoutNode {
  if (root.type === PaneNodeType.Leaf) return root;
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
  if (node.type === PaneNodeType.Split)
    return (
      findNodeById(node.children[0], id) ?? findNodeById(node.children[1], id)
    );
  return null;
}

export function hasNodeId(node: LayoutNode, id: string): boolean {
  if (node.id === id) return true;
  if (node.type === PaneNodeType.Split)
    return hasNodeId(node.children[0], id) || hasNodeId(node.children[1], id);
  return false;
}

export function collectLeaves(node: LayoutNode): LeafNode[] {
  if (node.type === PaneNodeType.Leaf) return [node];
  return [
    ...collectLeaves(node.children[0]),
    ...collectLeaves(node.children[1]),
  ];
}

// ── Persistence ──────────────────────────────────────────────────────

function layoutKey(mobile: boolean): string {
  return mobile ? CacheKey.LayoutMobile : CacheKey.LayoutDesktop;
}

export function defaultLayout(): LayoutState {
  return { root: leaf(PaneTypeId.Globe), minimized: [] };
}

function isValidTree(node: unknown): node is LayoutNode {
  if (!isRecord(node)) return false;
  if (node.type === PaneNodeType.Leaf)
    return typeof node.id === "string" &&
      typeof node.paneType === "string";
  if (node.type === PaneNodeType.Split) {
    return (
      typeof node.id === "string" &&
      (
        node.direction === SplitDirection.Horizontal ||
        node.direction === SplitDirection.Vertical
      ) &&
      typeof node.ratio === "number" &&
      Array.isArray(node.children) &&
      node.children.length === PaneTreeArity.Binary &&
      isValidTree(node.children[0]) &&
      isValidTree(node.children[1])
    );
  }
  return false;
}

function parseLayout(cached: LayoutState | null): LayoutState | null {
  if (!cached || !isValidTree(cached.root)) return null;
  const minimized = (cached.minimized ?? []).map((entry) => ({
    id: entry.id,
    paneType: entry.paneType,
    dir: entry.dir ?? SplitDirection.Horizontal,
    ratio: entry.ratio ?? PaneLayoutRatio.Equal,
    wasSecond: entry.wasSecond ?? true,
    siblingId: entry.siblingId ?? null,
  }));
  return { root: cached.root, minimized };
}

export async function loadLayout(mobile: boolean): Promise<LayoutState> {
  try {
    // Try the device-specific key first
    const cached = await cacheGet<LayoutState>(layoutKey(mobile));
    const parsed = parseLayout(cached);
    if (parsed) return parsed;

    // Fall back to legacy key (migrates existing users)
    const legacy = await cacheGet<LayoutState>(
      CacheKey.LayoutLegacy,
    );
    const legacyParsed = parseLayout(legacy);
    if (legacyParsed) return legacyParsed;
  } catch {
    return defaultLayout();
  }
  return defaultLayout();
}

export function persistLayout(layout: LayoutState, mobile: boolean) {
  cacheSet(layoutKey(mobile), layout);
}

// Named presets follow user intent across device-specific live layouts.
function indexPresets(presets: readonly LayoutPreset[]): LayoutPresetCatalog {
  const catalog: Record<string, LayoutPreset> = Object.create(null);
  for (const preset of presets) {
    if (Object.hasOwn(catalog, preset.name)) continue;
    catalog[preset.name] = preset;
  }
  return catalog;
}

export async function loadPresets(): Promise<LayoutPresetCatalog> {
  const shared = await cacheGet<LayoutPreset[]>(
    CacheKey.LayoutPresets,
  );
  if (shared) return indexPresets(shared);

  // Merge deprecated stores when the shared store is absent.
  const lists = await Promise.all([
    cacheGet<LayoutPreset[]>(
      CacheKey.LayoutPresetsDesktopLegacy,
    ),
    cacheGet<LayoutPreset[]>(
      CacheKey.LayoutPresetsMobileLegacy,
    ),
    cacheGet<LayoutPreset[]>(
      CacheKey.LayoutPresetsLegacy,
    ),
  ]);
  const merged = indexPresets(lists.flatMap((list) => list ?? []));
  cacheSet(CacheKey.LayoutPresets, Object.values(merged));
  return merged;
}

export function savePresets(presets: LayoutPresetCatalog) {
  cacheSet(CacheKey.LayoutPresets, Object.values(presets));
}
