import { useMemo } from "react";
import { Domain } from "@shared/domain/identity";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import { pointTypeForSource } from "@/workers/data/sources/registry";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import {
  QUERYABLE_SOURCE_IDS,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import type { PointUiQuery } from "@/workers/data/uiQuery";

const FACET_QUERY: PointUiQuery = {
  kind: "facet",
  limit: POINT_UI_QUERY_POLICY.facetValueLimit,
};

function countQuery(
  filters: Readonly<Record<string, unknown>>,
  source: QueryableSourceId,
): PointUiQuery | null {
  const filter = filters[pointTypeForSource(source)];
  return filter == null ? null : { kind: "count", filter };
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
  const queries = useMemo(
    (): Readonly<Record<QueryableSourceId, PointUiQuery | null>> => ({
      aircraft: countQuery(filters, Domain.Aircraft),
      cycloneWarnings: null,
      cyclones: countQuery(filters, Domain.Cyclones),
      earthquake: countQuery(filters, Domain.Earthquake),
      events: countQuery(filters, Domain.Events),
      fire: countQuery(filters, Domain.Fire),
      ships: countQuery(filters, Domain.Ships),
      weather: countQuery(filters, Domain.Weather),
    }),
    [filters],
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
    const counts: Record<string, number> = {};
    for (const source of QUERYABLE_SOURCE_IDS) {
      const result = results[source];
      counts[pointTypeForSource(source)] =
        result?.kind === "count" ? result.total : 0;
    }
    return counts;
  }, [
    results.aircraft,
    results.cyclones,
    results.earthquake,
    results.events,
    results.fire,
    results.ships,
    results.weather,
  ]);
}

/** Origin countries present in the current aircraft set, most common first. */
export function useAvailableCountries(): string[] {
  const result = useSourceQuery(Domain.Aircraft, FACET_QUERY);
  return useMemo(
    () => (result?.kind === "facet" ? [...result.values] : []),
    [result],
  );
}
