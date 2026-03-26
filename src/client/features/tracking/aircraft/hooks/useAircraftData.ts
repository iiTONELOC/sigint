import { useCallback, useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { generateMockAircraft } from "@/data/mockData";
import { AircraftProvider } from "../data/provider";
import { ensureMetadataDb } from "../data/typeLookup";

export const aircraftProvider = new AircraftProvider();

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
  const [data, setData] = useState<DataPoint[]>(() => generateMockAircraft());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<AircraftDataSource>("loading");

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const applySnapshot = () => {
      const snapshot = aircraftProvider.getSnapshot();
      const result = snapshot.entities;
      setData(result.length > 0 ? [...result] : generateMockAircraft());
      setLoading(false);
      if (snapshot.error) {
        setError(snapshot.error);
        const hasRealCache =
          result.length > 0 &&
          result.some((d) => d.type === "aircraft" && (d.data as any)?.icao24);
        setDataSource(hasRealCache ? "cached" : "mock");
      } else {
        setError(null);
        setDataSource(result.length > 0 ? "live" : "mock");
      }
    };

    // Subscribe to background refresh completions (boot sequence + intervals)
    aircraftProvider.onChange(() => {
      if (isMounted) applySnapshot();
    });

    // Sync read: if provider already has data, show it
    const snap = aircraftProvider.getSnapshot();
    if (snap.entities.length > 0) {
      applySnapshot();
    }

    // Poll interval — subsequent refreshes after boot.
    // First refresh is handled by frontend.tsx boot sequence.
    intervalId = setInterval(async () => {
      try {
        await ensureMetadataDb().catch(() => {});
        const aircraftData = await aircraftProvider.refresh();
        if (!isMounted) return;
        setData([...aircraftData]);
        setLoading(false);
        const snapshot = aircraftProvider.getSnapshot();
        if (snapshot.error) {
          setError(snapshot.error);
          setDataSource(aircraftData.length > 0 ? "cached" : "mock");
        } else {
          setError(null);
          setDataSource("live");
          aircraftProvider.backgroundEnrich().catch(() => {});
        }
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("mock");
      }
    }, pollInterval);

    return () => {
      isMounted = false;
      aircraftProvider.onChange(null);
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
        setData([...enrichedAircraft]);
      } catch {
        // Non-fatal: enrichment is best effort.
      }
    },
    [],
  );

  return { data, loading, error, dataSource, requestAircraftEnrichment };
}
