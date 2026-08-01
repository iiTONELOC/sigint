import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { VirtualScrollPolicy } from "../model";
import { calculateVirtualWindow } from "../utils";

type UseVirtualScrollOptions = Readonly<{
  itemCount: number;
  overscan?: number;
  rowHeight: number;
}>;

type UseVirtualScrollResult = Readonly<{
  endIdx: number;
  offsetY: number;
  onScroll: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollToIndex: (index: number) => void;
  scrollToTop: () => void;
  startIdx: number;
  totalHeight: number;
  viewportH: number;
}>;

export function useVirtualScroll({
  itemCount,
  rowHeight,
  overscan = VirtualScrollPolicy.DefaultOverscanRows,
}: UseVirtualScrollOptions): UseVirtualScrollResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState<number>(
    VirtualScrollPolicy.Start,
  );
  const [viewportH, setViewportH] = useState<number>(
    VirtualScrollPolicy.Start,
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportH(entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  const {
    endIdx,
    offsetY,
    startIdx,
    totalHeight,
  } = calculateVirtualWindow({
    itemCount,
    overscan,
    rowHeight,
    scrollTop,
    viewportHeight: viewportH,
  });

  const scrollToTop = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = VirtualScrollPolicy.Start;
    }
    setScrollTop(VirtualScrollPolicy.Start);
  }, []);

  const scrollToIndex = useCallback(
    (index: number) => {
      const element = scrollRef.current;
      if (!element) return;
      const rowTop = index * rowHeight;
      const rowBottom = rowTop + rowHeight;
      const visibleTop = element.scrollTop;
      const visibleBottom = visibleTop + viewportH;
      if (rowTop >= visibleTop && rowBottom <= visibleBottom) return;
      element.scrollTop = Math.max(
        VirtualScrollPolicy.Start,
        rowTop -
          viewportH / VirtualScrollPolicy.CenterDivisor +
          rowHeight / VirtualScrollPolicy.CenterDivisor,
      );
    },
    [rowHeight, viewportH],
  );

  return {
    endIdx,
    offsetY,
    onScroll,
    scrollRef,
    scrollToIndex,
    scrollToTop,
    startIdx,
    totalHeight,
    viewportH,
  };
}
