import { useCallback, useEffect, useRef, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { DataOrchestrator } from "@/providers/DataOrchestrator";
import { generateMockAircraft, generateMockNonAircraft } from "@/data/mockData";
import { AircraftProvider } from "./provider";

const aircraftProvider = new AircraftProvider();
const orchestrator = new DataOrchestrator([aircraftProvider]);

export type AircraftDataSource = "loading" | "live" | "cached" | "mock";

interface UseAircraftDataResult {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: AircraftDataSource;
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
}

export function useAircraftData(
  pollInterval: number = 240_000,
): UseAircraftDataResult {
  const hydratedAircraft = aircraftProvider.hydrate();
  const nonAircraftBaseRef = useRef<DataPoint[]>(generateMockNonAircraft());

  const [data, setData] = useState<DataPoint[]>(() => {
    const base = nonAircraftBaseRef.current;
    if (hydratedAircraft && hydratedAircraft.length > 0) {
      return [...base, ...hydratedAircraft];
    }
    return [...base, ...generateMockAircraft()];
  });
  const [loading, setLoading] = useState(
    !(hydratedAircraft && hydratedAircraft.length > 0),
  );
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<AircraftDataSource>(() => {
    if (hydratedAircraft && hydratedAircraft.length > 0) return "cached";
    return "loading";
  });

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    orchestrator.initialize();

    const refresh = async () => {
      try {
        const aircraftData = await aircraftProvider.getData();
        if (!isMounted) return;

        // Check the provider snapshot to see if it errored internally
        const snapshot = aircraftProvider.getSnapshot();
        setData([...nonAircraftBaseRef.current, ...aircraftData]);
        setLoading(false);

        if (snapshot.error) {
          setError(snapshot.error);
          // Provider fell back — determine what it fell back to
          // If there was ever a successful fetch (cache exists with real data),
          // it's "cached". Otherwise it's mock.
          const hasRealCache =
            aircraftData.length > 0 &&
            aircraftData.some(
              (d) => d.type === "aircraft" && (d.data as any)?.icao24,
            );
          setDataSource(hasRealCache ? "cached" : "mock");
        } else {
          setError(null);
          setDataSource("live");
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to fetch aircraft data:", err);
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("mock");
      }
    };

    refresh();
    intervalId = setInterval(refresh, pollInterval);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollInterval]);

  const requestAircraftEnrichment = useCallback(
    async (icao24List: string[]) => {
      if (!icao24List.length) return;
      try {
        const enrichedAircraft =
          await aircraftProvider.enrichAircraftByIcao24(icao24List);
        if (!enrichedAircraft) return;
        setData([...nonAircraftBaseRef.current, ...enrichedAircraft]);
      } catch {
        // Non-fatal: enrichment is best effort.
      }
    },
    [],
  );

  return { data, loading, error, dataSource, requestAircraftEnrichment };
}
