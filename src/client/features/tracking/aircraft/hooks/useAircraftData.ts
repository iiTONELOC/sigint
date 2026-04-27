import { useCallback, useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { generateMockAircraft } from "@/data/mockData";
import { AircraftProvider } from "../data/provider";

export const aircraftProvider = new AircraftProvider();

export type AircraftDataSource = "loading" | "live" | "cached" | "mock";

type UseAircraftDataResult = {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: AircraftDataSource;
  requestAircraftEnrichment: (icao24List: string[]) => Promise<void>;
};

// 15 s default. The server cache is in-memory and the response is
// cheap (~20 KB/s peak for 5k aircraft); polling fast is what surfaces
// the streaming sweep — server pushes ingestTile per ~3 s, client
// catches each batch within one poll. The previous 240 s left users
// staring at a stale snapshot through an entire sweep cycle.
export const DEFAULT_AIRCRAFT_POLL_MS = 15_000;

export function useAircraftData(
  pollInterval: number = DEFAULT_AIRCRAFT_POLL_MS,
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

    // One refresh attempt — used both by setInterval and by the
    // visibilitychange handler (so a tab returning to focus catches
    // up immediately instead of waiting for the next interval tick).
    const refreshOnce = async () => {
      try {
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

    intervalId = setInterval(refreshOnce, pollInterval);

    // Browser background-tab timer throttling can stretch the
    // setInterval cadence to >1 min, so trigger an explicit refresh
    // when the tab comes back into focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMounted = false;
      aircraftProvider.onChange(null);
      document.removeEventListener("visibilitychange", onVisible);
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
