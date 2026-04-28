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
  useAircraftData,
  getInitialAircraftFilter,
  syncAircraftFilterToUrl,
} from "@/features/tracking/aircraft";
import { useEarthquakeData } from "@/features/environmental/earthquake";
import { useEventData } from "@/features/intel/events";
import { useShipData } from "@/features/tracking/ships";
import { useFireData } from "@/features/environmental/fires";
import { useWeatherData } from "@/features/environmental/weather";
import { useCycloneData } from "@/features/environmental/cyclones";
import { useNewsData } from "@/features/news";
import type { NewsArticle } from "@/features/news";
import {
  selectActiveCount,
  selectLayerCounts,
  selectAvailableAircraftCountries,
} from "@/lib/uiSelectors";
import { buildTickerItems } from "@/lib/tickerFeed";
import { recordPositions } from "@/lib/trailService";
import { featureRegistry } from "@/features/registry";
import { buildSpatialGrid, type SpatialGrid } from "@/lib/spatialIndex";
import type { SourceStatus } from "@/lib/sourceHealth";
import {
  computeCorrelations,
  type CorrelationResult,
} from "@/lib/correlation";

import { UIProvider, useUI } from "@/context/UIContext";
import { WatchProvider, useWatch } from "@/context/WatchContext";

// Re-export for consumers that imported from here
export type { WatchSource } from "@/context/WatchContext";

// ── Context value type ──────────────────────────────────────────────

type DataContextValue = {
  allData: DataPoint[];
  newsArticles: NewsArticle[];
  spatialGrid: SpatialGrid;
  filteredIds: Set<string>;
  layers: Record<string, boolean>;
  toggleLayer: (key: string) => void;
  aircraftFilter: AircraftFilter;
  setAircraftFilter: React.Dispatch<React.SetStateAction<AircraftFilter>>;
  filters: Record<string, unknown>;
  counts: Record<string, number>;
  activeCount: number;
  tickerItems: DataPoint[];
  availableCountries: string[];
  dataSources: SourceStatus[];
  correlation: CorrelationResult;
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

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

  // ── Data hooks ─────────────────────────────────────────────────
  const {
    data: aircraftData,
    version: aircraftVersion,
    dataSource,
    requestAircraftEnrichment,
  } = useAircraftData();

  const {
    data: earthquakeData,
    version: earthquakeVersion,
    dataSource: earthquakeSource,
  } = useEarthquakeData();
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
  const { data: newsArticles, dataSource: newsSource } = useNewsData();

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
    earthquakeData,
    eventData,
    fireData,
    weatherData,
    cycloneData,
  });
  allDataSourcesRef.current = {
    aircraftData,
    shipData,
    earthquakeData,
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
    ...earthquakeData,
    ...eventData,
    ...fireData,
    ...weatherData,
    ...cycloneData,
  ]);
  const [allDataVersion, setAllDataVersion] = useState(0);

  const allDataRafRef = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(allDataRafRef.current);
    allDataRafRef.current = requestAnimationFrame(() => {
      const s = allDataSourcesRef.current;
      const prev = lastMergedSourcesRef.current;
      const refsChanged =
        !prev ||
        s.aircraftData !== prev.aircraftData ||
        s.shipData !== prev.shipData ||
        s.earthquakeData !== prev.earthquakeData ||
        s.eventData !== prev.eventData ||
        s.fireData !== prev.fireData ||
        s.weatherData !== prev.weatherData ||
        s.cycloneData !== prev.cycloneData;

      if (refsChanged) {
        lastMergedSourcesRef.current = { ...s };
        setAllData([
          ...s.aircraftData,
          ...s.shipData,
          ...s.earthquakeData,
          ...s.eventData,
          ...s.fireData,
          ...s.weatherData,
          ...s.cycloneData,
        ]);
      }
      setAllDataVersion((v) => v + 1);
    });
    return () => cancelAnimationFrame(allDataRafRef.current);
  }, [
    aircraftData,
    shipData,
    earthquakeData,
    eventData,
    fireData,
    weatherData,
    cycloneData,
    aircraftVersion,
    shipVersion,
    earthquakeVersion,
    eventVersion,
    fireVersion,
    weatherVersion,
    cycloneVersion,
  ]);

  // ── ID Map — for UIProvider's selectedCurrent resolution ───────
  // Membership-only: id → DataPoint reference. Items mutate in place
  // via the providers' diffAndApply, so reads through this map see
  // current field values without a rebuild.
  const idMap = useMemo(() => {
    const map = new Map<string, DataPoint>();
    for (let i = 0; i < allData.length; i++) {
      map.set(allData[i]!.id, allData[i]!);
    }
    return map;
  }, [allData]);

  // ── Spatial grid ───────────────────────────────────────────────
  // Position-dependent: rebuckets by lat/lon. Gate on version so each
  // poll's positional updates re-grid even when membership is stable.
  const spatialGrid = useMemo<SpatialGrid>(
    () =>
      allData.length > 0
        ? buildSpatialGrid(allData)
        : { cells: new Map(), size: 0 },
    [allData, allDataVersion],
  );

  // ── Trail recording ────────────────────────────────────────────
  // Captures a fresh snapshot of positions per poll into trail history.
  // Effect's `.map` extracts plain values immediately, so in-place
  // mutation under the array does not corrupt prior trail points.
  useEffect(() => {
    const movingItems = allData
      .filter((d) => d.type === "aircraft" || d.type === "ships")
      .map((d) => ({
        id: d.id,
        type: d.type as "aircraft" | "ships",
        lat: d.lat,
        lon: d.lon,
        heading: (d.data as any)?.heading,
        speedMps:
          (d.data as any)?.speedMps ??
          ((d.data as any)?.speed ? (d.data as any).speed * 0.5144 : undefined),
        altitude: (d.data as any)?.altitude,
        speed: (d.data as any)?.speed,
      }));
    if (movingItems.length > 0) recordPositions(movingItems);
  }, [allData, allDataVersion]);

  // ── Data source status ─────────────────────────────────────────
  const dataSources = useMemo<SourceStatus[]>(
    () => [
      { id: "aircraft", label: "AIRCRAFT", status: dataSource },
      { id: "quakes", label: "SEISMIC", status: earthquakeSource },
      { id: "events", label: "GDELT", status: eventSource },
      { id: "ships", label: "SHIPS", status: shipSource },
      { id: "fires", label: "FIRMS", status: fireSource },
      { id: "weather", label: "NOAA", status: weatherSource },
      { id: "cyclones", label: "NHC", status: cycloneSource },
      { id: "news", label: "NEWS", status: newsSource },
    ],
    [dataSource, earthquakeSource, eventSource, shipSource, fireSource, weatherSource, cycloneSource, newsSource],
  );

  // ── Filters ────────────────────────────────────────────────────
  const filters = useMemo<Record<string, unknown>>(
    () => ({
      aircraft: aircraftFilter,
      ships: layers.ships ?? true,
      events: { enabled: layers.events ?? true, minSeverity: 0 },
      quakes: { enabled: layers.quakes ?? true, minMagnitude: 0 },
      fires: { enabled: layers.fires ?? true, minConfidence: 0 },
      weather: { enabled: layers.weather ?? true, minSeverity: 0 },
      cyclones: {
        enabled: layers.cyclones ?? true,
        minCategory: 0,
        showForecast: true,
        showCone: true,
      },
    }),
    [aircraftFilter, layers],
  );

  // ── Pre-computed filter set ────────────────────────────────────
  // Synthetic cyclone-forecast points piggyback on their parent storm's
  // filter status: if the parent passes (cyclones filter + minCategory),
  // every forecast point of that storm is selectable too. Done in a
  // second pass so the parent storm's id is guaranteed to be settled.
  // Gate on version too: matchesFilter reads mutable item.data fields
  // (aircraft onGround / squawk; ship sog) that change between polls
  // without changing the id-set.
  const filteredIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < allData.length; i++) {
      const item = allData[i]!;
      const feature = featureRegistry.get(item.type);
      if (!feature) continue;
      const filter = filters[item.type];
      if (filter == null) continue;
      if (feature.matchesFilter(item as any, filter)) ids.add(item.id);
    }
    for (const item of allData) {
      if (item.type !== "cyclones-forecast") continue;
      const parentId = `CY${(item.data as { parentStormId: string }).parentStormId}`;
      if (ids.has(parentId)) ids.add(item.id);
    }
    return ids;
  }, [allData, filters, allDataVersion]);

  // ── Derived values ─────────────────────────────────────────────
  // tickerItems/counts/activeCount: gate on version (filter results read
  // mutable data fields). availableCountries: stays on ref — originCountry
  // is server-derived per icao24 and is stable per id.
  const tickerItems = useMemo(
    () => buildTickerItems(allData),
    [allData, allDataVersion],
  );
  const counts = useMemo(
    () => selectLayerCounts(allData, filters),
    [allData, filters, allDataVersion],
  );
  const activeCount = useMemo(
    () => selectActiveCount(allData, filters),
    [allData, filters, allDataVersion],
  );
  const availableCountries = useMemo(
    () => selectAvailableAircraftCountries(allData),
    [allData],
  );

  // ── URL sync for aircraft filter ───────────────────────────────
  useEffect(() => { syncAircraftFilterToUrl(aircraftFilter); }, [aircraftFilter]);

  // ── Handlers ───────────────────────────────────────────────────
  const toggleLayer = useCallback((key: string) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }, []);

  // ── Correlation engine ─────────────────────────────────────────
  // Position-dependent: clusterByRegion buckets by lat/lon and recency.
  // Gate on version so positional updates re-cluster.
  const correlation = useMemo(
    () => computeCorrelations(allData, newsArticles),
    [allData, newsArticles, allDataVersion],
  );

  // ── DataContext value ──────────────────────────────────────────
  const dataValue = useMemo<DataContextValue>(
    () => ({
      allData,
      newsArticles,
      spatialGrid,
      filteredIds,
      layers,
      toggleLayer,
      aircraftFilter,
      setAircraftFilter,
      filters,
      counts,
      activeCount,
      tickerItems,
      availableCountries,
      dataSources,
      correlation,
      requestAircraftEnrichment,
    }),
    [
      allData, newsArticles, spatialGrid, filteredIds,
      layers, toggleLayer, aircraftFilter, filters,
      counts, activeCount, tickerItems, availableCountries,
      dataSources, correlation, requestAircraftEnrichment,
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
    // @ts-ignore — data shape is AircraftData when type is "aircraft"
    const icao24 = selectedCurrent.data?.icao24;
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
