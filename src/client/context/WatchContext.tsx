import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CorrelationResult } from "@/lib/correlationEngine";
import { requestWatchLayout } from "@/lib/layoutSignals";
import { useUI } from "@/context/UIContext";

// ── Types ───────────────────────────────────────────────────────────

export type WatchSource = "alerts" | "intel" | "all";

type WatchMode = {
  active: boolean;
  paused: boolean;
  source: WatchSource;
  index: number;
  items: DataPoint[];
  currentId: string | null;
  /** Which list the current item came from — "alerts" or "intel" */
  currentItemSource: "alerts" | "intel" | null;
};

const WATCH_DWELL_MS = 8000;

// ── Context value type ──────────────────────────────────────────────

type WatchContextValue = {
  watchMode: WatchMode;
  watchSource: WatchSource;
  watchIndex: number;
  watchActive: boolean;
  watchPaused: boolean;
  /** 0-1 progress through current dwell period */
  watchProgress: number;
  startWatch: (source: WatchSource) => void;
  stopWatch: () => void;
  pauseWatch: () => void;
  resumeWatch: () => void;
};

const WatchContext = createContext<WatchContextValue | undefined>(undefined);

// ── Provider ────────────────────────────────────────────────────────

export function WatchProvider({
  children,
  correlation,
}: {
  children: ReactNode;
  correlation: CorrelationResult;
}) {
  const {
    selectedCurrent,
    setSelected,
    setAutoRotate,
    setRevealId,
  } = useUI();

  const [watchState, setWatchState] = useState<WatchMode>({
    active: false,
    paused: false,
    source: "alerts",
    index: 0,
    items: [],
    currentId: null,
    currentItemSource: null,
  });

  // Build the watch item list with origin tracking
  type WatchEntry = { item: DataPoint; origin: "alerts" | "intel" };
  const watchEntries = useMemo<WatchEntry[]>(() => {
    const seen = new Set<string>();
    const entries: WatchEntry[] = [];

    const addUnique = (dp: DataPoint, origin: "alerts" | "intel") => {
      if (!seen.has(dp.id)) {
        seen.add(dp.id);
        entries.push({ item: dp, origin });
      }
    };

    const src = watchState.source;

    if (src === "all") {
      type Scored = {
        item: DataPoint;
        score: number;
        origin: "alerts" | "intel";
      };
      const merged: Scored[] = [];
      for (const a of correlation.alerts) {
        merged.push({ item: a.item, score: a.score, origin: "alerts" });
      }
      for (const p of correlation.products) {
        if (p.sources.length > 0) {
          merged.push({
            item: p.sources[0]!,
            score: p.priority,
            origin: "intel",
          });
        }
      }
      merged.sort((a, b) => b.score - a.score);
      for (const m of merged) addUnique(m.item, m.origin);
    } else if (src === "alerts") {
      for (const a of correlation.alerts) addUnique(a.item, "alerts");
    } else {
      for (const p of correlation.products) {
        if (p.sources.length > 0) addUnique(p.sources[0]!, "intel");
      }
    }
    return entries;
  }, [correlation, watchState.source]);

  const watchItems = useMemo(
    () => watchEntries.map((e) => e.item),
    [watchEntries],
  );

  // Refs for interval callbacks
  const watchEntriesRef = useRef(watchEntries);
  const watchItemsRef = useRef(watchItems);
  const watchStateRef = useRef(watchState);
  watchEntriesRef.current = watchEntries;
  watchItemsRef.current = watchItems;
  watchStateRef.current = watchState;

  const startWatch = useCallback(
    (source: WatchSource) => {
      setWatchState({
        active: true,
        paused: false,
        source,
        index: 0,
        items: [],
        currentId: null,
        currentItemSource: null,
      });
      setTimeout(() => {
        requestWatchLayout();
        setAutoRotate(true);
      }, 0);
    },
    [setAutoRotate],
  );

  const stopWatch = useCallback(() => {
    setWatchState((prev) => ({
      ...prev,
      active: false,
      paused: false,
      currentId: null,
      currentItemSource: null,
    }));
    setAutoRotate(false);
    setRevealId(null);
  }, [setAutoRotate, setRevealId]);

  const pauseWatch = useCallback(() => {
    setWatchState((prev) => {
      if (!prev.active) return prev;
      return { ...prev, paused: true };
    });
    setTimeout(() => {
      setAutoRotate(false);
      setRevealId(null);
    }, 0);
  }, [setAutoRotate, setRevealId]);

  const resumeGraceRef = useRef(false);

  const resumeWatch = useCallback(() => {
    resumeGraceRef.current = true;
    setWatchState((prev) => {
      if (!prev.active) return prev;
      return { ...prev, paused: false };
    });
    setTimeout(() => {
      setAutoRotate(true);
      setTimeout(() => {
        resumeGraceRef.current = false;
      }, 500);
    }, 0);
  }, [setAutoRotate]);

  // Keep watch layout alive during watch
  useEffect(() => {
    if (!watchState.active) return;
    const id = setInterval(() => requestWatchLayout(), 3000);
    return () => clearInterval(id);
  }, [watchState.active]);

  // Watch countdown for progress bar
  const [watchCountdown, setWatchCountdown] = useState(WATCH_DWELL_MS);
  const watchProgress =
    watchState.active && !watchState.paused
      ? (WATCH_DWELL_MS - watchCountdown) / WATCH_DWELL_MS
      : 0;

  // Main watch loop
  useEffect(() => {
    if (!watchState.active || watchState.paused) return;

    const items = watchItemsRef.current;
    if (items.length === 0) {
      stopWatch();
      return;
    }

    const idx = watchStateRef.current.index % items.length;
    const current = items[idx]!;
    const currentOrigin = watchEntriesRef.current[idx]?.origin ?? null;
    setSelected(current);
    setRevealId(current.id);
    setTimeout(() => setRevealId(null), 200);
    setWatchCountdown(WATCH_DWELL_MS);
    setWatchState((prev) => ({
      ...prev,
      index: idx,
      currentId: current.id,
      currentItemSource: currentOrigin,
      items,
    }));

    const tickId = setInterval(() => {
      setWatchCountdown((prev) => Math.max(0, prev - 100));
    }, 100);

    const advanceId = setInterval(() => {
      const currentItems = watchItemsRef.current;
      const currentEntries = watchEntriesRef.current;
      if (currentItems.length === 0) return;
      if (watchStateRef.current.paused) return;

      const nextIdx = (watchStateRef.current.index + 1) % currentItems.length;
      const nextItem = currentItems[nextIdx]!;
      const nextOrigin = currentEntries[nextIdx]?.origin ?? null;
      setSelected(nextItem);
      setRevealId(nextItem.id);
      setTimeout(() => setRevealId(null), 200);
      setWatchCountdown(WATCH_DWELL_MS);
      setWatchState((prev) => ({
        ...prev,
        index: nextIdx,
        currentId: nextItem.id,
        currentItemSource: nextOrigin,
        items: currentItems,
      }));
    }, WATCH_DWELL_MS);

    return () => {
      clearInterval(tickId);
      clearInterval(advanceId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchState.active, watchState.paused, watchState.source]);

  // Manual selection pauses watch
  useEffect(() => {
    if (!watchState.active || watchState.paused || !selectedCurrent) return;
    if (resumeGraceRef.current) return;
    if (watchState.currentId && selectedCurrent.id !== watchState.currentId) {
      pauseWatch();
    }
  }, [
    selectedCurrent,
    watchState.active,
    watchState.paused,
    watchState.currentId,
    pauseWatch,
  ]);

  const value = useMemo<WatchContextValue>(
    () => ({
      watchMode: watchState,
      watchSource: watchState.source,
      watchIndex: watchState.index,
      watchActive: watchState.active,
      watchPaused: watchState.paused,
      watchProgress,
      startWatch,
      stopWatch,
      pauseWatch,
      resumeWatch,
    }),
    [watchState, watchProgress, startWatch, stopWatch, pauseWatch, resumeWatch],
  );

  return (
    <WatchContext.Provider value={value}>{children}</WatchContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useWatch(): WatchContextValue {
  const context = useContext(WatchContext);
  if (!context) {
    throw new Error("useWatch must be used within WatchProvider");
  }
  return context;
}
