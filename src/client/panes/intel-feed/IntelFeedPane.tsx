import { useCallback, useEffect, useMemo, useState } from "react";
import { Domain } from "@shared/domain/identity";
import { WatchSource } from "@/context/WatchContext";
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
  IntelFeedToolbar,
  IntelProductList,
  RawIntelFeed,
} from "./components";
import { useIntelFeedStylesheet } from "./hooks";
import { IntelFeedVirtualization } from "./model";
import { compareNewestFirst } from "./utils";

export function IntelFeedPane() {
  const {
    selectedCurrent,
    setSelected,
    selectAndZoom,
    setRevealId,
    correlation,
    watchActive,
    watchMode,
    watchProgress,
    earthquakeFilter,
    fireFilter,
  } = useData();
  const [isRawView, setIsRawView] = useState(false);
  const [feedFilter, setFeedFilter] = useState<DataType | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sourcePrefixLimit, setSourcePrefixLimit] = useState(
    IntelFeedVirtualization.Overscan *
      IntelFeedVirtualization.InitialPageMultiplier,
  );

  const isWatchingIntel =
    watchActive &&
    (watchMode.source === WatchSource.Intel ||
      watchMode.source === WatchSource.All);
  const isIntelActive =
    isWatchingIntel && watchMode.currentItemSource === WatchSource.Intel;
  const watchTargetProductId = useMemo(() => {
    if (!isIntelActive || !watchMode.currentId) return null;
    const product = correlation.products.find((candidate) =>
      candidate.sources.some(
        (source) => source.id === watchMode.currentId,
      ),
    );
    return product?.id ?? null;
  }, [correlation.products, isIntelActive, watchMode.currentId]);

  const minValues = useMemo(
    () => ({
      [Domain.Earthquake]: earthquakeFilter.minMagnitude,
      [Domain.Fire]: fireFilter.minConfidence,
    }),
    [earthquakeFilter.minMagnitude, fireFilter.minConfidence],
  );
  const disabled = useMemo(
    () => ({
      [Domain.Aircraft]: true,
      [Domain.Cyclones]: true,
      [Domain.Earthquake]: !earthquakeFilter.enabled,
      [Domain.Fire]: !fireFilter.enabled,
      [Domain.Ships]: true,
    }),
    [earthquakeFilter.enabled, fireFilter.enabled],
  );
  const {
    prefixes: rawPrefixes,
    totals: typeCounts,
    itemCount: rawItemCount,
  } = useSourceTables({
    sortKey: TableSortKey.Age,
    sortDirection: TableSortDirection.Ascending,
    limit: sourcePrefixLimit,
    pointType: feedFilter,
    minValues,
    disabled,
  });

  const { scrollRef, totalHeight, offsetY, startIdx, endIdx, onScroll } =
    useVirtualScroll({
      itemCount: rawItemCount,
      rowHeight: IntelFeedVirtualization.RawRowHeight,
      overscan: IntelFeedVirtualization.Overscan,
    });
  useEffect(() => {
    if (endIdx > sourcePrefixLimit) setSourcePrefixLimit(endIdx);
  }, [endIdx, sourcePrefixLimit]);

  const visibleRawItems = useMemo(
    () =>
      mergeSortedPrefixes(rawPrefixes, compareNewestFirst, endIdx).slice(
        startIdx,
        endIdx,
      ),
    [rawPrefixes, startIdx, endIdx],
  );
  const styleAttributes = useIntelFeedStylesheet(
    totalHeight,
    offsetY,
    watchProgress,
  );
  const { handleClick: handleItemClick, handleZoom: handleZoomTo } =
    useItemSelectHandlers(setSelected, setRevealId, selectAndZoom);
  const toggleExpand = useCallback((id: string) => {
    setExpandedId((currentId) => (currentId === id ? null : id));
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      <IntelFeedToolbar
        feedFilter={feedFilter}
        isIntelActive={isIntelActive}
        isRawView={isRawView}
        onFeedFilterChange={setFeedFilter}
        onRawViewChange={setIsRawView}
        productCount={correlation.products.length}
        rawItemCount={rawItemCount}
        typeCounts={typeCounts}
      />
      {isIntelActive && (
        <div className="h-0.5 bg-sig-border/20 shrink-0">
          <div
            {...styleAttributes.progress}
            className="h-full bg-sig-accent transition-all duration-100"
          />
        </div>
      )}
      {!isRawView && (
        <IntelProductList
          expandedId={expandedId}
          isIntelActive={isIntelActive}
          onItemClick={handleItemClick}
          onToggleExpand={toggleExpand}
          onZoomTo={handleZoomTo}
          products={correlation.products}
          selectedId={selectedCurrent?.id ?? null}
          watchTargetProductId={watchTargetProductId}
        />
      )}
      {isRawView && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto sigint-scroll"
        >
          <RawIntelFeed
            allowSelectionHighlight={!watchActive || isIntelActive}
            itemCount={rawItemCount}
            onItemClick={handleItemClick}
            onZoomTo={handleZoomTo}
            selectedId={selectedCurrent?.id ?? null}
            styleAttributes={styleAttributes}
            visibleItems={visibleRawItems}
          />
        </div>
      )}
    </div>
  );
}
