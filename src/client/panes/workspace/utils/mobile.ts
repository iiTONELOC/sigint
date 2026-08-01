import type { LayoutNode, LeafNode } from "../../paneTree";
import { PaneNodeType, PaneSearchIndex, SplitDirection } from "../model";

enum MobileOrderSequence {
  Start = 0,
  Step = 1,
}

export type MobileBlock = {
  readonly id: string;
  readonly leafIds: readonly string[];
  readonly node: LayoutNode;
  readonly primaryLeaf: LeafNode;
};

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
  let insertionOffset = MobileOrderSequence.Start;
  for (const addedId of addedIds) {
    if (!nextOrder.includes(addedId)) {
      nextOrder.splice(insertionIndex + insertionOffset, 0, addedId);
      insertionOffset += MobileOrderSequence.Step;
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
