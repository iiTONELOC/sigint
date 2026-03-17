import { useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { FireProvider } from "../data/provider";

const fireProvider = new FireProvider();

export type FireDataSource =
  | "loading"
  | "live"
  | "cached"
  | "error"
  | "unavailable";

type UseFireDataResult = {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: FireDataSource;
};

export function useFireData(
  pollInterval: number = 600_000, // 10 minutes
): UseFireDataResult {
  const hydratedData = fireProvider.hydrate();

  const [data, setData] = useState<DataPoint[]>(() =>
    hydratedData && hydratedData.length > 0 ? hydratedData : [],
  );
  const [loading, setLoading] = useState(
    !(hydratedData && hydratedData.length > 0),
  );
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<FireDataSource>(() => {
    if (hydratedData && hydratedData.length > 0) return "cached";
    return "loading";
  });

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async () => {
      try {
        const fireData = await fireProvider.refresh();
        if (!isMounted) return;

        const snapshot = fireProvider.getSnapshot();
        setData(fireData);
        setLoading(false);

        if (snapshot.error) {
          setError(snapshot.error);
          if (fireData.length > 0) {
            setDataSource("cached");
          } else {
            const is503 = snapshot.error.message.includes("503");
            setDataSource(is503 ? "unavailable" : "error");
          }
        } else {
          setError(null);
          setDataSource(fireData.length > 0 ? "live" : "unavailable");
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

    if (hydratedData && hydratedData.length > 0) {
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

  return { data, loading, error, dataSource };
}
