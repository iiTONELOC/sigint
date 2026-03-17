import { useEffect, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { WeatherProvider } from "../data/provider";

const weatherProvider = new WeatherProvider();

export type WeatherDataSource =
  | "loading"
  | "live"
  | "cached"
  | "error"
  | "empty";

type UseWeatherDataResult = {
  data: DataPoint[];
  loading: boolean;
  error: Error | null;
  dataSource: WeatherDataSource;
};

export function useWeatherData(
  pollInterval: number = 300_000, // 5 minutes
): UseWeatherDataResult {
  const hydratedData = weatherProvider.hydrate();

  const [data, setData] = useState<DataPoint[]>(() =>
    hydratedData && hydratedData.length > 0 ? hydratedData : [],
  );
  const [loading, setLoading] = useState(
    !(hydratedData && hydratedData.length > 0),
  );
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<WeatherDataSource>(() => {
    if (hydratedData && hydratedData.length > 0) return "cached";
    return "loading";
  });

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async () => {
      try {
        const weatherData = await weatherProvider.refresh();
        if (!isMounted) return;

        const snapshot = weatherProvider.getSnapshot();
        setData(weatherData);
        setLoading(false);

        if (snapshot.error) {
          setError(snapshot.error);
          setDataSource(weatherData.length > 0 ? "cached" : "error");
        } else {
          setError(null);
          setDataSource(weatherData.length > 0 ? "live" : "empty");
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
