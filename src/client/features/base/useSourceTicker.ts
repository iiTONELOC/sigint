import { useMemo } from "react";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  mergeTickerPages,
  TICKER_ITEM_LIMIT,
  type TickerPage,
} from "@/lib/ui/tickerFeed";
import type { QueryableSourceId } from "@/workers/data/queryableSources";
import type { PointUiQuery } from "@/workers/data/uiQuery";

// Feed order across sources. Aircraft and ships lead because they change every
// poll; the slower sources trail so they still surface once per pass.
const TICKER_SOURCES = [
  "aircraft",
  "ships",
  "events",
  "earthquake",
  "fire",
  "weather",
  "cyclones",
] as const satisfies readonly QueryableSourceId[];

const TICKER_QUERY: PointUiQuery = {
  kind: "ticker",
  limit: TICKER_ITEM_LIMIT,
};

const EMPTY_PAGE: TickerPage = { items: [], priorityCount: 0 };

/**
 * The ticker feed, assembled from one bounded page per source. Each page is
 * narrowed, ordered and capped in the DataWorker, so the main thread only
 * merges at most seven short arrays.
 */
export function useSourceTicker(): DataPoint[] {
  const results = {
    aircraft: useSourceQuery("aircraft", TICKER_QUERY),
    ships: useSourceQuery("ships", TICKER_QUERY),
    events: useSourceQuery("events", TICKER_QUERY),
    earthquake: useSourceQuery("earthquake", TICKER_QUERY),
    fire: useSourceQuery("fire", TICKER_QUERY),
    weather: useSourceQuery("weather", TICKER_QUERY),
    cyclones: useSourceQuery("cyclones", TICKER_QUERY),
  };

  return useMemo(
    () =>
      mergeTickerPages(
        TICKER_SOURCES.map((source) => {
          const result = results[source];
          return result?.kind === "ticker" ? result : EMPTY_PAGE;
        }),
      ),
    [
      results.aircraft,
      results.ships,
      results.events,
      results.earthquake,
      results.fire,
      results.weather,
      results.cyclones,
    ],
  );
}
