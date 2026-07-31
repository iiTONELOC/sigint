import { useCallback } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { revealThenClear } from "./revealSignals";

type SetId = (id: string | null) => void;

enum RowActivationKey {
  Enter = "Enter",
  Space = " ",
}

function isRowActivationKey(key: string): boolean {
  return key === RowActivationKey.Enter || key === RowActivationKey.Space;
}

export type ItemSelectHandlers = {
  handleClick: (item: DataPoint) => void;
  handleKeyDown: (item: DataPoint, e: KeyboardEvent) => void;
  handleZoom: (item: DataPoint, e: MouseEvent) => void;
};

export function useItemSelectHandlers(
  setSelected: (item: DataPoint) => void,
  setRevealId: SetId,
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
    (item: DataPoint, e: KeyboardEvent) => {
      if (!isRowActivationKey(e.key)) return;
      e.preventDefault();
      handleClick(item);
    },
    [handleClick],
  );

  const handleZoom = useCallback(
    (item: DataPoint, e: MouseEvent) => {
      e.stopPropagation();
      selectAndZoom(item);
    },
    [selectAndZoom],
  );

  return { handleClick, handleKeyDown, handleZoom };
}
