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
import type { AircraftFilterValues } from "@shared/domain/aircraftFilter";
import type { MinCategory } from "@shared/domain/cyclones";
import { useNewsData } from "@/features/news";
import type { NewsArticle } from "@/features/news";
import {
  useAvailableCountries,
  useSourceCounts,
} from "@/features/base/useSourceCounts";
import { useSourceSnapshot } from "@/features/base/useSourceQuery";
import { useSourceTicker } from "@/features/base/useSourceTicker";
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
  toggleRenderCycloneWarnings,
  toggleRenderLayer,
} from "@/render-surface/globeStateStore";
import { useRenderGlobeState } from "@/render-surface/useRenderGlobeState";
import {
  RenderCycloneLayer,
  type RenderCycloneOverlay,
} from "@/workers/render/protocol";
import {
  isRenderLayerId,
  type RenderLayerVisibility,
} from "@/workers/render/policy";

import { UIProvider } from "@/context/UIContext";

export type CycloneFilter = {
  enabled: boolean;
  minCategory: MinCategory;
};
import { WatchProvider } from "@/context/WatchContext";

type DataContextValue = {
  newsArticles: NewsArticle[];
  layers: RenderLayerVisibility;
  toggleLayer: (key: string) => void;
  aircraftFilter: AircraftFilterValues;
  setAircraftFilter: React.Dispatch<
    React.SetStateAction<AircraftFilterValues>
  >;
  counts: Record<string, number>;
  activeCount: number;
  tickerItems: DataPoint[];
  availableCountries: string[];
  dataSources: readonly SourceStatusEntry[];
  correlation: CorrelationResult;
  cycloneOverlays: Readonly<Record<string, RenderCycloneOverlay>>;
  cycloneWarningsVisible: boolean;
  toggleCycloneLayer: (
    entityId: string,
    layer: RenderCycloneLayer,
  ) => void;
  toggleCycloneWarnings: () => void;
  toggleModel: (entityId: string, model: string) => void;
  toggleAllModels: (
    entityId: string,
    models: readonly string[],
  ) => void;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

export enum DataContextError {
  MissingProvider = "useDataContext must be used within DataProvider",
}

enum CorrelationRequestTiming {
  DebounceMs = 1_000,
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

export function DataProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const globeState = useRenderGlobeState();
  const layers = globeState.layers;
  const aircraftFilter = globeState.aircraftFilter;

  const setAircraftFilter = useCallback<
    React.Dispatch<React.SetStateAction<AircraftFilterValues>>
  >((update) => {
    const current = readRenderGlobeState().aircraftFilter;
    const next =
      typeof update === "function" ? update(current) : update;
    setRenderAircraftFilter(next);
  }, []);

  const toggleCycloneLayer = useCallback(
    (entityId: string, layer: RenderCycloneLayer) => {
      toggleRenderCycloneLayer(entityId, layer);
    },
    [],
  );
  const toggleModel = useCallback((entityId: string, model: string) => {
    toggleRenderCycloneModel(entityId, model);
  }, []);
  const toggleAllModels = useCallback((
    entityId: string,
    models: readonly string[],
  ) => {
    toggleAllRenderCycloneModels(entityId, models);
  }, []);

  const { data: newsArticles, dataSource: newsSource } = useNewsData();
  const aircraftSource = useSourceSnapshot(Domain.Aircraft);
  const shipSource = useSourceSnapshot(Domain.Ships);
  const eventSource = useSourceSnapshot(Domain.Events);
  const weatherSource = useSourceSnapshot(Domain.Weather);
  const cycloneSource = useSourceSnapshot(Domain.Cyclones);
  const earthquakeSource = useSourceSnapshot(Domain.Earthquake);
  const fireSource = useSourceSnapshot(Domain.Fire);
  const correlationInputVersion =
    (aircraftSource?.version ?? 0) +
    (shipSource?.version ?? 0) +
    (eventSource?.version ?? 0) +
    (earthquakeSource?.version ?? 0) +
    (fireSource?.version ?? 0) +
    (weatherSource?.version ?? 0) +
    (cycloneSource?.version ?? 0);

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

  const cycloneFilter = useMemo<CycloneFilter>(
    () => ({
      enabled: layers[Domain.Cyclones],
      minCategory: globeState.cycloneFilter.minimumCategory,
    }),
    [globeState.cycloneFilter.minimumCategory, layers],
  );
  const filters = useMemo<Record<string, unknown>>(
    () => ({
      [Domain.Aircraft]: aircraftFilter,
      [Domain.Ships]: layers[Domain.Ships],
      [Domain.Events]: layers[Domain.Events],
      [Domain.Quakes]: layers[Domain.Quakes],
      [Domain.Fires]: layers[Domain.Fires],
      [Domain.Weather]: layers[Domain.Weather],
      [Domain.Cyclones]: cycloneFilter,
    }),
    [aircraftFilter, layers, cycloneFilter],
  );

  const counts = useSourceCounts(filters);
  const availableCountries = useAvailableCountries();
  const tickerItems = useSourceTicker();
  const activeCount = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  );

  const toggleLayer = useCallback((key: string) => {
    if (!isRenderLayerId(key)) return;
    toggleRenderLayer(key);
  }, []);

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

  const dataValue = useMemo<DataContextValue>(
    () => ({
      newsArticles,
      layers,
      toggleLayer,
      aircraftFilter,
      setAircraftFilter,
      counts,
      activeCount,
      tickerItems,
      availableCountries,
      dataSources,
      correlation,
      cycloneOverlays: globeState.cycloneFilter.overlays,
      cycloneWarningsVisible: globeState.cycloneFilter.showWarnings,
      toggleCycloneLayer,
      toggleCycloneWarnings: toggleRenderCycloneWarnings,
      toggleModel,
      toggleAllModels,
    }),
    [
      newsArticles,
      layers, toggleLayer, aircraftFilter,
      counts, activeCount, tickerItems, availableCountries,
      dataSources, correlation, globeState.cycloneFilter,
      toggleCycloneLayer, toggleModel, toggleAllModels,
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

export function useDataContext(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error(DataContextError.MissingProvider);
  }
  return context;
}
