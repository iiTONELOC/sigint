import { useMemo } from "react";
import { Domain } from "@shared/domain/identity";
import { useSourceQueries } from "@/features/base/useSourceQuery";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  mergeTickerPages,
  TICKER_ITEM_LIMIT,
  type TickerPage,
} from "@/lib/ui/tickerFeed";
import type { QueryableSourceId } from "@/workers/data/queryableSources";
import {
  PointUiQueryKind,
  type PointUiQuery,
} from "@/workers/data/uiQuery";

// Feed order across sources. Aircraft and ships lead because they change every
// poll; the slower sources trail so they still surface once per pass.
const TICKER_SOURCES: readonly QueryableSourceId[] = [
  Domain.Aircraft,
  Domain.Ships,
  Domain.Events,
  Domain.Earthquake,
  Domain.Fire,
  Domain.Weather,
  Domain.Cyclones,
];

const TICKER_QUERY: PointUiQuery = {
  kind: PointUiQueryKind.Ticker,
  limit: TICKER_ITEM_LIMIT,
};

const EMPTY_PAGE: TickerPage = { items: [], priorityCount: 0 };

function tickerQuery(source: QueryableSourceId): PointUiQuery | null {
  return TICKER_SOURCES.includes(source) ? TICKER_QUERY : null;
}

/**
 * The ticker feed, assembled from one bounded page per source. Each page is
 * narrowed, ordered and capped in the DataWorker, so the main thread only
 * merges at most seven short arrays.
 */
export function useSourceTicker(): DataPoint[] {
  const results = useSourceQueries(tickerQuery);

  return useMemo(
    () =>
      mergeTickerPages(
        TICKER_SOURCES.map((source) => {
          const result = results[source];
          return result?.kind === PointUiQueryKind.Ticker ? result : EMPTY_PAGE;
        }),
      ),
    [results],
  );
}
