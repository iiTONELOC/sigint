import { useMemo } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import type { PointUiQuery } from "@/workers/data/uiQuery";

export type SourceSearch = Readonly<{
  /** Best matches across every source, already capped per source. */
  items: readonly DataPoint[];
  /** Matches across every source, not just the ones returned. */
  total: number;
  /** False until every source has answered for the current text. */
  ready: boolean;
}>;

const EMPTY: readonly DataPoint[] = [];

/** Searches every source in the DataWorker; nothing is scanned on the main thread. */
export function useSourceSearch(text: string | null): SourceSearch {
  const query = useMemo<PointUiQuery | null>(
    () => (text && text.length > 0 ? { kind: "search", text } : null),
    [text],
  );

  const results = {
    aircraft: useSourceQuery("aircraft", query),
    cyclones: useSourceQuery("cyclones", query),
    earthquake: useSourceQuery("earthquake", query),
    events: useSourceQuery("events", query),
    fire: useSourceQuery("fire", query),
    ships: useSourceQuery("ships", query),
    weather: useSourceQuery("weather", query),
  };

  return useMemo(() => {
    const answered = Object.values(results);
    if (!query) return { items: EMPTY, total: 0, ready: false };

    const items: DataPoint[] = [];
    let total = 0;
    let searched = 0;
    for (const result of answered) {
      if (result?.kind !== "search") continue;
      items.push(...result.items);
      total += result.total;
      searched++;
    }
    return { items, total, ready: searched === answered.length };
  }, [
    query,
    results.aircraft,
    results.cyclones,
    results.earthquake,
    results.events,
    results.fire,
    results.ships,
    results.weather,
  ]);
}
