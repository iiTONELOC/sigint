import { useMemo } from "react";
import { Domain } from "@shared/domain/identity";
import {
  useSourceQueries,
  useSourceQuery,
} from "@/features/base/useSourceQuery";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import {
  QUERYABLE_SOURCE_IDS,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import {
  PointUiQueryKind,
  type PointUiQuery,
} from "@/workers/data/uiQuery";

const FACET_QUERY: PointUiQuery = {
  kind: PointUiQueryKind.Facet,
  limit: POINT_UI_QUERY_POLICY.facetValueLimit,
};

function countQuery(
  filters: Readonly<Record<string, unknown>>,
  source: QueryableSourceId,
): PointUiQuery | null {
  if (source === Domain.CycloneWarnings) return null;
  const filter = filters[getPointSourceDefinition(source).pointType];
  return filter == null
    ? null
    : { kind: PointUiQueryKind.Count, filter };
}

/**
 * How many points of each type survive that type's filter, counted in the
 * DataWorker. Keyed by point type, because that is what the layer chips and
 * the header read. A source with no filter set counts zero, which is the
 * behavior the single-array walk had.
 */
export function useSourceCounts(
  filters: Readonly<Record<string, unknown>>,
): Record<string, number> {
  const results = useSourceQueries(
    (source) => countQuery(filters, source),
  );

  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const source of QUERYABLE_SOURCE_IDS) {
      const result = results[source];
      counts[getPointSourceDefinition(source).pointType] =
        result?.kind === PointUiQueryKind.Count ? result.total : 0;
    }
    return counts;
  }, [results]);
}

/** Origin countries present in the current aircraft set, most common first. */
export function useAvailableCountries(): string[] {
  const result = useSourceQuery(Domain.Aircraft, FACET_QUERY);
  return useMemo(
    () =>
      result?.kind === PointUiQueryKind.Facet
        ? [...result.values]
        : [],
    [result],
  );
}
