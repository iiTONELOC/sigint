// The list panes (alert-log, intel-feed, data-table) each wrote the same two
// row handlers: click → select + gentle reveal; zoom button → stop-propagation
// + select-and-zoom. This is the one owner so the interaction stays identical.

import { useCallback } from "react";
import type { MouseEvent } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { revealThenClear } from "./revealSignals";

type SetId = (id: string | null) => void;

export type ItemSelectHandlers = {
  /** Row click: select the item and pulse a gentle reveal on the globe. */
  handleClick: (item: DataPoint) => void;
  /** Zoom button: don't bubble to the row, then select-and-zoom. */
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

  const handleZoom = useCallback(
    (item: DataPoint, e: MouseEvent) => {
      e.stopPropagation();
      selectAndZoom(item);
    },
    [selectAndZoom],
  );

  return { handleClick, handleZoom };
}
