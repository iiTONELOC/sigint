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
import {
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
} from "@/features/tracking/aircraft";
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
import { watchTrail } from "@/lib/geo/trailService";
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

import { UIProvider, useUI } from "@/context/UIContext";
import { WatchProvider, useWatch } from "@/context/WatchContext";

// Re-export for consumers that imported from here
export type { WatchSource } from "@/context/WatchContext";

// ── Context value type ──────────────────────────────────────────────

type DataContextValue = {
  newsArticles: NewsArticle[];
  layers: Record<string, boolean>;
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
  toggleCycloneLayer: (
    key: "showForecast" | "showCone" | "showWindField" | "showModels" | "showWarnings",
  ) => void;
  hiddenModels: ReadonlySet<string>;
  toggleModel: (model: string) => void;
  toggleAllModels: (models: readonly string[]) => void;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

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

/** Collapses a burst of source updates into one correlation request. */
const CORRELATION_DEBOUNCE_MS = 1_000;

// ── Provider ────────────────────────────────────────────────────────
// Single component that owns the UI state every pane reads, and nests
// UIProvider, WatchProvider and DataContext.Provider. It holds no records:
// every one of those lives in the DataWorker.

export function DataProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  // ── Layers & filters ───────────────────────────────────────────
  const [layers, setLayers] = useState<Record<string, boolean>>({
    ships: true,
    events: true,
    quakes: true,
    fires: true,
    weather: true,
    cyclones: true,
  });
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>(() =>
    getInitialAircraftFilter(),
  );
  // Cyclone layer toggles live on the cyclone filter (settable from the
  // dossier + detail pane). Were hardcoded constants before.
  const [cycloneDisplay, setCycloneDisplay] = useState({
    showForecast: true,
    showCone: true,
    showWindField: false,
    showModels: false,
    showWarnings: true,
  });
  const toggleCycloneLayer = useCallback(
    (key: "showForecast" | "showCone" | "showWindField" | "showModels" | "showWarnings") => {
      setCycloneDisplay((display) => ({
        ...display,
        [key]: !display[key],
      }));
    },
    [],
  );
  const [hiddenModels, setHiddenModels] = useState<ReadonlySet<string>>(new Set());
  const toggleModel = useCallback((model: string) => {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }, []);
  const toggleAllModels = useCallback((models: readonly string[]) => {
    setHiddenModels((prev) => {
      const anyVisible = models.some((m) => !prev.has(m));
      return anyVisible ? new Set(models) : new Set();
    });
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
    () => ({ enabled: layers.quakes ?? true, minMagnitude: 0 }),
    [layers.quakes],
  );
  const fireFilter = useMemo<FireFilter>(
    () => ({ enabled: layers.fires ?? true, minConfidence: 0 }),
    [layers.fires],
  );
  const cycloneFilter = useMemo<CycloneFilter>(
    () => ({
      ...cycloneDisplay,
      enabled: layers.cyclones ?? true,
      minCategory: 0,
      hiddenModels: [...hiddenModels],
    }),
    [cycloneDisplay, hiddenModels, layers.cyclones],
  );
  const filters = useMemo<Record<string, unknown>>(
    () => ({
      aircraft: aircraftFilter,
      ships: layers.ships ?? true,
      events: { enabled: layers.events ?? true, minSeverity: 0 },
      quakes: earthquakeFilter,
      fires: fireFilter,
      weather: { enabled: layers.weather ?? true, minSeverity: 0 },
      cyclones: cycloneFilter,
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

  // ── URL sync for aircraft filter ───────────────────────────────
  useEffect(() => { syncAircraftFilterToUrl(aircraftFilter); }, [aircraftFilter]);

  // ── Handlers ───────────────────────────────────────────────────
  const toggleLayer = useCallback((key: string) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
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
    }, CORRELATION_DEBOUNCE_MS);
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
        <TrailWatchBridge version={correlationInputVersion} />
        <WatchProvider correlation={correlation}>
          {children}
        </WatchProvider>
      </DataContext.Provider>
    </UIProvider>
  );
}

/**
 * The DataWorker records every track's history; the main thread mirrors only
 * the selected one. Re-pulls on each merged update so the dossier polyline
 * keeps extending while an item stays selected.
 */
function TrailWatchBridge({ version }: Readonly<{ version: number }>) {
  const { selectedCurrent } = useUI();
  const id = selectedCurrent?.id ?? null;

  useEffect(() => {
    watchTrail(id);
  }, [id, version]);

  return null;
}

// ── Hooks ────────────────────────────────────────────────────────────

/**
 * Backwards-compatible hook — merges DataContext + UIContext + WatchContext.
 * Existing consumers don't need to change. New code can use useUI() or
 * useWatch() directly for narrower subscriptions.
 */
export function useData(): DataContextValue & ReturnType<typeof useUI> & ReturnType<typeof useWatch> {
  const dataCtx = useContext(DataContext);
  if (!dataCtx) {
    throw new Error("useData must be used within DataProvider");
  }
  const uiCtx = useUI();
  const watchCtx = useWatch();
  return { ...dataCtx, ...uiCtx, ...watchCtx };
}
