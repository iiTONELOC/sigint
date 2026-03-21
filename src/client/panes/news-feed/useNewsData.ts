// ── useNewsData ─────────────────────────────────────────────────────
// Fully async — no sync hydrate call during render.
// getData() handles hydration internally. Starts empty, data trickles in.

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
  const [data, setData] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<NewsDataSource>("loading");

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    // Subscribe to background refresh completions
    newsProvider.onChange(() => {
      if (!isMounted) return;
      const snapshot = newsProvider.getSnapshot();
      setData([...snapshot.items]);
      setLoading(false);
      setError(snapshot.error ?? null);
      if (snapshot.error) {
        setDataSource(snapshot.items.length > 0 ? "cached" : "error");
      } else {
        setDataSource(snapshot.items.length > 0 ? "live" : "empty");
      }
    });

    // Sync read: if provider was hydrated before mount, show data NOW
    const snap = newsProvider.getSnapshot();
    if (snap.items.length > 0) {
      setData([...snap.items]);
      setLoading(false);
      setError(snap.error ?? null);
      setDataSource(snap.error ? "cached" : "live");
    }

    // Async: getData triggers background refresh if stale
    newsProvider
      .getData(POLL_INTERVAL)
      .then((result) => {
        if (!isMounted) return;
        const snapshot = newsProvider.getSnapshot();
        setData([...result]);
        setLoading(false);
        setError(snapshot.error ?? null);
        if (snapshot.error) {
          setDataSource(result.length > 0 ? "cached" : "error");
        } else {
          setDataSource(result.length > 0 ? "live" : "empty");
        }
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
        const result = await newsProvider.refresh();
        if (!isMounted) return;
        const snapshot = newsProvider.getSnapshot();
        setData([...result]);
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
    }, POLL_INTERVAL);

    return () => {
      isMounted = false;
      newsProvider.onChange(null);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return { data, loading, error, dataSource };
}
