import { useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { GdeltProvider } from "../data/provider";

const gdeltProvider = new GdeltProvider();

export type EventDataSource = "loading" | "live" | "cached" | "error" | "empty";

type UseEventDataResult = {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: EventDataSource;
};

export function useEventData(
  pollInterval: number = 900_000, // 15 minutes
): UseEventDataResult {
  const hydratedData = gdeltProvider.hydrate();

  const [data, setData] = useState<DataPoint[]>(() =>
    hydratedData && hydratedData.length > 0 ? hydratedData : [],
  );
  const [loading, setLoading] = useState(
    !(hydratedData && hydratedData.length > 0),
  );
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<EventDataSource>(() => {
    if (hydratedData && hydratedData.length > 0) return "cached";
    return "loading";
  });

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async (isInitial = false) => {
      try {
        const eventData = isInitial
          ? await gdeltProvider.getData()
          : await gdeltProvider.refresh();
        if (!isMounted) return;

        const snapshot = gdeltProvider.getSnapshot();
        setData(eventData);
        setLoading(false);

        if (snapshot.error) {
          setError(snapshot.error);
          setDataSource(eventData.length > 0 ? "cached" : "error");
        } else {
          setError(null);
          setDataSource(eventData.length > 0 ? "live" : "empty");
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

    // Skip immediate fetch if hydration returned fresh data
    if (hydratedData && hydratedData.length > 0) {
      intervalId = setInterval(poll, pollInterval);
    } else {
      poll(true);
      intervalId = setInterval(poll, pollInterval);
    }

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollInterval]);

  return { data, loading, error, dataSource };
}
