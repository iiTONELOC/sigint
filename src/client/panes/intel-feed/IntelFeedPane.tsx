import { useCallback, useEffect, useMemo, useState } from "react";
import { Domain } from "@shared/domain/identity";
import { useWatch, WatchSource } from "@/context/WatchContext";
import { useDataContext } from "@/context/DataContext";
import { useUI } from "@/context/UIContext";
import type { DataType } from "@/features/base/dataPoints";
import { useSourceTables } from "@/features/base/useSourceTables";
import { mergeSortedPrefixes } from "@/lib/data/mergeSortedPrefix";
import { useItemSelectHandlers } from "@/selection";
import { useVirtualScroll } from "@/virtual-scroll";
import {
  TableSortDirection,
  TableSortKey,
} from "@/workers/data/uiQuery";
import { IntelFeedToolbar } from "./components/IntelFeedToolbar";
import { IntelProductList } from "./components/IntelProductList";
import { RawIntelFeed } from "./components/RawIntelFeed";
import { useIntelFeedStylesheet } from "./hooks/useIntelFeedStylesheet";
import { IntelFeedVirtualization } from "./model/feed";
import { compareNewestFirst } from "./utils/sort";

export function IntelFeedPane() {
  const { correlation, layers } = useDataContext();
  const {
    selectedCurrent,
    setSelected,
    selectAndZoom,
    setRevealId,
  } = useUI();
  const {
    watchActive,
    watchMode,
    watchProgress,
  } = useWatch();
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

  const disabled = useMemo(
    () => ({
      [Domain.Aircraft]: true,
      [Domain.Cyclones]: true,
      [Domain.Earthquake]: !layers[Domain.Quakes],
      [Domain.Fire]: !layers[Domain.Fires],
      [Domain.Ships]: true,
    }),
    [layers],
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
