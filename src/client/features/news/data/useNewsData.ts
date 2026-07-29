// ── useNewsData ─────────────────────────────────────────────────────
// Fully async — no sync hydrate call during render.
// getData() handles hydration internally. Starts empty, data trickles in.

import { useEffect, useState } from "react";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { newsProvider, type NewsArticle } from "./newsProvider";

type UseNewsDataResult = {
  data: NewsArticle[];
  loading: boolean;
  error: Error | null;
  dataSource: SourceStatus;
};

function statusFor(
  articleCount: number,
  error: Error | null | undefined,
): SourceStatus {
  if (error) {
    return articleCount > 0 ? SourceStatus.Cached : SourceStatus.Error;
  }
  return articleCount > 0 ? SourceStatus.Live : SourceStatus.Empty;
}

export function useNewsData(): UseNewsDataResult {
  const [data, setData] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dataSource, setDataSource] = useState<SourceStatus>(
    SourceStatus.Loading,
  );

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Subscribe to background refresh completions (boot sequence + intervals)
    newsProvider.onChange(() => {
      if (!isMounted) return;
      const snapshot = newsProvider.getSnapshot();
      setData([...snapshot.items]);
      setLoading(false);
      setError(snapshot.error ?? null);
      setDataSource(statusFor(snapshot.items.length, snapshot.error));
    });

    // Sync read: if provider already has data, show it
    const snap = newsProvider.getSnapshot();
    if (snap.items.length > 0) {
      setData([...snap.items]);
      setLoading(false);
      setError(snap.error ?? null);
      setDataSource(statusFor(snap.items.length, snap.error));
    }

    // Poll interval — subsequent refreshes after boot.
    intervalId = setInterval(async () => {
      try {
        const result = await newsProvider.refresh();
        if (!isMounted) return;
        const snapshot = newsProvider.getSnapshot();
        setData([...result]);
        setLoading(false);
        setError(snapshot.error ?? null);
        setDataSource(statusFor(result.length, snapshot.error));
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setLoading(false);
        setDataSource(SourceStatus.Error);
      }
    }, POLL_INTERVALS.news);

    return () => {
      isMounted = false;
      newsProvider.onChange(null);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return { data, loading, error, dataSource };
}
