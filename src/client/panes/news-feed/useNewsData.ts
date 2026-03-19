// ── useNewsData ─────────────────────────────────────────────────────
// Follows useProviderData pattern: local isMounted inside useEffect,
// getData() for initial call (StrictMode safe), refresh() for polls,
// hydration skip when cache is fresh.

import { useEffect, useState } from "react";
import { newsProvider, type NewsArticle } from "./newsProvider";

type NewsDataSource = "loading" | "live" | "cached" | "error" | "empty";

type UseNewsDataResult = {
  data: NewsArticle[];
  loading: boolean;
  error: Error | null;
  dataSource: NewsDataSource;
};

const POLL_INTERVAL = 600_000; // 10 min

export function useNewsData(): UseNewsDataResult {
  const hydratedData = newsProvider.hydrate();

  const [data, setData] = useState<NewsArticle[]>(() =>
    hydratedData && hydratedData.length > 0 ? hydratedData : [],
  );
  const [loading, setLoading] = useState(
    !(hydratedData && hydratedData.length > 0),
  );
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<NewsDataSource>(() => {
    if (hydratedData && hydratedData.length > 0) return "cached";
    return "loading";
  });

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async (isInitial = false) => {
      try {
        const result = isInitial
          ? await newsProvider.getData(POLL_INTERVAL)
          : await newsProvider.refresh();
        if (!isMounted) return;

        const snapshot = newsProvider.getSnapshot();
        setData(result);
        setLoading(false);
        setError(snapshot.error ?? null);

        if (snapshot.error) {
          setDataSource(result.length > 0 ? "cached" : "error");
        } else {
          setDataSource(result.length > 0 ? "live" : "empty");
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
      intervalId = setInterval(poll, POLL_INTERVAL);
    } else {
      poll(true);
      intervalId = setInterval(poll, POLL_INTERVAL);
    }

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return { data, loading, error, dataSource };
}
