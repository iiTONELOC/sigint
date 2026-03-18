import { useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { EarthquakeProvider } from "../data/provider";

const earthquakeProvider = new EarthquakeProvider();

export type EarthquakeDataSource =
  | "loading"
  | "live"
  | "cached"
  | "error"
  | "empty";

type UseEarthquakeDataResult = {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: EarthquakeDataSource;
};

export function useEarthquakeData(
  pollInterval: number = 420_000, // 7 minutes
): UseEarthquakeDataResult {
  const hydratedData = earthquakeProvider.hydrate();

  const [data, setData] = useState<DataPoint[]>(() =>
    hydratedData && hydratedData.length > 0 ? hydratedData : [],
  );
  const [loading, setLoading] = useState(
    !(hydratedData && hydratedData.length > 0),
  );
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<EarthquakeDataSource>(() => {
    if (hydratedData && hydratedData.length > 0) return "cached";
    return "loading";
  });

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async (isInitial = false) => {
      try {
        const earthquakeData = isInitial
          ? await earthquakeProvider.getData(pollInterval)
          : await earthquakeProvider.refresh();
        if (!isMounted) return;

        const snapshot = earthquakeProvider.getSnapshot();
        setData(earthquakeData);
        setLoading(false);

        if (snapshot.error) {
          setError(snapshot.error);
          setDataSource(earthquakeData.length > 0 ? "cached" : "error");
        } else {
          setError(null);
          setDataSource(earthquakeData.length > 0 ? "live" : "empty");
        }
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource("error");
      }
    };

    // Always fetch on mount — hydrated data is shown instantly but may be stale.
    poll(true);
    intervalId = setInterval(poll, pollInterval);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollInterval]);

  return { data, loading, error, dataSource };
}
