import { useEffect, useState, useCallback } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";

// ── Data source status ──────────────────────────────────────────────

export type ProviderDataSource =
  | "loading"
  | "live"
  | "cached"
  | "error"
  | "empty"
  | "unavailable";

/**
 * Called after each poll to determine the data source status.
 * Default: "live" when data present, "empty" when not; "cached"/"error" on errors.
 * Override for custom logic (e.g. fire/ship 503 → "unavailable").
 */
export type ResolveDataSource = (
  data: DataPoint[],
  snapshot: ProviderSnapshot<DataPoint>,
) => ProviderDataSource;

const defaultResolveDataSource: ResolveDataSource = (data, snapshot) => {
  if (snapshot.error) {
    return data.length > 0 ? "cached" : "error";
  }
  return data.length > 0 ? "live" : "empty";
};

/**
 * Resolver for feeds whose server returns 503 when an API key is unset
 * (ships, fires): treat a keyless 503 as "unavailable" rather than "error",
 * and a no-data steady state as "unavailable" too. Shared so both features
 * read the same status semantics.
 */
export const resolveSourceWith503Unavailable: ResolveDataSource = (data, snapshot) => {
  if (snapshot.error) {
    if (data.length > 0) return "cached";
    return snapshot.error.message.includes("503") ? "unavailable" : "error";
  }
  return data.length > 0 ? "live" : "unavailable";
};

// ── Hook result ─────────────────────────────────────────────────────

type UseProviderDataResult = {
  data: DataPoint[];
  /**
   * Provider snapshot version. Bumps on every refresh that produces a
   * usable snapshot, even when the entities array reference is preserved
   * (in-place mutation on same-id-set polls). Subscribers that gate on
   * positions/data fields use version; those gating only on membership
   * use reference equality on `data`. See diffEntities.ts.
   */
  version: number;
  loading: boolean;
  error: Error | null;
  dataSource: ProviderDataSource;
};

// ── Hook ─────────────────────────────────────────────────────────────

export function useProviderData(
  provider: DataProvider<DataPoint>,
  pollInterval: number,
  resolveDataSource: ResolveDataSource = defaultResolveDataSource,
): UseProviderDataResult {
  const [data, setData] = useState<DataPoint[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<ProviderDataSource>("loading");

  // Sync state from provider snapshot. Passes the snapshot's entities
  // array reference straight through — when in-place mutation preserved
  // it, React's Object.is bails on setData and downstream memos that
  // gate on identity skip recomputation. setVersion always fires so
  // version-sensitive subscribers re-run.
  const syncFromSnapshot = useCallback(() => {
    const snapshot = provider.getSnapshot();
    if (snapshot.entities.length > 0 || !snapshot.loading) {
      setData(snapshot.entities);
      setVersion(snapshot.version);
      setLoading(snapshot.loading);
      setError(snapshot.error ?? null);
      setDataSource(resolveDataSource(snapshot.entities, snapshot));
    }
  }, [provider, resolveDataSource]);

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    // Subscribe to background refresh completions (boot sequence + intervals)
    provider.onChange?.(() => {
      if (isMounted) syncFromSnapshot();
    });

    // Sync read: if provider already has data (hydrated before mount), show it
    const snap = provider.getSnapshot();
    if (snap.entities.length > 0) {
      setData(snap.entities);
      setVersion(snap.version);
      setLoading(false);
      setError(snap.error ?? null);
      setDataSource(resolveDataSource(snap.entities, snap));
    }

    // One refresh attempt — shared by setInterval AND the
    // visibilitychange handler below. Browser background-tab timer
    // throttling stretches setInterval cadences to >1 min on idle
    // tabs, so a tab returning to focus fires an immediate refresh
    // instead of waiting for the next throttled tick.
    const refreshOnce = async () => {
      try {
        await provider.refresh();
        if (!isMounted) return;
        syncFromSnapshot();
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("error");
      }
    };

    intervalId = setInterval(refreshOnce, pollInterval);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMounted = false;
      provider.onChange?.(null);
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalId) clearInterval(intervalId);
    };
  }, [provider, pollInterval, resolveDataSource, syncFromSnapshot]);

  return { data, version, loading, error, dataSource };
}
