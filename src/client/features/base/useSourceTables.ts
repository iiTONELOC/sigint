import { useMemo } from "react";
import { Domain } from "@shared/domain/identity";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { useSourceQueries } from "@/features/base/useSourceQuery";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
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

type DisabledSources = Partial<Record<QueryableSourceId, boolean>>;

export type SourceTableOptions = Readonly<{
  sortKey: TableSortKeyValue;
  sortDirection: TableSortDirectionValue;
  limit: number;
  /** Restrict to one point type, or null for every type. */
  pointType: DataType | null;
  /** Per-source threshold; sources absent from the record use zero. */
  minValues?: Partial<Record<QueryableSourceId, number>>;
  /** Sources the caller has switched off. */
  disabled?: DisabledSources;
}>;

export type SourceTable = Readonly<{
  /** One sorted prefix per source, ready to merge. */
  prefixes: readonly (readonly DataPoint[])[];
  totals: Readonly<Partial<Record<DataType, number>>>;
  itemCount: number;
  ready: boolean;
}>;

function isTableSource(
  disabled: DisabledSources | undefined,
  source: QueryableSourceId,
): boolean {
  return source !== Domain.CycloneWarnings && !disabled?.[source];
}

function tableQuery(
  options: SourceTableOptions,
  source: QueryableSourceId,
): PointUiQuery | null {
  if (!isTableSource(options.disabled, source)) return null;
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
  const results = useSourceQueries(
    (source) => tableQuery(options, source),
  );

  return useMemo(() => {
    const prefixes: (readonly DataPoint[])[] = [];
    const totals: Partial<Record<DataType, number>> = {};
    let itemCount = 0;
    let ready = true;

    for (const id of QUERYABLE_SOURCE_IDS) {
      const pointType = getPointSourceDefinition(id).pointType;
      const wanted =
        options.pointType === null || options.pointType === pointType;
      const result = results[id];
      if (result?.kind !== PointUiQueryKind.Table) {
        if (wanted && isTableSource(options.disabled, id)) ready = false;
        continue;
      }
      totals[pointType] = result.total;
      if (!wanted) continue;
      prefixes.push(result.items);
      itemCount += result.total;
    }
    return { prefixes, totals, itemCount, ready };
  }, [results, options.pointType, options.disabled]);
}
