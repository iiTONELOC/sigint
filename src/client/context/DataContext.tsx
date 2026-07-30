import { Domain } from "@shared/domain/identity";
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
import type { AircraftFilter } from "@/features/tracking/aircraft";
import { useEarthquakeSourceSnapshot } from "@/features/environmental/earthquake";
import type { EarthquakeFilter } from "@/features/environmental/earthquake/types";
import { useFireSourceSnapshot } from "@/features/environmental/fires";
import type { FireFilter } from "@/features/environmental/fires/types";
import type { CycloneFilter } from "@/features/environmental/cyclones";
import { useNewsData } from "@/features/news";
import type { NewsArticle } from "@/features/news";
import {
  useAvailableCountries,
  useSourceCounts,
} from "@/features/base/useSourceCounts";
import { useSourceSnapshot } from "@/features/base/useSourceQuery";
import { useSourceTicker } from "@/features/base/useSourceTicker";
import { useSourceVersions } from "@/features/base/useSourceVersions";
import type { SourceStatusEntry } from "@/lib/net/sourceHealth";
import { SourceStatus } from "@shared/domain/sourceStatus";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import {
  loadBaseline,
  persistBaseline,
  type CorrelationResult,
  type RegionBaseline,
} from "@/lib/correlation";
import { createCorrelationClient } from "@/lib/net/correlationClient";
import {
  readRenderGlobeState,
  setRenderAircraftFilter,
  toggleAllRenderCycloneModels,
  toggleRenderCycloneLayer,
  toggleRenderCycloneModel,
  toggleRenderLayer,
} from "@/render-surface/globeStateStore";
import { useRenderGlobeState } from "@/render-surface/useRenderGlobeState";
import {
  RenderCycloneLayer,
  RenderFilterBoundary,
  isRenderLayerId,
  type RenderAircraftFilter,
  type RenderLayerVisibility,
} from "@/workers/render/protocol";

import { UIProvider, useUI } from "@/context/UIContext";
import { WatchProvider, useWatch } from "@/context/WatchContext";

// Re-export for consumers that imported from here
export { WatchSource } from "@/context/WatchContext";

// ── Context value type ──────────────────────────────────────────────

type DataContextValue = {
  newsArticles: NewsArticle[];
  layers: RenderLayerVisibility;
  toggleLayer: (key: string) => void;
  aircraftFilter: AircraftFilter;
  setAircraftFilter: React.Dispatch<React.SetStateAction<AircraftFilter>>;
  filters: Record<string, unknown>;
  earthquakeFilter: EarthquakeFilter;
  fireFilter: FireFilter;
  counts: Record<string, number>;
  activeCount: number;
  earthquakeCount: number;
  fireCount: number;
  tickerItems: DataPoint[];
  availableCountries: string[];
  dataSources: readonly SourceStatusEntry[];
  correlation: CorrelationResult;
  cycloneFilter: CycloneFilter;
  toggleCycloneLayer: (layer: RenderCycloneLayer) => void;
  hiddenModels: ReadonlySet<string>;
  toggleModel: (model: string) => void;
  toggleAllModels: (models: readonly string[]) => void;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

export enum DataContextError {
  MissingProvider = "useData must be used within DataProvider",
}

enum CorrelationRequestTiming {
  DebounceMs = 1_000,
}

function aircraftFilterFromSnapshot(
  filter: RenderAircraftFilter,
): AircraftFilter {
  return {
    enabled: filter.enabled,
    showAirborne: filter.showAirborne,
    showGround: filter.showGround,
    milFilter: filter.milFilter,
    squawks: new Set(filter.squawks),
    countries: new Set(filter.countries),
  };
}

function aircraftFilterToSnapshot(
  filter: AircraftFilter,
): RenderAircraftFilter {
  return {
    enabled: filter.enabled,
    showAirborne: filter.showAirborne,
    showGround: filter.showGround,
    milFilter: filter.milFilter,
    squawks: [...filter.squawks],
    countries: [...filter.countries],
  };
}

function entryFor(
  id: Domain,
  snapshot: DataWorkerSourceSnapshot | null,
): SourceStatusEntry {
  return {
    id,
    status: snapshot?.status ?? SourceStatus.Loading,
    error: snapshot?.error ?? null,
  };
}

// ── Provider ────────────────────────────────────────────────────────
// Single component that owns the UI state every pane reads, and nests
// UIProvider, WatchProvider and DataContext.Provider. It holds no records:
// every one of those lives in the DataWorker.

export function DataProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  // ── Layers & filters ───────────────────────────────────────────
  const globeState = useRenderGlobeState();
  const layers = globeState.layers;
  const aircraftFilter = useMemo(
    () => aircraftFilterFromSnapshot(globeState.aircraftFilter),
    [globeState.aircraftFilter],
  );

  const setAircraftFilter = useCallback<
    React.Dispatch<React.SetStateAction<AircraftFilter>>
  >((update) => {
    const current = aircraftFilterFromSnapshot(
      readRenderGlobeState().aircraftFilter,
    );
    const next =
      typeof update === "function" ? update(current) : update;
    setRenderAircraftFilter(aircraftFilterToSnapshot(next));
  }, []);

  const toggleCycloneLayer = useCallback(
    (layer: RenderCycloneLayer) => {
      toggleRenderCycloneLayer(layer);
    },
    [],
  );
  const hiddenModels = useMemo<ReadonlySet<string>>(
    () => new Set(globeState.cycloneFilter.hiddenModels),
    [globeState.cycloneFilter.hiddenModels],
  );
  const toggleModel = useCallback((model: string) => {
    toggleRenderCycloneModel(model);
  }, []);
  const toggleAllModels = useCallback((models: readonly string[]) => {
    toggleAllRenderCycloneModels(models);
  }, []);

  // ── Data hooks ─────────────────────────────────────────────────
  // Every point source polls, parses and stores in the DataWorker. React asks
  // it for status, counts and bounded pages; it never holds a record set.
  // Tropical watch/warning polygons: region geometry, fetched separately from
  // the DataPoint path and rendered as their own globe layer.
  const { data: newsArticles, dataSource: newsSource } = useNewsData();
  const aircraftSource = useSourceSnapshot(Domain.Aircraft);
  const shipSource = useSourceSnapshot(Domain.Ships);
  const eventSource = useSourceSnapshot(Domain.Events);
  const weatherSource = useSourceSnapshot(Domain.Weather);
  const cycloneSource = useSourceSnapshot(Domain.Cyclones);
  const earthquakeSource = useEarthquakeSourceSnapshot();
  const fireSource = useFireSourceSnapshot();
  const correlationInputVersion = useSourceVersions();

  // ── Data source status ─────────────────────────────────────────
  const dataSources = useMemo<readonly SourceStatusEntry[]>(
    () => [
      entryFor(Domain.Aircraft, aircraftSource),
      entryFor(Domain.Quakes, earthquakeSource),
      entryFor(Domain.Events, eventSource),
      entryFor(Domain.Ships, shipSource),
      entryFor(Domain.Fires, fireSource),
      entryFor(Domain.Weather, weatherSource),
      entryFor(Domain.Cyclones, cycloneSource),
      { id: Domain.News, status: newsSource, error: null },
    ],
    [
      aircraftSource?.status,
      earthquakeSource?.status,
      eventSource?.status,
      shipSource?.status,
      fireSource?.status,
      weatherSource?.status,
      cycloneSource?.status,
      newsSource,
    ],
  );

  // ── Filters ────────────────────────────────────────────────────
  const earthquakeFilter = useMemo<EarthquakeFilter>(
    () => ({
      enabled: layers[Domain.Quakes],
      minMagnitude: globeState.earthquakeMinimumMagnitude,
    }),
    [globeState.earthquakeMinimumMagnitude, layers],
  );
  const fireFilter = useMemo<FireFilter>(
    () => ({
      enabled: layers[Domain.Fires],
      minConfidence: globeState.fireMinimumConfidence,
    }),
    [globeState.fireMinimumConfidence, layers],
  );
  const cycloneFilter = useMemo<CycloneFilter>(
    () => ({
      enabled: layers[Domain.Cyclones],
      minCategory: globeState.cycloneFilter.minimumCategory,
      showForecast: globeState.cycloneFilter.showForecast,
      showCone: globeState.cycloneFilter.showCone,
      showWindField: globeState.cycloneFilter.showWindField,
      showModels: globeState.cycloneFilter.showModels,
      showWarnings: globeState.cycloneFilter.showWarnings,
      hiddenModels: [...globeState.cycloneFilter.hiddenModels],
    }),
    [globeState.cycloneFilter, layers],
  );
  const filters = useMemo<Record<string, unknown>>(
    () => ({
      [Domain.Aircraft]: aircraftFilter,
      [Domain.Ships]: layers[Domain.Ships],
      [Domain.Events]: {
        enabled: layers[Domain.Events],
        minSeverity: RenderFilterBoundary.Minimum,
      },
      [Domain.Quakes]: earthquakeFilter,
      [Domain.Fires]: fireFilter,
      [Domain.Weather]: {
        enabled: layers[Domain.Weather],
        minSeverity: RenderFilterBoundary.Minimum,
      },
      [Domain.Cyclones]: cycloneFilter,
    }),
    [aircraftFilter, layers, earthquakeFilter, fireFilter, cycloneFilter],
  );

  // ── Derived state, counted in the DataWorker ───────────────────
  // Counts and the country list used to be one O(n) walk of a main-thread
  // array of every record, which was the stall that froze the DOM on a poll.
  // Each is a bounded query now, so React holds the numbers and nothing else.
  const counts = useSourceCounts(filters);
  const availableCountries = useAvailableCountries();
  const earthquakeCount = earthquakeSource?.count ?? 0;
  const fireCount = fireSource?.count ?? 0;
  const tickerItems = useSourceTicker();
  const activeCount = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  );

  // ── Handlers ───────────────────────────────────────────────────
  const toggleLayer = useCallback((key: string) => {
    if (!isRenderLayerId(key)) return;
    toggleRenderLayer(key);
  }, []);

  // ── Correlation engine (Web Worker) ────────────────────────────
  const baselineRef = useRef<RegionBaseline>(loadBaseline());
  const clientRef = useRef<ReturnType<typeof createCorrelationClient> | null>(
    null,
  );
  clientRef.current ??= createCorrelationClient();
  useEffect(() => {
    return () => {
      clientRef.current?.terminate();
      clientRef.current = null;
    };
  }, []);

  const [correlation, setCorrelation] = useState<CorrelationResult>(() => ({
    products: [],
    alerts: [],
    baseline: baselineRef.current,
  }));

  // Correlation is intel analysis, not a per-frame concern. The records reach
  // the worker straight from the DataWorker, so a request carries only news
  // and the baseline. It still debounces: a source version bump means new
  // records have already landed there, and a 1 s trailing window collapses a
  // burst of them into one recompute.
  useEffect(() => {
    let cancelled = false;
    const client = clientRef.current;
    if (!client) return;
    const applyResult = (result: CorrelationResult): void => {
      if (cancelled) return;
      baselineRef.current = result.baseline;
      persistBaseline(result.baseline);
      setCorrelation(result);
    };
    const id = setTimeout(() => {
      if (cancelled) return;
      void client.request(newsArticles, baselineRef.current).then(applyResult);
    }, CorrelationRequestTiming.DebounceMs);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [correlationInputVersion, newsArticles]);

  // ── DataContext value ──────────────────────────────────────────
  const dataValue = useMemo<DataContextValue>(
    () => ({
      newsArticles,
      layers,
      toggleLayer,
      aircraftFilter,
      setAircraftFilter,
      filters,
      earthquakeFilter,
      fireFilter,
      counts,
      activeCount,
      earthquakeCount,
      fireCount,
      tickerItems,
      availableCountries,
      dataSources,
      correlation,
      cycloneFilter,
      toggleCycloneLayer,
      hiddenModels,
      toggleModel,
      toggleAllModels,
    }),
    [
      newsArticles,
      layers, toggleLayer, aircraftFilter, filters, earthquakeFilter, fireFilter,
      counts, activeCount, earthquakeCount, fireCount, tickerItems, availableCountries,
      dataSources, correlation, cycloneFilter,
      toggleCycloneLayer, hiddenModels, toggleModel, toggleAllModels,
    ],
  );

  return (
    <UIProvider>
      <DataContext.Provider value={dataValue}>
        <WatchProvider correlation={correlation}>
          {children}
        </WatchProvider>
      </DataContext.Provider>
    </UIProvider>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────

/**
 * Combines DataContext, UIContext, and WatchContext for existing consumers.
 */
export function useData(): DataContextValue & ReturnType<typeof useUI> & ReturnType<typeof useWatch> {
  const dataCtx = useContext(DataContext);
  if (!dataCtx) {
    throw new Error(DataContextError.MissingProvider);
  }
  const uiCtx = useUI();
  const watchCtx = useWatch();
  return { ...dataCtx, ...uiCtx, ...watchCtx };
}
