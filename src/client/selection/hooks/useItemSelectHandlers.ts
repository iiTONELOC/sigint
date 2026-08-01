import { useCallback, type KeyboardEvent, type MouseEvent } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { DomKey } from "@/runtime";
import type { SelectionIdSetter } from "../model";
import { revealThenClear } from "../utils";

function isRowActivationKey(key: string): boolean {
  return key === DomKey.Enter || key === DomKey.Space;
}

export type ItemSelectHandlers = Readonly<{
  handleClick: (item: DataPoint) => void;
  handleKeyDown: (item: DataPoint, event: KeyboardEvent) => void;
  handleZoom: (item: DataPoint, event: MouseEvent) => void;
}>;

export function useItemSelectHandlers(
  setSelected: (item: DataPoint) => void,
  setRevealId: SelectionIdSetter,
  selectAndZoom: (item: DataPoint) => void,
): ItemSelectHandlers {
  const handleClick = useCallback(
    (item: DataPoint) => {
      setSelected(item);
      revealThenClear(setRevealId, item.id);
    },
    [setSelected, setRevealId],
  );

  const handleKeyDown = useCallback(
    (item: DataPoint, event: KeyboardEvent) => {
      if (!isRowActivationKey(event.key)) return;
      event.preventDefault();
      handleClick(item);
    },
    [handleClick],
  );

  const handleZoom = useCallback(
    (item: DataPoint, event: MouseEvent) => {
      event.stopPropagation();
      selectAndZoom(item);
    },
    [selectAndZoom],
  );

  return { handleClick, handleKeyDown, handleZoom };
}
