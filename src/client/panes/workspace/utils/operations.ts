import {
  PaneDropZone,
  PaneLayoutRatio,
  PaneNodeType,
  PaneSearchIndex,
  PaneType,
  SplitDirection,
  type PaneEdgeDropZoneValue,
  type PaneTypeValue,
  type SplitDirectionValue,
} from "../model/pane";
import {
  collectLeaves,
  collectLeafTypes,
  defaultLayout,
  findNodeById,
  findParentSplit,
  hasNodeId,
  leaf,
  mobileSplitDir,
  removeLeaf,
  replaceNode,
  split,
  updateRatio,
  type LayoutNode,
  type LayoutState,
  type LeafNode,
} from "@/panes/paneTree";
import { fittingHorizontalRatio } from "@/panes/workspace/model/resize";

type WatchPanePlacement = Readonly<{
  anchorType: PaneTypeValue;
  direction: SplitDirectionValue;
  paneType: PaneTypeValue;
  ratio: PaneLayoutRatio;
}>;

export type PanePlacementContext = Readonly<{
  availableWidth: number;
  isMobile: boolean;
}>;

function horizontalPlacement(
  preferred: SplitDirectionValue,
  anchorType: PaneTypeValue,
  ratio: number,
  context: PanePlacementContext,
): Readonly<{ direction: SplitDirectionValue; ratio: number }> {
  const direction = mobileSplitDir(preferred, anchorType, context.isMobile);
  if (context.isMobile || direction !== SplitDirection.Horizontal) {
    return { direction, ratio };
  }
  const fitted = fittingHorizontalRatio(context.availableWidth, ratio);
  return fitted === null
    ? { direction: SplitDirection.Vertical, ratio }
    : { direction, ratio: fitted };
}

function findLeaf(node: LayoutNode, leafId: string): LeafNode | null {
  if (node.type === PaneNodeType.Leaf) {
    return node.id === leafId ? node : null;
  }
  return (
    findLeaf(node.children[0], leafId) ??
    findLeaf(node.children[1], leafId)
  );
}

function splitRatioFor(paneType: PaneTypeValue): PaneLayoutRatio {
  return (
    paneType === PaneType.Dossier ||
    paneType === PaneType.VideoFeed
  )
    ? PaneLayoutRatio.Detail
    : PaneLayoutRatio.Equal;
}

export function splitPaneLayout(
  layout: LayoutState,
  leafId: string,
  direction: SplitDirectionValue,
  newType: PaneTypeValue,
): LayoutState {
  const target = findNodeById(layout.root, leafId);
  if (!target) {
    return layout;
  }
  const newSplit = split(
    direction,
    target,
    leaf(newType),
    splitRatioFor(newType),
  );
  return {
    ...layout,
    root: replaceNode(layout.root, leafId, newSplit),
  };
}

export function openDossierInLayout(
  layout: LayoutState,
  context: PanePlacementContext,
): LayoutState {
  const openTypes = collectLeafTypes(layout.root);
  if (openTypes.has(PaneType.Dossier)) {
    return layout;
  }

  const minimizedIndex = layout.minimized.findIndex(
    (entry) => entry.paneType === PaneType.Dossier,
  );
  if (minimizedIndex > PaneSearchIndex.NotFound) {
    return restorePaneLayout(layout, minimizedIndex);
  }

  const globe = collectLeaves(layout.root).find(
    (entry) => entry.paneType === PaneType.Globe,
  );
  const targetId = globe?.id ?? layout.root.id;
  const target = findNodeById(layout.root, targetId);
  if (!target) {
    return layout;
  }
  const placement = horizontalPlacement(
    SplitDirection.Horizontal,
    PaneType.Globe,
    PaneLayoutRatio.Detail,
    context,
  );
  return {
    ...layout,
    root: replaceNode(
      layout.root,
      targetId,
      split(
        placement.direction,
        target,
        leaf(PaneType.Dossier),
        placement.ratio,
      ),
    ),
  };
}

function ensureWatchPane(
  layout: LayoutState,
  openTypes: Set<PaneTypeValue>,
  placement: WatchPanePlacement,
  context: PanePlacementContext,
): LayoutState {
  if (openTypes.has(placement.paneType)) {
    return layout;
  }

  const minimizedIndex = layout.minimized.findIndex(
    (entry) => entry.paneType === placement.paneType,
  );
  const minimized = minimizedIndex > PaneSearchIndex.NotFound
    ? layout.minimized.filter((_entry, index) => index !== minimizedIndex)
    : layout.minimized;
  const anchor = collectLeaves(layout.root).find(
    (entry) => entry.paneType === placement.anchorType,
  );
  const target = anchor
    ? findNodeById(layout.root, anchor.id)
    : null;
  const fitted = horizontalPlacement(
    placement.direction,
    placement.anchorType,
    placement.ratio,
    context,
  );
  const addedLeaf = leaf(placement.paneType);
  const root = target
    ? replaceNode(
      layout.root,
      target.id,
      split(fitted.direction, target, addedLeaf, fitted.ratio),
    )
    : split(fitted.direction, layout.root, addedLeaf, fitted.ratio);
  openTypes.add(placement.paneType);
  return { minimized, root };
}

export function createWatchLayout(
  layout: LayoutState,
  context: PanePlacementContext,
): LayoutState {
  const openTypes = collectLeafTypes(layout.root);
  let next = { ...layout, minimized: [...layout.minimized] };
  next = ensureWatchPane(
    next,
    openTypes,
    {
      anchorType: PaneType.Globe,
      direction: SplitDirection.Horizontal,
      paneType: PaneType.Dossier,
      ratio: PaneLayoutRatio.Detail,
    },
    context,
  );
  next = ensureWatchPane(
    next,
    openTypes,
    {
      anchorType: PaneType.Globe,
      direction: SplitDirection.Vertical,
      paneType: PaneType.AlertLog,
      ratio: PaneLayoutRatio.WatchAlerts,
    },
    context,
  );
  return ensureWatchPane(
    next,
    openTypes,
    {
      anchorType: PaneType.AlertLog,
      direction: SplitDirection.Horizontal,
      paneType: PaneType.IntelFeed,
      ratio: PaneLayoutRatio.Equal,
    },
    context,
  );
}

export function closePaneTypeInLayout(
  layout: LayoutState,
  paneType: PaneTypeValue,
): LayoutState {
  const target = collectLeaves(layout.root).find(
    (entry) => entry.paneType === paneType,
  );
  return target ? closePaneLayout(layout, target.id) : layout;
}

export function closePaneLayout(
  layout: LayoutState,
  leafId: string,
): LayoutState {
  const root = removeLeaf(layout.root, leafId);
  return root ? { ...layout, root } : defaultLayout();
}

export function minimizePaneLayout(
  layout: LayoutState,
  leafId: string,
  paneType: PaneTypeValue,
): LayoutState {
  const root = removeLeaf(layout.root, leafId);
  if (!root) {
    return layout;
  }
  const parent = findParentSplit(layout.root, leafId);
  return {
    root,
    minimized: [
      ...layout.minimized,
      {
        dir: parent?.dir ?? SplitDirection.Horizontal,
        id: leafId,
        paneType,
        ratio: parent?.ratio ?? PaneLayoutRatio.Equal,
        siblingId: parent?.siblingId ?? null,
        wasSecond: parent?.wasSecond ?? true,
      },
    ],
  };
}

export function restorePaneLayout(
  layout: LayoutState,
  minimizedIndex: number,
): LayoutState {
  const entry = layout.minimized[minimizedIndex];
  if (!entry) {
    return layout;
  }
  const restoredLeaf: LeafNode = {
    id: entry.id,
    paneType: entry.paneType,
    type: PaneNodeType.Leaf,
  };
  const minimized = layout.minimized.filter(
    (_entry, index) => index !== minimizedIndex,
  );

  if (entry.siblingId && hasNodeId(layout.root, entry.siblingId)) {
    const sibling = findNodeById(layout.root, entry.siblingId);
    if (sibling) {
      const restoredSplit = entry.wasSecond
        ? split(entry.dir, sibling, restoredLeaf, entry.ratio)
        : split(entry.dir, restoredLeaf, sibling, entry.ratio);
      return {
        minimized,
        root: replaceNode(
          layout.root,
          entry.siblingId,
          restoredSplit,
        ),
      };
    }
  }

  const root = entry.wasSecond
    ? split(entry.dir, layout.root, restoredLeaf, entry.ratio)
    : split(entry.dir, restoredLeaf, layout.root, entry.ratio);
  return { minimized, root };
}

export function resizePaneLayout(
  layout: LayoutState,
  splitId: string,
  ratio: number,
): LayoutState {
  return {
    ...layout,
    root: updateRatio(layout.root, splitId, ratio),
  };
}

export function changePaneTypeInLayout(
  layout: LayoutState,
  leafId: string,
  newType: PaneTypeValue,
): LayoutState {
  const existing = collectLeaves(layout.root).find(
    (entry) => entry.paneType === newType,
  );
  if (existing && existing.id !== leafId) {
    return swapPanesInLayout(layout, leafId, existing.id);
  }
  return {
    ...layout,
    root: replaceNode(layout.root, leafId, leaf(newType)),
  };
}

function swapLeafTypes(
  node: LayoutNode,
  sourceLeafId: string,
  sourceType: PaneTypeValue,
  targetLeafId: string,
  targetType: PaneTypeValue,
): LayoutNode {
  if (node.type === PaneNodeType.Leaf) {
    if (node.id === sourceLeafId) {
      return { ...node, paneType: targetType };
    }
    if (node.id === targetLeafId) {
      return { ...node, paneType: sourceType };
    }
    return node;
  }
  return {
    ...node,
    children: [
      swapLeafTypes(
        node.children[0],
        sourceLeafId,
        sourceType,
        targetLeafId,
        targetType,
      ),
      swapLeafTypes(
        node.children[1],
        sourceLeafId,
        sourceType,
        targetLeafId,
        targetType,
      ),
    ],
  };
}

export function swapPanesInLayout(
  layout: LayoutState,
  sourceLeafId: string,
  targetLeafId: string,
): LayoutState {
  if (sourceLeafId === targetLeafId) {
    return layout;
  }
  const source = findLeaf(layout.root, sourceLeafId);
  const target = findLeaf(layout.root, targetLeafId);
  if (!source || !target) {
    return layout;
  }
  return {
    ...layout,
    root: swapLeafTypes(
      layout.root,
      sourceLeafId,
      source.paneType,
      targetLeafId,
      target.paneType,
    ),
  };
}

function splitDirectionFor(
  zone: PaneEdgeDropZoneValue,
): SplitDirectionValue {
  return (
    zone === PaneDropZone.Left ||
    zone === PaneDropZone.Right
  )
    ? SplitDirection.Horizontal
    : SplitDirection.Vertical;
}

function sourcePrecedesTarget(zone: PaneEdgeDropZoneValue): boolean {
  return zone === PaneDropZone.Left || zone === PaneDropZone.Top;
}

export function insertPaneBesideInLayout(
  layout: LayoutState,
  sourceLeafId: string,
  targetLeafId: string,
  zone: PaneEdgeDropZoneValue,
): LayoutState {
  if (sourceLeafId === targetLeafId) {
    return layout;
  }
  const source = findLeaf(layout.root, sourceLeafId);
  const target = findLeaf(layout.root, targetLeafId);
  if (!source || !target) {
    return layout;
  }

  const rootWithoutSource = removeLeaf(layout.root, sourceLeafId);
  if (!rootWithoutSource) {
    return layout;
  }
  const targetAfterRemoval = findLeaf(rootWithoutSource, targetLeafId);
  if (!targetAfterRemoval) {
    return layout;
  }

  const movedLeaf = leaf(source.paneType);
  const direction = splitDirectionFor(zone);
  const movedSplit = sourcePrecedesTarget(zone)
    ? split(
      direction,
      movedLeaf,
      targetAfterRemoval,
      PaneLayoutRatio.Equal,
    )
    : split(
      direction,
      targetAfterRemoval,
      movedLeaf,
      PaneLayoutRatio.Equal,
    );
  return {
    ...layout,
    root: replaceNode(
      rootWithoutSource,
      targetLeafId,
      movedSplit,
    ),
  };
}
