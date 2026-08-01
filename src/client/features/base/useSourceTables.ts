import { useMemo } from "react";
import { Domain } from "@shared/domain/identity";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import { pointTypeForSource } from "@/workers/data/sources/registry";
import {
  QUERYABLE_SOURCE_IDS,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import {
  PointUiQueryKind,
  type PointUiQuery,
  type TableSortDirectionValue,
  type TableSortKeyValue,
} from "@/workers/data/uiQuery";

export type SourceTableOptions = Readonly<{
  sortKey: TableSortKeyValue;
  sortDirection: TableSortDirectionValue;
  limit: number;
  /** Restrict to one point type, or null for every type. */
  pointType: DataType | null;
  /** Per-source threshold; sources absent from the record use zero. */
  minValues?: Partial<Record<QueryableSourceId, number>>;
  /** Sources the caller has switched off. */
  disabled?: Partial<Record<QueryableSourceId, boolean>>;
}>;

export type SourceTable = Readonly<{
  /** One sorted prefix per source, ready to merge. */
  prefixes: readonly (readonly DataPoint[])[];
  totals: Readonly<Partial<Record<DataType, number>>>;
  itemCount: number;
}>;

function tableQuery(
  options: SourceTableOptions,
  source: QueryableSourceId,
): PointUiQuery | null {
  if (options.disabled?.[source]) return null;
  return {
    kind: PointUiQueryKind.Table,
    minValue: options.minValues?.[source] ?? 0,
    sortKey: options.sortKey,
    sortDirection: options.sortDirection,
    offset: 0,
    limit: options.limit,
  };
}

/**
 * One bounded table page per source, run in the DataWorker. Replaces
 * filtering and sorting a single main-thread array of every record.
 */
export function useSourceTables(options: SourceTableOptions): SourceTable {
  const queries = useMemo(
    (): Readonly<Record<QueryableSourceId, PointUiQuery | null>> => ({
      aircraft: tableQuery(options, Domain.Aircraft),
      // Watch and warning areas are a render layer, not a table row.
      cycloneWarnings: null,
      cyclones: tableQuery(options, Domain.Cyclones),
      earthquake: tableQuery(options, Domain.Earthquake),
      events: tableQuery(options, Domain.Events),
      fire: tableQuery(options, Domain.Fire),
      ships: tableQuery(options, Domain.Ships),
      weather: tableQuery(options, Domain.Weather),
    }),
    [
      options.sortKey,
      options.sortDirection,
      options.limit,
      options.minValues,
      options.disabled,
    ],
  );

  const results = {
    aircraft: useSourceQuery(Domain.Aircraft, queries.aircraft),
    cycloneWarnings: useSourceQuery(
      Domain.CycloneWarnings,
      queries.cycloneWarnings,
    ),
    cyclones: useSourceQuery(Domain.Cyclones, queries.cyclones),
    earthquake: useSourceQuery(Domain.Earthquake, queries.earthquake),
    events: useSourceQuery(Domain.Events, queries.events),
    fire: useSourceQuery(Domain.Fire, queries.fire),
    ships: useSourceQuery(Domain.Ships, queries.ships),
    weather: useSourceQuery(Domain.Weather, queries.weather),
  };

  return useMemo(() => {
    const prefixes: (readonly DataPoint[])[] = [];
    const totals: Partial<Record<DataType, number>> = {};
    let itemCount = 0;

    for (const id of QUERYABLE_SOURCE_IDS) {
      const result = results[id];
      if (result?.kind !== PointUiQueryKind.Table) continue;
      const pointType = pointTypeForSource(id);
      totals[pointType] = result.total;
      if (options.pointType !== null && options.pointType !== pointType) {
        continue;
      }
      prefixes.push(result.items);
      itemCount += result.total;
    }
    return { prefixes, totals, itemCount };
  }, [
    results.aircraft,
    results.cyclones,
    results.earthquake,
    results.events,
    results.fire,
    results.ships,
    results.weather,
    options.pointType,
  ]);
}
