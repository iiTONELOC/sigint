import { useMemo } from "react";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import type { QueryableSourceId } from "@/workers/data/queryableSources";
import type {
  PointUiQuery,
  TableSortDirection,
  TableSortKey,
} from "@/workers/data/uiQuery";

const TABLE_SOURCES = [
  "aircraft",
  "cyclones",
  "earthquake",
  "events",
  "fire",
  "ships",
  "weather",
] as const satisfies readonly QueryableSourceId[];

/** Point type each source contributes, so callers can filter and count. */
export const SOURCE_POINT_TYPES: Readonly<Record<QueryableSourceId, DataType>> =
  {
    aircraft: getPointSourceDefinition("aircraft").pointType,
    cyclones: getPointSourceDefinition("cyclones").pointType,
    earthquake: getPointSourceDefinition("earthquake").pointType,
    events: getPointSourceDefinition("events").pointType,
    fire: getPointSourceDefinition("fire").pointType,
    ships: getPointSourceDefinition("ships").pointType,
    weather: getPointSourceDefinition("weather").pointType,
  };

const POINT_TYPE_SOURCES = new Map<DataType, QueryableSourceId>(
  Object.entries(SOURCE_POINT_TYPES).map(([source, pointType]) => [
    pointType,
    source as QueryableSourceId,
  ]),
);

/** Which source owns a point type, for callers holding a point rather than
 *  a source id. Null for a type no source publishes. */
export function sourceForPointType(
  pointType: DataType,
): QueryableSourceId | null {
  return POINT_TYPE_SOURCES.get(pointType) ?? null;
}

export type SourceTableOptions = Readonly<{
  sortKey: TableSortKey;
  sortDirection: TableSortDirection;
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
  totals: Readonly<Record<string, number>>;
  itemCount: number;
}>;

function tableQuery(
  options: SourceTableOptions,
  source: QueryableSourceId,
): PointUiQuery | null {
  if (options.disabled?.[source]) return null;
  return {
    kind: "table",
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
      aircraft: tableQuery(options, "aircraft"),
      cyclones: tableQuery(options, "cyclones"),
      earthquake: tableQuery(options, "earthquake"),
      events: tableQuery(options, "events"),
      fire: tableQuery(options, "fire"),
      ships: tableQuery(options, "ships"),
      weather: tableQuery(options, "weather"),
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
    aircraft: useSourceQuery("aircraft", queries.aircraft),
    cyclones: useSourceQuery("cyclones", queries.cyclones),
    earthquake: useSourceQuery("earthquake", queries.earthquake),
    events: useSourceQuery("events", queries.events),
    fire: useSourceQuery("fire", queries.fire),
    ships: useSourceQuery("ships", queries.ships),
    weather: useSourceQuery("weather", queries.weather),
  };

  return useMemo(() => {
    const prefixes: (readonly DataPoint[])[] = [];
    const totals: Record<string, number> = {};
    let itemCount = 0;

    for (const id of TABLE_SOURCES) {
      const result = results[id];
      if (result?.kind !== "table") continue;
      const pointType = SOURCE_POINT_TYPES[id];
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
