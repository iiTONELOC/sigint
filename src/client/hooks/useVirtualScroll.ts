import { useState, useCallback, useRef, useEffect, useMemo } from "react";

type UseVirtualScrollOptions = {
  /** Total number of items in the list */
  itemCount: number;
  /** Fixed height per row in pixels */
  rowHeight: number;
  /** Extra rows rendered above/below the viewport */
  overscan?: number;
};

type UseVirtualScrollResult = {
  /** Attach to the scrollable container element */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Total height of the virtualized content (px) — set on the inner spacer div */
  totalHeight: number;
  /** Y offset for the visible slice container (px) */
  offsetY: number;
  /** First visible index (inclusive) */
  startIdx: number;
  /** Last visible index (exclusive) */
  endIdx: number;
  /** Scroll event handler — attach to the scrollable container */
  onScroll: () => void;
  /** Current viewport height (px) — useful for auto-scroll calculations */
  viewportH: number;
  /** Reset scroll position to top */
  scrollToTop: () => void;
  /** Scroll to bring a specific index into view (centered) */
  scrollToIndex: (index: number) => void;
};

export function useVirtualScroll({
  itemCount,
  rowHeight,
  overscan = 6,
}: UseVirtualScrollOptions): UseVirtualScrollResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Track viewport size
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) setViewportH(entry.contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const totalHeight = itemCount * rowHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIdx = Math.min(
    itemCount,
    Math.ceil((scrollTop + viewportH) / rowHeight) + overscan,
  );
  const offsetY = startIdx * rowHeight;

  const scrollToTop = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, []);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!scrollRef.current) return;
      const el = scrollRef.current;
      const rowTop = index * rowHeight;
      const rowBot = rowTop + rowHeight;
      const visTop = el.scrollTop;
      const visBot = visTop + viewportH;
      // Already visible — skip
      if (rowTop >= visTop && rowBot <= visBot) return;
      // Center in viewport
      el.scrollTop = Math.max(0, rowTop - viewportH / 2 + rowHeight / 2);
    },
    [rowHeight, viewportH],
  );

  return {
    scrollRef,
    totalHeight,
    offsetY,
    startIdx,
    endIdx,
    onScroll,
    viewportH,
    scrollToTop,
    scrollToIndex,
  };
}
