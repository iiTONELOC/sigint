import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  type ReactNode,
} from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { AircraftFilter } from "@/features/tracking/aircraft";
import {
  useAircraftData,
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
} from "@/features/tracking/aircraft";
import {
  useEarthquakeSourceSnapshot,
  useEarthquakeUiQuery,
} from "@/features/environmental/earthquake";
import type { EarthquakeUiQuery } from "@/features/environmental/earthquake/data/uiQueries";
import type { EarthquakeFilter } from "@/features/environmental/earthquake/types";
import { useEventData } from "@/features/intel/events";
import { useShipData } from "@/features/tracking/ships";
import { useFireData } from "@/features/environmental/fires";
import { useWeatherData } from "@/features/environmental/weather";
import {
  useCycloneData,
  type CycloneFilter,
} from "@/features/environmental/cyclones";
import { useCycloneWarnings } from "@/features/environmental/cyclones/hooks/useCycloneWarnings";
import type { CycloneWarning } from "@/features/environmental/cyclones/data/warnings";
import { useNewsData } from "@/features/news";
import type { NewsArticle } from "@/features/news";
import {
  buildTickerItems,
  TICKER_ITEM_LIMIT,
} from "@/lib/ui/tickerFeed";
import {
  recordPositions,
  type TrailObservation,
} from "@/lib/geo/trailService";
import { scheduleIdle } from "@/lib/runtime/idle";
import { ktToMps } from "@/lib/format/units";
import { type SpatialGrid } from "@/lib/geo/spatialIndex";
import {
  buildDerivedSync,
  buildDerivedChunked,
  type Derived,
} from "@/lib/geo/deriveData";
import type { SourceStatus } from "@/lib/net/sourceHealth";
import {
  CORRELATION_POLICY,
  emptyBaseline,
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
  allData: DataPoint[];
  dataVersion: number;
  newsArticles: NewsArticle[];
  spatialGrid: SpatialGrid;
  filteredIds: Set<string>;
  layers: Record<string, boolean>;
  toggleLayer: (key: string) => void;
  aircraftFilter: AircraftFilter;
  setAircraftFilter: React.Dispatch<React.SetStateAction<AircraftFilter>>;
  filters: Record<string, unknown>;
  earthquakeFilter: EarthquakeFilter;
  counts: Record<string, number>;
  activeCount: number;
  earthquakeCount: number;
  tickerItems: DataPoint[];
  availableCountries: string[];
  dataSources: SourceStatus[];
  correlation: CorrelationResult;
  cycloneWarnings: CycloneWarning[];
  cycloneFilter: CycloneFilter;
  toggleCycloneLayer: (
    key: "showForecast" | "showCone" | "showWindField" | "showModels" | "showWarnings",
  ) => void;
  hiddenModels: ReadonlySet<string>;
  toggleModel: (model: string) => void;
  toggleAllModels: (models: readonly string[]) => void;
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);
const EMPTY_QUERY_ITEMS: readonly DataPoint[] = [];

function observedAt(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function aircraftTrailObservations(
  data: readonly DataPoint[],
): TrailObservation[] {
  const observations: TrailObservation[] = [];
  for (const point of data) {
    if (point.type !== "aircraft") continue;
    const timestamp = observedAt(point.timestamp);
    if (timestamp === null) continue;
    const speed = point.data.speed;
    observations.push({
      id: point.id,
      lat: point.lat,
      lon: point.lon,
      observedAt: timestamp,
      heading: point.data.heading,
      speedMps:
        point.data.speedMps ??
        (speed === undefined ? undefined : ktToMps(speed)),
      altitude: point.data.altitude,
      speed,
    });
  }
  return observations;
}

function shipTrailObservations(
  data: readonly DataPoint[],
): TrailObservation[] {
  const observations: TrailObservation[] = [];
  for (const point of data) {
    if (point.type !== "ships") continue;
    const timestamp = observedAt(point.timestamp);
    if (timestamp === null) continue;
    const speed = point.data.speed;
    observations.push({
      id: point.id,
      lat: point.lat,
      lon: point.lon,
      observedAt: timestamp,
      heading: point.data.cog ?? point.data.heading,
      speedMps:
        point.data.speedMps ??
        (speed === undefined ? undefined : ktToMps(speed)),
      speed,
    });
  }
  return observations;
}

// ── Provider ────────────────────────────────────────────────────────
// Single component that owns all data hooks, builds idMap for UIProvider,
// and nests UIProvider → WatchProvider → DataContext.Provider.

export function DataProvider({ children }: { children: ReactNode }) {
  const lastEnrichmentKeyRef = useRef("");

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
  const {
    data: aircraftData,
    version: aircraftVersion,
    dataSource,
    requestAircraftEnrichment,
  } = useAircraftData();

  const {
    data: eventData,
    version: eventVersion,
    dataSource: eventSource,
  } = useEventData();
  const {
    data: shipData,
    version: shipVersion,
    dataSource: shipSource,
  } = useShipData();
  const {
    data: fireData,
    version: fireVersion,
    dataSource: fireSource,
  } = useFireData();
  const {
    data: weatherData,
    version: weatherVersion,
    dataSource: weatherSource,
  } = useWeatherData();
  const {
    data: cycloneData,
    version: cycloneVersion,
    dataSource: cycloneSource,
  } = useCycloneData();
  // Tropical watch/warning polygons — region geometry, fetched separately
  // from the DataPoint path and rendered as their own globe layer.
  const cycloneWarnings = useCycloneWarnings();
  const { data: newsArticles, dataSource: newsSource } = useNewsData();
  const earthquakeSource = useEarthquakeSourceSnapshot();
  const earthquakeTickerQuery = useMemo<EarthquakeUiQuery>(
    () => ({ kind: "ticker", limit: TICKER_ITEM_LIMIT }),
    [],
  );
  const earthquakeTickerResult = useEarthquakeUiQuery(
    earthquakeTickerQuery,
  );
  const earthquakeTickerItems =
    earthquakeTickerResult?.kind === "ticker"
      ? earthquakeTickerResult.items
      : EMPTY_QUERY_ITEMS;
  const earthquakeCorrelationSince = useMemo(
    () => Date.now() - CORRELATION_POLICY.recentWindowMs,
    [earthquakeSource?.version],
  );
  const earthquakeCorrelationQuery = useMemo<EarthquakeUiQuery>(
    () => ({
      kind: "correlation",
      since: earthquakeCorrelationSince,
    }),
    [earthquakeCorrelationSince],
  );
  const earthquakeCorrelationResult = useEarthquakeUiQuery(
    earthquakeCorrelationQuery,
  );
  const earthquakeCorrelationItems =
    earthquakeCorrelationResult?.kind === "correlation"
      ? earthquakeCorrelationResult.items
      : EMPTY_QUERY_ITEMS;

  // ── Merged data (rAF debounced, identity-preserving) ──────────
  // Providers preserve their entities array reference across same-id-set
  // polls (in-place mutation; see diffEntities.ts). When ALL source refs
  // are stable, we keep the prior `allData` reference and only bump
  // `allDataVersion` — downstream memos that gate on identity (idMap,
  // availableCountries) skip recomputation, while version-sensitive
  // memos (spatialGrid, correlation, filteredIds, tickerItems, counts,
  // activeCount, plus the trail-recording effect) re-run.
  const allDataSourcesRef = useRef({
    aircraftData,
    shipData,
    eventData,
    fireData,
    weatherData,
    cycloneData,
  });
  allDataSourcesRef.current = {
    aircraftData,
    shipData,
    eventData,
    fireData,
    weatherData,
    cycloneData,
  };

  const lastMergedSourcesRef = useRef<typeof allDataSourcesRef.current | null>(
    null,
  );

  const [allData, setAllData] = useState<DataPoint[]>(() => [
    ...aircraftData,
    ...shipData,
    ...eventData,
    ...fireData,
    ...weatherData,
    ...cycloneData,
  ]);
  const [allDataVersion, setAllDataVersion] = useState(0);

  // Flush merged allData + bump version inside a low-priority React
  // transition. Touch/wheel events on the globe can interrupt the
  // downstream memo cascade (idMap, spatialGrid, correlation, ticker,
  // counts) and get serviced first. Unlike useDeferredValue this does
  // NOT keep a second copy of allData alive, so memory stays flat.
  const flushAllData = useCallback(() => {
    const s = allDataSourcesRef.current;
    const prev = lastMergedSourcesRef.current;
    const refsChanged =
      s.aircraftData !== prev?.aircraftData ||
      s.shipData !== prev?.shipData ||
      s.eventData !== prev?.eventData ||
      s.fireData !== prev?.fireData ||
      s.weatherData !== prev?.weatherData ||
      s.cycloneData !== prev?.cycloneData;

    const merged = refsChanged
      ? [
          ...s.aircraftData,
          ...s.shipData,
          ...s.eventData,
          ...s.fireData,
          ...s.weatherData,
          ...s.cycloneData,
        ]
      : null;
    if (refsChanged) lastMergedSourcesRef.current = { ...s };

    startTransition(() => {
      if (merged) setAllData(merged);
      setAllDataVersion((v) => v + 1);
    });
  }, []);

  const allDataRafRef = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(allDataRafRef.current);
    allDataRafRef.current = requestAnimationFrame(flushAllData);
    return () => cancelAnimationFrame(allDataRafRef.current);
  }, [
    flushAllData,
    aircraftData,
    shipData,
    eventData,
    fireData,
    weatherData,
    cycloneData,
    aircraftVersion,
    shipVersion,
    eventVersion,
    fireVersion,
    weatherVersion,
    cycloneVersion,
  ]);

  // ── Trail recording ────────────────────────────────────────────
  useEffect(
    () =>
      scheduleIdle(() => {
        recordPositions(
          "aircraft",
          aircraftTrailObservations(aircraftData),
        );
      }),
    [aircraftData, aircraftVersion],
  );

  useEffect(
    () =>
      scheduleIdle(() => {
        recordPositions(
          "ships",
          shipTrailObservations(shipData),
        );
      }),
    [shipData, shipVersion],
  );

  // ── Data source status ─────────────────────────────────────────
  const dataSources = useMemo<SourceStatus[]>(
    () => [
      { id: "aircraft", label: "AIRCRAFT", status: dataSource },
      { id: "quakes", label: "SEISMIC", status: earthquakeSource?.status ?? "loading" },
      { id: "events", label: "GDELT", status: eventSource },
      { id: "ships", label: "SHIPS", status: shipSource },
      { id: "fires", label: "FIRMS", status: fireSource },
      { id: "weather", label: "NOAA", status: weatherSource },
      { id: "cyclones", label: "NHC", status: cycloneSource },
      { id: "news", label: "NEWS", status: newsSource },
    ],
    [dataSource, earthquakeSource?.status, eventSource, shipSource, fireSource, weatherSource, cycloneSource, newsSource],
  );

  // ── Filters ────────────────────────────────────────────────────
  const earthquakeFilter = useMemo<EarthquakeFilter>(
    () => ({ enabled: layers.quakes ?? true, minMagnitude: 0 }),
    [layers.quakes],
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
      fires: { enabled: layers.fires ?? true, minConfidence: 0 },
      weather: { enabled: layers.weather ?? true, minSeverity: 0 },
      cyclones: cycloneFilter,
    }),
    [aircraftFilter, layers, earthquakeFilter, cycloneFilter],
  );

  // ── Derived state — OFF the render path ────────────────────────
  // idMap, spatialGrid, filteredIds, counts, availableCountries and
  // tickerItems are one O(n) walk of allData. Run synchronously in a render
  // useMemo this ~22k-item loop was the main-thread stall that froze the DOM
  // on every poll. It now runs in a chunked, cancelable async pass (see
  // lib/deriveData.ts) that yields between chunks — we serve the prior result
  // until the fresh one lands (stale-while-recompute). The globe reads allData
  // directly, so points stay visually current; only idMap/grid/counts lag a
  // beat, which is fine at a 15 s cadence. The initial value is computed
  // synchronously once for first paint.
  const [derived, setDerived] = useState<Derived>(() =>
    buildDerivedSync(allData, filters),
  );

  useEffect(() => {
    let cancelled = false;
    void buildDerivedChunked(allData, filters, () => cancelled).then((res) => {
      if (res && !cancelled) setDerived(res);
    });
    return () => {
      cancelled = true;
    };
  }, [allData, allDataVersion, filters]);

  const {
    idMap,
    spatialGrid,
    filteredIds,
    counts: nonEarthquakeCounts,
    availableCountries,
  } = derived;
  const earthquakeCount = earthquakeSource?.count ?? 0;
  const counts = useMemo(
    () => ({
      ...nonEarthquakeCounts,
      quakes: layers.quakes === false ? 0 : earthquakeCount,
    }),
    [nonEarthquakeCounts, layers.quakes, earthquakeCount],
  );
  const tickerItems = useMemo(
    () => buildTickerItems([...allData, ...earthquakeTickerItems]),
    [allData, earthquakeTickerItems],
  );
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

  // Correlation is intel analysis, not a per-frame concern. Gate on
  // MEMBERSHIP (+ news), not version, and debounce — so streaming polls don't
  // each structuredClone all of allData onto the main thread. A 1s trailing
  // window collapses a burst into one request.
  useEffect(() => {
    let cancelled = false;
    const client = clientRef.current;
    if (!client) return;
    const id = setTimeout(() => {
      if (cancelled) return;
      // The request structured-clones all of allData to the worker — run that
      // marshalling in idle time so it never lands during a drag/zoom.
      scheduleIdle(() => {
        if (cancelled) return;
        const correlationData = [
          ...allData,
          ...earthquakeCorrelationItems,
        ];
        void client
          .request(correlationData, newsArticles, baselineRef.current)
          .then((result) => {
            if (cancelled) return;
            baselineRef.current = result.baseline;
            persistBaseline(result.baseline);
            setCorrelation(result);
          });
      });
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [allData, earthquakeCorrelationItems, newsArticles]);

  // ── DataContext value ──────────────────────────────────────────
  const dataValue = useMemo<DataContextValue>(
    () => ({
      allData,
      dataVersion: allDataVersion,
      newsArticles,
      spatialGrid,
      filteredIds,
      layers,
      toggleLayer,
      aircraftFilter,
      setAircraftFilter,
      filters,
      earthquakeFilter,
      counts,
      activeCount,
      earthquakeCount,
      tickerItems,
      availableCountries,
      dataSources,
      correlation,
      cycloneWarnings,
      cycloneFilter,
      toggleCycloneLayer,
      hiddenModels,
      toggleModel,
      toggleAllModels,
      requestAircraftEnrichment,
    }),
    [
      allData, allDataVersion, newsArticles, spatialGrid, filteredIds,
      layers, toggleLayer, aircraftFilter, filters, earthquakeFilter,
      counts, activeCount, earthquakeCount, tickerItems, availableCountries,
      dataSources, correlation, cycloneWarnings, cycloneFilter,
      toggleCycloneLayer, hiddenModels, toggleModel, toggleAllModels, requestAircraftEnrichment,
    ],
  );

  return (
    <UIProvider idMap={idMap}>
      <DataContext.Provider value={dataValue}>
        <EnrichmentBridge requestAircraftEnrichment={requestAircraftEnrichment} lastEnrichmentKeyRef={lastEnrichmentKeyRef} />
        <WatchProvider correlation={correlation}>
          {children}
        </WatchProvider>
      </DataContext.Provider>
    </UIProvider>
  );
}

/**
 * Tiny bridge component that lives inside both UIProvider and DataContext.Provider
 * to trigger aircraft enrichment when the selected item changes.
 * Avoids a circular dependency between DataProvider and UIProvider.
 */
function EnrichmentBridge({
  requestAircraftEnrichment,
  lastEnrichmentKeyRef,
}: {
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
  lastEnrichmentKeyRef: React.MutableRefObject<string>;
}) {
  const { selectedCurrent } = useUI();

  useEffect(() => {
    if (selectedCurrent?.type !== "aircraft") return;
    const icao24 = (selectedCurrent.data as { icao24?: string })?.icao24;
    if (!icao24) return;
    if (icao24 === lastEnrichmentKeyRef.current) return;
    lastEnrichmentKeyRef.current = icao24;
    void requestAircraftEnrichment([icao24]);
  }, [selectedCurrent, requestAircraftEnrichment, lastEnrichmentKeyRef]);

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
