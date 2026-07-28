import { useCallback, useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";

import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import { AircraftProvider } from "../data/provider";

const AIRCRAFT_SOURCE = getPointSourceDefinition("aircraft");

export const aircraftProvider = new AircraftProvider();

export type AircraftDataSource =
  | "loading"
  | "live"
  | "cached"
  | "degraded"
  | "unavailable";

type UseAircraftDataResult = {
  data: DataPoint[];
  /**
   * Provider snapshot version. Bumps on every refresh; the entities
   * array reference is preserved across same-id-set polls via in-place
   * mutation (see provider.ts diffAndApply). Subscribers gating on
   * positions/data-field changes use this number; those gating on
   * membership use reference equality on `data`.
   */
  version: number;
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
export function useAircraftData(
  pollInterval: number = AIRCRAFT_SOURCE.pollIntervalMs,
): UseAircraftDataResult {
  const [data, setData] = useState<DataPoint[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<AircraftDataSource>("loading");

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const applySnapshot = () => {
      const snapshot = aircraftProvider.getSnapshot();
      const result = snapshot.entities;
      const source = snapshot.source;
      setData(result);
      setVersion(snapshot.version);
      setLoading(false);

      if (snapshot.error) {
        setError(snapshot.error);
        setDataSource(result.length > 0 ? "cached" : "unavailable");
        return;
      }

      setError(source?.error ? new Error(source.error.message) : null);
      if (source?.phase === "unavailable" || source?.freshness === "expired") {
        setDataSource("unavailable");
      } else if (
        source?.phase === "degraded" ||
        source?.freshness === "stale"
      ) {
        setDataSource("degraded");
      } else if (source?.phase === "loading" || source?.phase === "cold") {
        setDataSource(result.length > 0 ? "cached" : "loading");
      } else if (source?.phase === "ready") {
        setDataSource("live");
      } else {
        setDataSource(result.length > 0 ? "cached" : "loading");
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
        await aircraftProvider.refresh();
        if (!isMounted) return;
        applySnapshot();
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("unavailable");
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
        setData(enrichedAircraft);
        setVersion((v) => v + 1);
      } catch {
        // Non-fatal: enrichment is best effort.
      }
    },
    [],
  );

  return {
    data,
    version,
    loading,
    error,
    dataSource,
    requestAircraftEnrichment,
  };
}
