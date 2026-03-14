import { useCallback, useEffect, useRef, useState } from "react";
import type { DataPoint } from "@/domain/providers/base/types";
import { DataOrchestrator } from "@/domain/orchestrator/DataOrchestrator";
import { generateMockAircraft, generateMockNonAircraft } from "@/data/mockData";
import { createAircraftProvider } from "@/domain/providers/aircraft/createAircraftProvider";

const aircraftProvider = createAircraftProvider();
const orchestrator = new DataOrchestrator([aircraftProvider]);

interface UseAircraftDataResult {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
}

export function useAircraftData(
  pollInterval: number = 240_000, // 4 min — stays under 400 credits/day for anonymous OpenSky
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

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    orchestrator.initialize();

    const refresh = async () => {
      try {
        const aircraftData = await aircraftProvider.getData();
        if (!isMounted) return;
        setData([...nonAircraftBaseRef.current, ...aircraftData]);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to fetch aircraft data:", err);
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
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

  return { data, loading, error, requestAircraftEnrichment };
}
