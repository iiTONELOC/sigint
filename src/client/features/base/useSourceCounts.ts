import { useMemo } from "react";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import { SOURCE_POINT_TYPES } from "@/features/base/useSourceTables";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import type { QueryableSourceId } from "@/workers/data/queryableSources";
import type { PointUiQuery } from "@/workers/data/uiQuery";

const COUNT_SOURCES = [
  "aircraft",
  "cyclones",
  "earthquake",
  "events",
  "fire",
  "ships",
  "weather",
] as const satisfies readonly QueryableSourceId[];

const FACET_QUERY: PointUiQuery = {
  kind: "facet",
  limit: POINT_UI_QUERY_POLICY.facetValueLimit,
};

function countQuery(
  filters: Readonly<Record<string, unknown>>,
  source: QueryableSourceId,
): PointUiQuery | null {
  const filter = filters[SOURCE_POINT_TYPES[source]];
  return filter == null ? null : { kind: "count", filter };
}

/**
 * How many points of each type survive that type's filter, counted in the
 * DataWorker. Keyed by point type, because that is what the layer chips and
 * the header read. A source with no filter set counts zero, which is the
 * behaviour the single-array walk had.
 */
export function useSourceCounts(
  filters: Readonly<Record<string, unknown>>,
): Record<string, number> {
  const queries = useMemo(
    (): Readonly<Record<QueryableSourceId, PointUiQuery | null>> => ({
      aircraft: countQuery(filters, "aircraft"),
      cyclones: countQuery(filters, "cyclones"),
      earthquake: countQuery(filters, "earthquake"),
      events: countQuery(filters, "events"),
      fire: countQuery(filters, "fire"),
      ships: countQuery(filters, "ships"),
      weather: countQuery(filters, "weather"),
    }),
    [filters],
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
    const counts: Record<string, number> = {};
    for (const source of COUNT_SOURCES) {
      const result = results[source];
      counts[SOURCE_POINT_TYPES[source]] =
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
  const result = useSourceQuery("aircraft", FACET_QUERY);
  return useMemo(
    () => (result?.kind === "facet" ? [...result.values] : []),
    [result],
  );
}
