import {
  FULL_WIDTH_ONLY,
  type LayoutNode,
  type LeafNode,
  type PaneType,
  type SplitNode,
} from "../../paneTree";
import type { PaneCatalog } from "../paneCatalog";
import { PaneIdSequence, PaneNodeType, PaneSearchIndex, SplitDirection } from "../model/pane";

enum MobileSplitTrack {
  Collapsed = "36px",
  Flexible = "1fr",
}

enum MobileTabClassName {
  Active = "text-sig-accent bg-sig-accent/10",
  Inactive = "text-sig-dim bg-transparent",
  Minimized = "text-sig-dim/50 bg-transparent",
}

export type MobileBlock = {
  readonly id: string;
  readonly leafIds: readonly string[];
  readonly node: LayoutNode;
  readonly primaryLeaf: LeafNode;
};

export type MobileSplitTracks = {
  readonly first: string;
  readonly second: string;
};

export function mobileSplitTracks(
  node: SplitNode,
  minimizedLeaves: ReadonlySet<string>,
): MobileSplitTracks {
  const proportionalTracks = {
    first: `${node.ratio}fr`,
    second: `${1 - node.ratio}fr`,
  };
  if (node.direction !== SplitDirection.Horizontal) {
    return proportionalTracks;
  }
  const [firstChild, secondChild] = node.children;
  const firstMinimized =
    firstChild.type === PaneNodeType.Leaf && minimizedLeaves.has(firstChild.id);
  const secondMinimized =
    secondChild.type === PaneNodeType.Leaf && minimizedLeaves.has(secondChild.id);
  if (firstMinimized === secondMinimized) {
    return proportionalTracks;
  }
  return firstMinimized
    ? { first: MobileSplitTrack.Collapsed, second: MobileSplitTrack.Flexible }
    : { first: MobileSplitTrack.Flexible, second: MobileSplitTrack.Collapsed };
}

export function horizontalLeafId(
  splitNode: SplitNode,
  childNode: LayoutNode,
): string | undefined {
  return splitNode.direction === SplitDirection.Horizontal &&
    childNode.type === PaneNodeType.Leaf
    ? childNode.id
    : undefined;
}

export function mobileTabClassName(
  active: boolean,
  minimized: boolean,
): MobileTabClassName {
  if (active) return MobileTabClassName.Active;
  return minimized ? MobileTabClassName.Minimized : MobileTabClassName.Inactive;
}

export function moveSourcePaneType(
  leaves: readonly LeafNode[],
  sourceLeafId: string | null,
): PaneType | undefined {
  return sourceLeafId === null
    ? undefined
    : leaves.find((leaf) => leaf.id === sourceLeafId)?.paneType;
}

export function isMoveSourceBlock(
  block: MobileBlock,
  sourceLeafId: string | null,
): boolean {
  return sourceLeafId !== null && block.leafIds.includes(sourceLeafId);
}

export function isMoveTargetBlock(
  block: MobileBlock,
  sourceLeafId: string | null,
): boolean {
  return sourceLeafId !== null && !block.leafIds.includes(sourceLeafId);
}

export function allowsBesideMove(
  sourceType: PaneType | undefined,
  targetType: PaneType,
): boolean {
  return sourceType !== undefined &&
    !FULL_WIDTH_ONLY.has(sourceType) &&
    !FULL_WIDTH_ONLY.has(targetType);
}

export function mobileBlockLabel(
  block: MobileBlock,
  leaves: readonly LeafNode[],
  catalog: PaneCatalog,
): string {
  if (block.node.type === PaneNodeType.Leaf) {
    return catalog[block.node.paneType].label;
  }
  const labels = block.leafIds.flatMap((id) => {
    const leaf = leaves.find((candidate) => candidate.id === id);
    return leaf ? [catalog[leaf.paneType].label] : [];
  });
  return labels.length <= 2
    ? labels.join(" | ")
    : `${labels[0]} +${labels.length - 1}`;
}

function appendMissingBlockIds(
  currentOrder: readonly string[],
  addedIds: readonly string[],
): string[] {
  const nextOrder = [...currentOrder];
  for (const addedId of addedIds) {
    if (!nextOrder.includes(addedId)) {
      nextOrder.push(addedId);
    }
  }
  return nextOrder;
}

export function reconcileMobileBlockOrder(
  previousOrder: readonly string[],
  addedIds: readonly string[],
  removedIds: ReadonlySet<string>,
): string[] {
  const retainedOrder = previousOrder.filter((id) => !removedIds.has(id));
  const firstRemovedIndex = previousOrder.findIndex((id) =>
    removedIds.has(id),
  );
  if (firstRemovedIndex === PaneSearchIndex.NotFound) {
    return appendMissingBlockIds(retainedOrder, addedIds);
  }

  const nextOrder = [...retainedOrder];
  const insertionIndex = Math.min(firstRemovedIndex, nextOrder.length);
  let insertionOffset = PaneIdSequence.Start;
  for (const addedId of addedIds) {
    if (!nextOrder.includes(addedId)) {
      nextOrder.splice(insertionIndex + insertionOffset, 0, addedId);
      insertionOffset += PaneIdSequence.Step;
    }
  }
  return nextOrder;
}

export function collectFirstLeaf(node: LayoutNode): LeafNode {
  if (node.type === PaneNodeType.Leaf) {
    return node;
  }
  return collectFirstLeaf(node.children[0]);
}

export function collectLeafIds(node: LayoutNode): string[] {
  if (node.type === PaneNodeType.Leaf) {
    return [node.id];
  }
  return [
    ...collectLeafIds(node.children[0]),
    ...collectLeafIds(node.children[1]),
  ];
}

export function collectMobileBlocks(root: LayoutNode): MobileBlock[] {
  if (root.type === PaneNodeType.Leaf) {
    return [
      {
        id: root.id,
        leafIds: [root.id],
        node: root,
        primaryLeaf: root,
      },
    ];
  }

  if (
    root.direction === SplitDirection.Horizontal &&
    root.children[0].type === PaneNodeType.Leaf &&
    root.children[1].type === PaneNodeType.Leaf
  ) {
    return [
      {
        id: root.id,
        leafIds: [root.children[0].id, root.children[1].id],
        node: root,
        primaryLeaf: collectFirstLeaf(root),
      },
    ];
  }

  return [
    ...collectMobileBlocks(root.children[0]),
    ...collectMobileBlocks(root.children[1]),
  ];
}
