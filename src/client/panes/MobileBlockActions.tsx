import { useState } from "react";
import { MobileSheet } from "@/components/MobileSheet";
import { ButtonType } from "@/lib/ui/button";
import { cn } from "@/lib/ui/utils";
import { FULL_WIDTH_ONLY } from "./paneTree";
import type { PaneTypeValue } from "@/panes/workspace/model/pane";
import { PaneTypeList } from "./SplitMenu";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";
import type { MobileBlock } from "@/panes/workspace/utils/mobile";
import {
  PaneNodeType,
  PaneType as PaneTypeId,
  SplitDirection,
  type SplitDirectionValue,
} from "@/panes/workspace/model/pane";

export enum MobileBlockActionLabel {
  AddBeside = "ADD A VIEW BESIDE",
  AddBelow = "ADD A VIEW BELOW",
  Back = "BACK",
  ChangeView = "CHANGE VIEW",
  Close = "CLOSE",
  CloseSheet = "Close view actions",
  Expand = "EXPAND",
  Minimize = "MINIMIZE",
  Move = "MOVE",
}

type MobileBlockTypePick =
  | MobileBlockActionLabel.AddBeside
  | MobileBlockActionLabel.AddBelow
  | MobileBlockActionLabel.ChangeView;

enum MobileBlockActionClassName {
  Destructive = "text-sig-danger hover:bg-sig-danger/10",
  List = "flex flex-col",
  Row = "w-full text-left px-3 py-2.5 flex items-center gap-2 rounded text-(length:--sig-text-md) tracking-wider font-semibold bg-transparent border-none transition-colors min-h-11",
  Standard = "text-sig-text hover:bg-sig-accent/10",
}

type MobileBlockAction = Readonly<{
  destructive?: boolean;
  label: MobileBlockActionLabel;
  onClick: () => void;
  tourId?: string;
}>;

export type MobileBlockActionsProps = Readonly<{
  availableTypes: readonly PaneTypeValue[];
  block: MobileBlock;
  isMinimized: boolean;
  label: string;
  onChangePaneType: (leafId: string, paneType: PaneTypeValue) => void;
  onClosePane: (leafId: string) => void;
  onDismiss: () => void;
  onMove: (leafId: string) => void;
  onSplit: (
    leafId: string,
    direction: SplitDirectionValue,
    paneType: PaneTypeValue,
  ) => void;
  onToggleMinimize: (blockId: string) => void;
  paneCatalog: PaneCatalog;
  totalLeafCount: number;
}>;

function pickDirection(pick: MobileBlockTypePick): SplitDirectionValue {
  return pick === MobileBlockActionLabel.AddBeside
    ? SplitDirection.Horizontal
    : SplitDirection.Vertical;
}

function pickTypes(
  pick: MobileBlockTypePick,
  currentType: PaneTypeValue,
  availableTypes: readonly PaneTypeValue[],
): readonly PaneTypeValue[] {
  return pick === MobileBlockActionLabel.ChangeView
    ? Object.values(PaneTypeId).filter((type) => type !== currentType)
    : availableTypes;
}

function blockActions(
  props: MobileBlockActionsProps,
  startPick: (pick: MobileBlockTypePick) => void,
  finish: (action: () => void) => void,
): MobileBlockAction[] {
  const {
    availableTypes,
    block,
    isMinimized,
    onClosePane,
    onMove,
    onToggleMinimize,
    totalLeafCount,
  } = props;
  const leaf = block.primaryLeaf;
  const isLeaf = block.node.type === PaneNodeType.Leaf;
  const canAdd = isLeaf && availableTypes.length > 0;
  const actions: MobileBlockAction[] = [];
  if (isLeaf) {
    actions.push({
      label: MobileBlockActionLabel.ChangeView,
      onClick: () => startPick(MobileBlockActionLabel.ChangeView),
      tourId: "block-action-change",
    });
  }
  if (canAdd && !FULL_WIDTH_ONLY.has(leaf.paneType)) {
    actions.push({
      label: MobileBlockActionLabel.AddBeside,
      onClick: () => startPick(MobileBlockActionLabel.AddBeside),
      tourId: "block-action-split-right",
    });
  }
  if (canAdd) {
    actions.push({
      label: MobileBlockActionLabel.AddBelow,
      onClick: () => startPick(MobileBlockActionLabel.AddBelow),
      tourId: "block-action-split-down",
    });
  }
  actions.push({
    label: MobileBlockActionLabel.Move,
    onClick: () => finish(() => onMove(leaf.id)),
    tourId: "block-action-move",
  });
  actions.push({
    label: isMinimized
      ? MobileBlockActionLabel.Expand
      : MobileBlockActionLabel.Minimize,
    onClick: () => finish(() => onToggleMinimize(block.id)),
  });
  if (isLeaf && totalLeafCount > 1) {
    actions.push({
      destructive: true,
      label: MobileBlockActionLabel.Close,
      onClick: () => finish(() => onClosePane(leaf.id)),
    });
  }
  return actions;
}

function ActionRow({
  destructive = false,
  label,
  onClick,
  tourId,
}: MobileBlockAction) {
  return (
    <button
      type={ButtonType.Button}
      data-tour={tourId}
      onClick={onClick}
      className={cn(
        MobileBlockActionClassName.Row,
        destructive
          ? MobileBlockActionClassName.Destructive
          : MobileBlockActionClassName.Standard,
      )}
    >
      {label}
    </button>
  );
}

export function MobileBlockActions(props: MobileBlockActionsProps) {
  const {
    availableTypes,
    block,
    label,
    onChangePaneType,
    onDismiss,
    onSplit,
    paneCatalog,
  } = props;
  const [pick, setPick] = useState<MobileBlockTypePick | null>(null);
  const leaf = block.primaryLeaf;

  const finish = (action: () => void): void => {
    action();
    onDismiss();
  };
  const startPick = (next: MobileBlockTypePick): void => {
    const onlyType =
      availableTypes.length === 1 ? availableTypes[0] : undefined;
    if (next !== MobileBlockActionLabel.ChangeView && onlyType) {
      finish(() => onSplit(leaf.id, pickDirection(next), onlyType));
      return;
    }
    setPick(next);
  };
  const selectType = (type: PaneTypeValue): void => {
    if (pick === null) return;
    finish(() => {
      if (pick === MobileBlockActionLabel.ChangeView) {
        onChangePaneType(leaf.id, type);
      } else {
        onSplit(leaf.id, pickDirection(pick), type);
      }
    });
  };

  return (
    <MobileSheet
      closeLabel={MobileBlockActionLabel.CloseSheet}
      label={pick ?? label}
      onClose={onDismiss}
    >
      <div className={MobileBlockActionClassName.List}>
        {pick ? (
          <>
            <ActionRow
              label={MobileBlockActionLabel.Back}
              onClick={() => setPick(null)}
            />
            <PaneTypeList
              catalog={paneCatalog}
              onSelect={selectType}
              types={pickTypes(pick, leaf.paneType, availableTypes)}
            />
          </>
        ) : (
          blockActions(props, startPick, finish).map((action) => (
            <ActionRow key={action.label} {...action} />
          ))
        )}
      </div>
    </MobileSheet>
  );
}
