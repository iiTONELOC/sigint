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
import type { CorrelationResult } from "@/lib/correlation";
import { requestWatchLayout } from "@/lib/runtime/layoutSignals";
import { revealThenClear } from "@/lib/runtime/revealSignals";
import { useUI } from "@/context/UIContext";

// ── Types ───────────────────────────────────────────────────────────

export enum WatchSource {
  Alerts = "alerts",
  Intel = "intel",
  All = "all",
}

type WatchItemSource = WatchSource.Alerts | WatchSource.Intel;

type WatchMode = {
  active: boolean;
  paused: boolean;
  source: WatchSource;
  index: number;
  items: DataPoint[];
  currentId: string | null;
  /** Identifies the source list for the current item. */
  currentItemSource: WatchItemSource | null;
};

type WatchEntry = {
  readonly item: DataPoint;
  readonly origin: WatchItemSource;
};

type ScoredWatchEntry = WatchEntry & {
  readonly score: number;
};

enum WatchTiming {
  CountdownTickMs = 100,
  DwellMs = 8_000,
  LayoutRefreshMs = 3_000,
  ResumeGraceMs = 500,
}

enum WatchError {
  ProviderRequired = "useWatch must be used within WatchProvider",
}

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

function alertWatchEntries(
  correlation: CorrelationResult,
): ScoredWatchEntry[] {
  return correlation.alerts.map((alert) => ({
    item: alert.item,
    origin: WatchSource.Alerts,
    score: alert.score,
  }));
}

function intelWatchEntries(
  correlation: CorrelationResult,
): ScoredWatchEntry[] {
  const entries: ScoredWatchEntry[] = [];
  for (const product of correlation.products) {
    const item = product.sources[0];
    if (item) {
      entries.push({
        item,
        origin: WatchSource.Intel,
        score: product.priority,
      });
    }
  }
  return entries;
}

function uniqueWatchEntries(entries: readonly WatchEntry[]): WatchEntry[] {
  const seen = new Set<string>();
  const unique: WatchEntry[] = [];
  for (const entry of entries) {
    if (!seen.has(entry.item.id)) {
      seen.add(entry.item.id);
      unique.push(entry);
    }
  }
  return unique;
}

function buildWatchEntries(
  correlation: CorrelationResult,
  source: WatchSource,
): WatchEntry[] {
  const alerts = alertWatchEntries(correlation);
  if (source === WatchSource.Alerts) return uniqueWatchEntries(alerts);

  const intel = intelWatchEntries(correlation);
  if (source === WatchSource.Intel) return uniqueWatchEntries(intel);

  return uniqueWatchEntries(
    [...alerts, ...intel].sort((left, right) => right.score - left.score),
  );
}

// ── Provider ────────────────────────────────────────────────────────

export function WatchProvider({
  children,
  correlation,
}: {
  readonly children: ReactNode;
  readonly correlation: CorrelationResult;
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
    source: WatchSource.Alerts,
    index: 0,
    items: [],
    currentId: null,
    currentItemSource: null,
  });

  const watchEntries = useMemo(
    () => buildWatchEntries(correlation, watchState.source),
    [correlation, watchState.source],
  );

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
      }, WatchTiming.ResumeGraceMs);
    }, 0);
  }, [setAutoRotate]);

  // Keep watch layout alive during watch
  useEffect(() => {
    if (!watchState.active) return;
    const id = setInterval(
      () => requestWatchLayout(),
      WatchTiming.LayoutRefreshMs,
    );
    return () => clearInterval(id);
  }, [watchState.active]);

  // Watch countdown for progress bar
  const [watchCountdown, setWatchCountdown] = useState(WatchTiming.DwellMs);
  const watchProgress =
    watchState.active && !watchState.paused
      ? (WatchTiming.DwellMs - watchCountdown) / WatchTiming.DwellMs
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
    revealThenClear(setRevealId, current.id);
    setWatchCountdown(WatchTiming.DwellMs);
    setWatchState((prev) => ({
      ...prev,
      index: idx,
      currentId: current.id,
      currentItemSource: currentOrigin,
      items,
    }));

    const tickId = setInterval(() => {
      setWatchCountdown((prev) =>
        Math.max(0, prev - WatchTiming.CountdownTickMs),
      );
    }, WatchTiming.CountdownTickMs);

    const advanceId = setInterval(() => {
      const currentItems = watchItemsRef.current;
      const currentEntries = watchEntriesRef.current;
      if (currentItems.length === 0) return;
      if (watchStateRef.current.paused) return;

      const nextIdx = (watchStateRef.current.index + 1) % currentItems.length;
      const nextItem = currentItems[nextIdx]!;
      const nextOrigin = currentEntries[nextIdx]?.origin ?? null;
      setSelected(nextItem);
      revealThenClear(setRevealId, nextItem.id);
      setWatchCountdown(WatchTiming.DwellMs);
      setWatchState((prev) => ({
        ...prev,
        index: nextIdx,
        currentId: nextItem.id,
        currentItemSource: nextOrigin,
        items: currentItems,
      }));
    }, WatchTiming.DwellMs);

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
    throw new Error(WatchError.ProviderRequired);
  }
  return context;
}
