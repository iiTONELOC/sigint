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

// ── Hook result ─────────────────────────────────────────────────────

type UseProviderDataResult = {
  data: DataPoint[];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<ProviderDataSource>("loading");

  // Sync state from provider snapshot
  const syncFromSnapshot = useCallback(() => {
    const snapshot = provider.getSnapshot();
    if (snapshot.entities.length > 0 || !snapshot.loading) {
      setData([...snapshot.entities]);
      setLoading(snapshot.loading);
      setError(snapshot.error ?? null);
      setDataSource(resolveDataSource(snapshot.entities, snapshot));
    }
  }, [provider, resolveDataSource]);

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    // Subscribe to background refresh completions
    provider.onChange?.(() => {
      if (isMounted) syncFromSnapshot();
    });

    // Sync read: if provider was hydrated before mount, show data NOW
    const snap = provider.getSnapshot();
    if (snap.entities.length > 0) {
      setData([...snap.entities]);
      setLoading(false);
      setError(snap.error ?? null);
      setDataSource(resolveDataSource(snap.entities, snap));
    }

    // Async: getData triggers background refresh if stale
    provider
      .getData(pollInterval)
      .then((result) => {
        if (!isMounted) return;
        const snapshot = provider.getSnapshot();
        setData([...result]);
        setLoading(false);
        setError(snapshot.error ?? null);
        setDataSource(resolveDataSource(result, snapshot));
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("error");
      });

    intervalId = setInterval(async () => {
      try {
        const result = await provider.refresh();
        if (!isMounted) return;
        const snapshot = provider.getSnapshot();
        setData([...result]);
        setLoading(false);
        setError(snapshot.error ?? null);
        setDataSource(resolveDataSource(result, snapshot));
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("error");
      }
    }, pollInterval);

    return () => {
      isMounted = false;
      provider.onChange?.(null);
      if (intervalId) clearInterval(intervalId);
    };
  }, [provider, pollInterval, resolveDataSource, syncFromSnapshot]);

  return { data, loading, error, dataSource };
}
