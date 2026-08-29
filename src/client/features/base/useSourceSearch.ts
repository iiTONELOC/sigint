import { useMemo } from "react";
import { Domain } from "@shared/domain/identity";
import type { DataPoint } from "@/features/base/dataPoints";
import { useSourceQueries } from "@/features/base/useSourceQuery";
import type { QueryableSourceId } from "@/workers/data/queryableSources";
import {
  PointUiQueryKind,
  type PointUiQuery,
} from "@/workers/data/uiQuery";

export type SourceSearch = Readonly<{
  /** Best matches across every source, already capped per source. */
  items: readonly DataPoint[];
  /** Matches across every source, not just the ones returned. */
  total: number;
  /** False until every source has answered for the current text. */
  ready: boolean;
}>;

const EMPTY: readonly DataPoint[] = [];

const SEARCH_SOURCES: readonly QueryableSourceId[] = [
  Domain.Aircraft,
  Domain.Cyclones,
  Domain.Earthquake,
  Domain.Events,
  Domain.Fire,
  Domain.Ships,
  Domain.Weather,
];

/** Searches every source in the DataWorker; nothing is scanned on the main thread. */
export function useSourceSearch(text: string | null): SourceSearch {
  const query = useMemo<PointUiQuery | null>(
    () => (
      text && text.length > 0
        ? { kind: PointUiQueryKind.Search, text }
        : null
    ),
    [text],
  );
  const results = useSourceQueries(
    (source) => SEARCH_SOURCES.includes(source) ? query : null,
  );

  return useMemo(() => {
    if (!query) return { items: EMPTY, total: 0, ready: false };

    const items: DataPoint[] = [];
    let total = 0;
    let searched = 0;
    for (const source of SEARCH_SOURCES) {
      const result = results[source];
      if (result?.kind !== PointUiQueryKind.Search) continue;
      items.push(...result.items);
      total += result.total;
      searched++;
    }
    return { items, total, ready: searched === SEARCH_SOURCES.length };
  }, [query, results]);
}
