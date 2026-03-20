import { useEffect, useState } from "react";
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

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async (isInitial = false) => {
      try {
        const result = isInitial
          ? await provider.getData(pollInterval)
          : await provider.refresh();
        if (!isMounted) return;

        const snapshot = provider.getSnapshot();
        setData(result);
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
    };

    poll(true);
    intervalId = setInterval(poll, pollInterval);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [provider, pollInterval, resolveDataSource]);

  return { data, loading, error, dataSource };
}
