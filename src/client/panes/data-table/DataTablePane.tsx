import { useCallback, useEffect, useMemo, useState } from "react";
import { Domain } from "@shared/domain/identity";
import { isMobileWidth } from "@/config/breakpoints";
import { useData } from "@/context/DataContext";
import type { DataType } from "@/features/base/dataPoints";
import { useSourceTables } from "@/features/base/useSourceTables";
import { mergeSortedPrefixes } from "@/lib/data/mergeSortedPrefix";
import { useItemSelectHandlers } from "@/selection";
import { useVirtualScroll } from "@/virtual-scroll";
import {
  TableSortDirection,
  TableSortKey,
} from "@/workers/data/uiQuery";
import {
  DataTableHeader,
  DataTableRows,
  DataTableToolbar,
} from "./components";
import { DataTableCopy, DataTableVirtualization } from "./model";
import { compareDataTablePoints } from "./utils";

export function DataTablePane() {
  const {
    selectedCurrent,
    setSelected,
    selectAndZoom,
    setRevealId,
    earthquakeFilter,
    fireFilter,
  } = useData();
  const [sortKey, setSortKey] = useState(TableSortKey.Type);
  const [sortDirection, setSortDirection] = useState(
    TableSortDirection.Ascending,
  );
  const [typeFilter, setTypeFilter] = useState<DataType | null>(null);
  const [sourcePrefixLimit, setSourcePrefixLimit] = useState(
    DataTableVirtualization.Overscan *
      DataTableVirtualization.InitialPageMultiplier,
  );

  const minValues = useMemo(
    () => ({
      [Domain.Earthquake]: earthquakeFilter.minMagnitude,
      [Domain.Fire]: fireFilter.minConfidence,
    }),
    [earthquakeFilter.minMagnitude, fireFilter.minConfidence],
  );
  const disabled = useMemo(
    () => ({
      [Domain.Earthquake]: !earthquakeFilter.enabled,
      [Domain.Fire]: !fireFilter.enabled,
    }),
    [earthquakeFilter.enabled, fireFilter.enabled],
  );
  const { prefixes, totals, itemCount } = useSourceTables({
    sortKey,
    sortDirection,
    limit: sourcePrefixLimit,
    pointType: typeFilter,
    minValues,
    disabled,
  });

  const {
    scrollRef,
    totalHeight,
    offsetY,
    startIdx,
    endIdx,
    onScroll,
    scrollToIndex,
  } = useVirtualScroll({
    itemCount,
    rowHeight: DataTableVirtualization.RowHeight,
    overscan: DataTableVirtualization.Overscan,
  });

  useEffect(() => {
    if (endIdx > sourcePrefixLimit) setSourcePrefixLimit(endIdx);
  }, [endIdx, sourcePrefixLimit]);

  const visibleItems = useMemo(
    () =>
      mergeSortedPrefixes(
        prefixes,
        (left, right) =>
          compareDataTablePoints(left, right, sortKey, sortDirection),
        endIdx,
      ).slice(startIdx, endIdx),
    [prefixes, sortKey, sortDirection, startIdx, endIdx],
  );

  useEffect(() => {
    if (!selectedCurrent) return;
    const prefix = mergeSortedPrefixes(
      prefixes,
      (left, right) =>
        compareDataTablePoints(left, right, sortKey, sortDirection),
      sourcePrefixLimit,
    );
    const index = prefix.findIndex((item) => item.id === selectedCurrent.id);
    if (index >= 0) scrollToIndex(index);
  }, [
    selectedCurrent,
    prefixes,
    sortKey,
    sortDirection,
    sourcePrefixLimit,
    scrollToIndex,
  ]);

  const handleSort = useCallback((key: TableSortKey) => {
    setSortKey((currentKey) => {
      if (currentKey !== key) {
        setSortDirection(TableSortDirection.Ascending);
        return key;
      }
      setSortDirection((currentDirection) =>
        currentDirection === TableSortDirection.Ascending
          ? TableSortDirection.Descending
          : TableSortDirection.Ascending,
      );
      return currentKey;
    });
  }, []);

  const {
    handleClick: handleRowClick,
    handleZoom: handleZoomTo,
    handleKeyDown: handleRowKeyDown,
  } = useItemSelectHandlers(setSelected, setRevealId, selectAndZoom);
  const isMobile =
    typeof window !== "undefined" && isMobileWidth(window.innerWidth);

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      <DataTableToolbar
        featureCounts={totals}
        itemCount={itemCount}
        onTypeFilterChange={setTypeFilter}
        typeFilter={typeFilter}
      />
      <DataTableHeader
        isMobile={isMobile}
        onSort={handleSort}
        sortDirection={sortDirection}
        sortKey={sortKey}
      />
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <DataTableRows
          isMobile={isMobile}
          offsetY={offsetY}
          onRowClick={handleRowClick}
          onRowKeyDown={handleRowKeyDown}
          onZoomTo={handleZoomTo}
          selectedId={selectedCurrent?.id ?? null}
          totalHeight={totalHeight}
          visibleItems={visibleItems}
        />
        {itemCount === 0 && (
          <div className="flex items-center justify-center h-full text-sig-dim text-(length:--sig-text-md)">
            {DataTableCopy.NoMatches}
          </div>
        )}
      </div>
    </div>
  );
}
