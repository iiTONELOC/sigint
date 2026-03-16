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
import {
  selectActiveCount,
  selectLayerCounts,
  selectAvailableAircraftCountries,
} from "@/lib/uiSelectors";
import { buildTickerItems } from "@/lib/tickerFeed";
import { recordPositions } from "@/lib/trailService";
import type { SourceStatus } from "@/components/StatusBadge";

// ── Context value type ──────────────────────────────────────────────

type DataContextValue = {
  // Raw data
  allData: DataPoint[];

  // Selection
  selected: DataPoint | null;
  selectedCurrent: DataPoint | null;
  setSelected: React.Dispatch<React.SetStateAction<DataPoint | null>>;

  // Isolation
  isolateMode: null | "solo" | "focus";
  setIsolateMode: React.Dispatch<
    React.SetStateAction<null | "solo" | "focus">
  >;

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

  // Enrichment
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

// ── Provider ────────────────────────────────────────────────────────

export function DataProvider({ children }: { children: ReactNode }) {
  const lastEnrichmentKeyRef = useRef("");
  const stashedSelectionRef = useRef<DataPoint | null>(null);
  const stashedIsolateModeRef = useRef<null | "solo" | "focus">(null);

  // ── View controls ───────────────────────────────────────────────
  const [flat, setFlat] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(0.2);
  const [chromeHidden, setChromeHidden] = useState(false);

  // ── Selection & isolation ───────────────────────────────────────
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [isolateMode, setIsolateMode] = useState<null | "solo" | "focus">(
    null,
  );

  // ── Layers & filters ───────────────────────────────────────────
  const [layers, setLayers] = useState<Record<string, boolean>>({
    ships: true,
    events: true,
    quakes: true,
  });
  const [aircraftFilter, setAircraftFilter] = useState<AircraftFilter>(() =>
    getInitialAircraftFilter(),
  );

  // ── Search & zoom ──────────────────────────────────────────────
  const [zoomToId, setZoomToId] = useState<string | null>(null);
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

  const { data: eventData, dataSource: eventSource } =
    useEventData();

  const { data: shipData, dataSource: shipSource } =
    useShipData();

  // ── Merged data ────────────────────────────────────────────────
  const allData = useMemo(
    () => [...aircraftData, ...shipData, ...earthquakeData, ...eventData],
    [aircraftData, shipData, earthquakeData, eventData],
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
          ((d.data as any)?.speed
            ? (d.data as any).speed * 0.5144
            : undefined),
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
    ],
    [dataSource, earthquakeSource, eventSource, shipSource],
  );

  // ── Filters ────────────────────────────────────────────────────
  const filters = useMemo<Record<string, unknown>>(
    () => ({
      aircraft: aircraftFilter,
      ships: layers.ships ?? true,
      events: { enabled: layers.events ?? true, minSeverity: 0 },
      quakes: { enabled: layers.quakes ?? true, minMagnitude: 0 },
    }),
    [aircraftFilter, layers],
  );

  // ── Derived values ─────────────────────────────────────────────
  const tickerItems = useMemo(
    () => buildTickerItems(allData, filters, layers),
    [allData, filters, layers],
  );

  const selectedCurrent = useMemo(() => {
    if (!selected) return null;
    const next = allData.find((item) => item.id === selected.id);
    return next ?? selected;
  }, [allData, selected]);

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
      requestAircraftEnrichment,
    }),
    [
      allData,
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
