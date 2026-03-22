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
import { useNewsData } from "@/panes/news-feed/useNewsData";
import type { NewsArticle } from "@/panes/news-feed/newsProvider";
import {
  selectActiveCount,
  selectLayerCounts,
  selectAvailableAircraftCountries,
} from "@/lib/uiSelectors";
import { buildTickerItems } from "@/lib/tickerFeed";
import { recordPositions } from "@/lib/trailService";
import { featureRegistry } from "@/features/registry";
import { getColorMap } from "@/config/theme";
import { useTheme } from "@/context/ThemeContext";
import { buildSpatialGrid, type SpatialGrid } from "@/lib/spatialIndex";
import {
  requestDossierOpen,
  requestWatchLayout,
} from "@/panes/paneLayoutContext";
import type { SourceStatus } from "@/lib/sourceHealth";
import {
  computeCorrelations,
  type CorrelationResult,
} from "@/lib/correlationEngine";

// ── Watch mode types ────────────────────────────────────────────────

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

type DataContextValue = {
  // Raw data
  allData: DataPoint[];
  newsArticles: NewsArticle[];

  // Lookup structures (for click/hover, not rendering)
  spatialGrid: SpatialGrid;
  filteredIds: Set<string>;

  // Selection
  selected: DataPoint | null;
  selectedCurrent: DataPoint | null;
  setSelected: React.Dispatch<React.SetStateAction<DataPoint | null>>;

  // Isolation
  isolateMode: null | "solo" | "focus";
  setIsolateMode: React.Dispatch<React.SetStateAction<null | "solo" | "focus">>;

  // Layers & filters
  layers: Record<string, boolean>;
  toggleLayer: (key: string) => void;
  aircraftFilter: AircraftFilter;
  setAircraftFilter: React.Dispatch<React.SetStateAction<AircraftFilter>>;
  filters: Record<string, unknown>;

  // Derived
  counts: Record<string, number>;
  activeCount: number;
  tickerItems: DataPoint[];
  availableCountries: string[];
  dataSources: SourceStatus[];

  // Intel correlation (computed once, shared across panes)
  correlation: CorrelationResult;

  // Globe view controls
  flat: boolean;
  setFlat: React.Dispatch<React.SetStateAction<boolean>>;
  autoRotate: boolean;
  setAutoRotate: React.Dispatch<React.SetStateAction<boolean>>;
  rotationSpeed: number;
  setRotationSpeed: React.Dispatch<React.SetStateAction<number>>;

  // Chrome visibility
  chromeHidden: boolean;
  setChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;

  // Search
  searchMatchIds: Set<string> | null;
  handleSearchMatchIds: (ids: Set<string> | null) => void;
  handleSearchSelect: (item: DataPoint) => void;
  handleSearchZoomTo: (item: DataPoint) => void;

  // Globe zoom
  zoomToId: string | null;
  setZoomToId: React.Dispatch<React.SetStateAction<string | null>>;

  /** Gently reveal a point on globe (ISS-level zoom, no lock-on) */
  revealId: string | null;
  setRevealId: React.Dispatch<React.SetStateAction<string | null>>;

  // Watch mode (shared — driven from globe, consumed by all panes)
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

  /** Select an item and zoom the globe to it */
  selectAndZoom: (item: DataPoint) => void;

  /** Color map keyed by feature id — derived from theme */
  colorMap: Record<string, string>;

  // Enrichment
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

// ── Provider ────────────────────────────────────────────────────────

export function DataProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const lastEnrichmentKeyRef = useRef("");
  const stashedSelectionRef = useRef<DataPoint | null>(null);
  const stashedIsolateModeRef = useRef<null | "solo" | "focus">(null);

  // ── View controls ───────────────────────────────────────────────
  const [flat, setFlat] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(0.35);
  const [chromeHidden, setChromeHidden] = useState(false);

  // ── Selection & isolation ───────────────────────────────────────
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [isolateMode, setIsolateMode] = useState<null | "solo" | "focus">(null);

  // ── Layers & filters ───────────────────────────────────────────
  const [layers, setLayers] = useState<Record<string, boolean>>({
    ships: true,
    events: true,
    quakes: true,
    fires: true,
    weather: true,
  });
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>(() =>
    getInitialAircraftFilter(),
  );

  // ── Search & zoom ──────────────────────────────────────────────
  const [zoomToId, setZoomToId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(
    null,
  );

  // ── Data hooks ─────────────────────────────────────────────────
  const {
    data: aircraftData,
    dataSource,
    requestAircraftEnrichment,
  } = useAircraftData();

  const { data: earthquakeData, dataSource: earthquakeSource } =
    useEarthquakeData();

  const { data: eventData, dataSource: eventSource } = useEventData();

  const { data: shipData, dataSource: shipSource } = useShipData();

  const { data: fireData, dataSource: fireSource } = useFireData();

  const { data: weatherData, dataSource: weatherSource } = useWeatherData();

  const { data: newsArticles, dataSource: newsSource } = useNewsData();

  // ── Merged data ────────────────────────────────────────────────
  const allData = useMemo(
    () => [
      ...aircraftData,
      ...shipData,
      ...earthquakeData,
      ...eventData,
      ...fireData,
      ...weatherData,
    ],
    [aircraftData, shipData, earthquakeData, eventData, fireData, weatherData],
  );

  // ── ID Map — O(1) lookup by id ─────────────────────────────────
  const idMap = useMemo(() => {
    const map = new Map<string, DataPoint>();
    for (let i = 0; i < allData.length; i++) {
      map.set(allData[i]!.id, allData[i]!);
    }
    return map;
  }, [allData]);

  // ── Spatial grid — for click/hover only ────────────────────────
  const spatialGrid = useMemo<SpatialGrid>(
    () =>
      allData.length > 0
        ? buildSpatialGrid(allData)
        : { cells: new Map(), size: 0 },
    [allData],
  );

  // ── Trail recording (centralized) ─────────────────────────────
  const allDataRef = useRef(allData);
  allDataRef.current = allData;

  useEffect(() => {
    const movingItems = allData
      .filter((d) => d.type === "aircraft" || d.type === "ships")
      .map((d) => ({
        id: d.id,
        lat: d.lat,
        lon: d.lon,
        heading: (d.data as any)?.heading,
        speedMps:
          (d.data as any)?.speedMps ??
          ((d.data as any)?.speed ? (d.data as any).speed * 0.5144 : undefined),
        altitude: (d.data as any)?.altitude,
        speed: (d.data as any)?.speed,
      }));
    if (movingItems.length > 0) {
      recordPositions(movingItems);
    }
  }, [allData]);

  // ── Data source status ─────────────────────────────────────────
  const dataSources = useMemo<SourceStatus[]>(
    () => [
      { id: "aircraft", label: "AIRCRAFT", status: dataSource },
      { id: "quakes", label: "SEISMIC", status: earthquakeSource },
      { id: "events", label: "GDELT", status: eventSource },
      { id: "ships", label: "SHIPS", status: shipSource },
      { id: "fires", label: "FIRMS", status: fireSource },
      { id: "weather", label: "NOAA", status: weatherSource },
      { id: "news", label: "NEWS", status: newsSource },
    ],
    [
      dataSource,
      earthquakeSource,
      eventSource,
      shipSource,
      fireSource,
      weatherSource,
      newsSource,
    ],
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
    }),
    [aircraftFilter, layers],
  );

  // ── Pre-computed filter set (for click/hover) ──────────────────
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
    return ids;
  }, [allData, filters]);

  // ── Derived values ─────────────────────────────────────────────
  const tickerItems = useMemo(
    () => buildTickerItems(allData),
    [allData],
  );

  const selectedCurrent = useMemo(() => {
    if (!selected) return null;
    return idMap.get(selected.id) ?? selected;
  }, [idMap, selected]);

  const counts = useMemo(
    () => selectLayerCounts(allData, filters),
    [allData, filters],
  );

  const activeCount = useMemo(
    () => selectActiveCount(allData, filters),
    [allData, filters],
  );

  const availableCountries = useMemo(
    () => selectAvailableAircraftCountries(allData),
    [allData],
  );

  // ── Aircraft enrichment ────────────────────────────────────────
  useEffect(() => {
    if (selectedCurrent?.type !== "aircraft") return;

    // @ts-ignore — data shape is AircraftData when type is "aircraft"
    const icao24 = selectedCurrent.data?.icao24;
    if (!icao24) return;

    const key = icao24;
    if (key === lastEnrichmentKeyRef.current) return;
    lastEnrichmentKeyRef.current = key;

    void requestAircraftEnrichment([icao24]);
  }, [selectedCurrent, requestAircraftEnrichment]);

  // ── URL sync for aircraft filter ───────────────────────────────
  useEffect(() => {
    syncAircraftFilterToUrl(aircraftFilter);
  }, [aircraftFilter]);

  // ── Handlers ───────────────────────────────────────────────────
  const toggleLayer = useCallback((key: string) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }, []);

  const handleSearchSelect = useCallback((item: DataPoint) => {
    setSelected(item);
  }, []);

  const handleSearchZoomTo = useCallback((item: DataPoint) => {
    setZoomToId(item.id);
    setTimeout(() => setZoomToId(null), 100);
  }, []);

  /** Select + zoom in one call — replaces the 3-line pattern used everywhere */
  const selectAndZoom = useCallback((item: DataPoint) => {
    setSelected(item);
    setZoomToId(item.id);
    setTimeout(() => setZoomToId(null), 100);
  }, []);

  /** Color map derived from theme — avoids 5× useMemo(getColorMap) across consumers */
  const colorMap = useMemo(() => getColorMap(theme), [theme]);

  // ── Correlation engine (computed once, shared) ─────────────────
  const correlation = useMemo(
    () => computeCorrelations(allData, newsArticles),
    [allData, newsArticles],
  );

  // ── Watch mode ──────────────────────────────────────────────────

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
      // Clear grace after the watch loop has had a chance to set currentId
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

  // Main watch loop — pauses when watchState.paused is true
  useEffect(() => {
    if (!watchState.active || watchState.paused) return;

    const items = watchItemsRef.current;
    if (items.length === 0) {
      stopWatch();
      return;
    }

    // Select + reveal current item (could be resuming from pause)
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

    // Countdown tick (100ms for smooth progress)
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

  // Manual selection pauses watch (not stops) so user can resume
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

  const handleSearchMatchIds = useCallback(
    (ids: Set<string> | null) => {
      setSearchMatchIds(ids);
      if (ids) {
        setSelected((prev) => {
          if (prev && !ids.has(prev.id)) {
            stashedSelectionRef.current = prev;
            stashedIsolateModeRef.current = isolateMode;
            setIsolateMode(null);
            return null;
          }
          return prev;
        });
      } else {
        if (stashedSelectionRef.current) {
          setSelected(stashedSelectionRef.current);
          setIsolateMode(stashedIsolateModeRef.current);
          stashedSelectionRef.current = null;
          stashedIsolateModeRef.current = null;
        }
      }
    },
    [isolateMode],
  );

  // ── Context value ──────────────────────────────────────────────
  const value = useMemo<DataContextValue>(
    () => ({
      allData,
      newsArticles,
      spatialGrid,
      filteredIds,
      selected,
      selectedCurrent,
      setSelected,
      isolateMode,
      setIsolateMode,
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
      flat,
      setFlat,
      autoRotate,
      setAutoRotate,
      rotationSpeed,
      setRotationSpeed,
      chromeHidden,
      setChromeHidden,
      searchMatchIds,
      handleSearchMatchIds,
      handleSearchSelect,
      handleSearchZoomTo,
      zoomToId,
      setZoomToId,
      revealId,
      setRevealId,
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
      selectAndZoom,
      colorMap,
      correlation,
      requestAircraftEnrichment,
    }),
    [
      allData,
      newsArticles,
      spatialGrid,
      filteredIds,
      selected,
      selectedCurrent,
      isolateMode,
      layers,
      toggleLayer,
      aircraftFilter,
      filters,
      counts,
      activeCount,
      tickerItems,
      availableCountries,
      dataSources,
      flat,
      autoRotate,
      rotationSpeed,
      chromeHidden,
      searchMatchIds,
      handleSearchMatchIds,
      handleSearchSelect,
      handleSearchZoomTo,
      zoomToId,
      revealId,
      watchState,
      watchProgress,
      startWatch,
      stopWatch,
      pauseWatch,
      resumeWatch,
      selectAndZoom,
      colorMap,
      correlation,
      requestAircraftEnrichment,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within DataProvider");
  }
  return context;
}
