import { useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { ShipProvider } from "../data/provider";

const shipProvider = new ShipProvider();

export type ShipDataSource =
  | "loading"
  | "live"
  | "cached"
  | "error"
  | "unavailable";

type UseShipDataResult = {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: ShipDataSource;
};

export function useShipData(
  pollInterval: number = 300_000, // 5 minutes
): UseShipDataResult {
  const hydratedData = shipProvider.hydrate();

  const [data, setData] = useState<DataPoint[]>(() =>
    hydratedData && hydratedData.length > 0 ? hydratedData : [],
  );
  const [loading, setLoading] = useState(
    !(hydratedData && hydratedData.length > 0),
  );
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<ShipDataSource>(() => {
    if (hydratedData && hydratedData.length > 0) return "cached";
    return "loading";
  });

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async (isInitial = false) => {
      try {
        const shipData = isInitial
          ? await shipProvider.getData(pollInterval)
          : await shipProvider.refresh();
        if (!isMounted) return;

        const snapshot = shipProvider.getSnapshot();
        setData(shipData);
        setLoading(false);

        if (snapshot.error) {
          setError(snapshot.error);
          if (shipData.length > 0) {
            setDataSource("cached");
          } else {
            // 503 from server means AISSTREAM_API_KEY not set
            const is503 = snapshot.error.message.includes("503");
            setDataSource(is503 ? "unavailable" : "error");
          }
        } else {
          setError(null);
          setDataSource(shipData.length > 0 ? "live" : "unavailable");
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
