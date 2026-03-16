import { useCallback, useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { generateMockAircraft } from "@/data/mockData";
import { AircraftProvider } from "../data/provider";

const aircraftProvider = new AircraftProvider();

export type AircraftDataSource = "loading" | "live" | "cached" | "mock";

type UseAircraftDataResult = {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: AircraftDataSource;
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
};

export function useAircraftData(
  pollInterval: number = 240_000,
): UseAircraftDataResult {
  const hydratedAircraft = aircraftProvider.hydrate();

  const [data, setData] = useState<DataPoint[]>(() => {
    if (hydratedAircraft && hydratedAircraft.length > 0) {
      return hydratedAircraft;
    }
    return generateMockAircraft();
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

    const poll = async () => {
      try {
        // Call refresh() directly — the poll interval IS our schedule,
        // don't let the provider's internal cache cause stale data
        const aircraftData = await aircraftProvider.refresh();
        if (!isMounted) return;

        const snapshot = aircraftProvider.getSnapshot();
        setData(aircraftData);
        setLoading(false);

        if (snapshot.error) {
          setError(snapshot.error);
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
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("mock");
      }
    };

    // Skip immediate fetch if hydration returned fresh cached data
    if (hydratedAircraft && hydratedAircraft.length > 0) {
      intervalId = setInterval(poll, pollInterval);
    } else {
      poll();
      intervalId = setInterval(poll, pollInterval);
    }

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
        setData(enrichedAircraft);
      } catch {
        // Non-fatal: enrichment is best effort.
      }
    },
    [],
  );

  return { data, loading, error, dataSource, requestAircraftEnrichment };
}
