import type { DataType } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { SourceCompletenessPolicy } from "@shared/domain/sourcePolicy";

export { SourceCompletenessPolicy };
import { WEATHER_SOURCE_POLICY } from "@/features/environmental/weather/source";
import { CYCLONE_WARNING_SOURCE_POLICY } from "@/features/environmental/cyclones/warningSource";
import {
  CACHE_KEYS,
  type CacheKey,
} from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { EVENT_SOURCE_POLICY } from "@/workers/data/sources/events";
import {
  RENDER_SOURCE_IDS,
  type RenderSourceId,
} from "@/workers/data/sourceIds";

export type PointSourcePolicy = Readonly<{
  pointType: DataType;
  cacheKey: CacheKey;
  pollIntervalMs: number;
  completeness: SourceCompletenessPolicy;
  emptyResultIsComplete: boolean;
}>;

export type PointSourceDefinition = PointSourcePolicy & Readonly<{
  id: RenderSourceId;
}>;

const POINT_SOURCE_POLICIES: Readonly<
  Record<RenderSourceId, PointSourcePolicy>
> = {
  [Domain.Aircraft]: {
    pointType: Domain.Aircraft,
    cacheKey: CACHE_KEYS.aircraft,
    pollIntervalMs: POLL_INTERVALS.aircraft,
    completeness: SourceCompletenessPolicy.Dynamic,
    emptyResultIsComplete: true,
  },
  [Domain.Ships]: {
    pointType: Domain.Ships,
    cacheKey: CACHE_KEYS.ships,
    pollIntervalMs: POLL_INTERVALS.ships,
    completeness: SourceCompletenessPolicy.Complete,
    emptyResultIsComplete: false,
  },
  [Domain.Events]: {
    pointType: Domain.Events,
    cacheKey: EVENT_SOURCE_POLICY.cacheKey,
    pollIntervalMs: EVENT_SOURCE_POLICY.pollIntervalMs,
    completeness: EVENT_SOURCE_POLICY.completeness,
    emptyResultIsComplete: EVENT_SOURCE_POLICY.emptyResultIsComplete,
  },
  [Domain.Weather]: {
    pointType: Domain.Weather,
    cacheKey: WEATHER_SOURCE_POLICY.cacheKey,
    pollIntervalMs: WEATHER_SOURCE_POLICY.pollIntervalMs,
    completeness: WEATHER_SOURCE_POLICY.completeness,
    emptyResultIsComplete: WEATHER_SOURCE_POLICY.emptyResultIsComplete,
  },
  [Domain.Cyclones]: {
    pointType: Domain.Cyclones,
    cacheKey: CACHE_KEYS.cyclones,
    pollIntervalMs: POLL_INTERVALS.cyclones,
    completeness: SourceCompletenessPolicy.Complete,
    emptyResultIsComplete: true,
  },
  [Domain.CycloneWarnings]: {
    pointType: Domain.CyclonesWarning,
    cacheKey: CYCLONE_WARNING_SOURCE_POLICY.cacheKey,
    pollIntervalMs: CYCLONE_WARNING_SOURCE_POLICY.pollIntervalMs,
    completeness: CYCLONE_WARNING_SOURCE_POLICY.completeness,
    emptyResultIsComplete: CYCLONE_WARNING_SOURCE_POLICY.emptyResultIsComplete,
  },
  [Domain.Earthquake]: {
    pointType: Domain.Quakes,
    cacheKey: CACHE_KEYS.earthquake,
    pollIntervalMs: POLL_INTERVALS.earthquakes,
    completeness: SourceCompletenessPolicy.Complete,
    emptyResultIsComplete: true,
  },
  [Domain.Fire]: {
    pointType: Domain.Fires,
    cacheKey: CACHE_KEYS.fires,
    pollIntervalMs: POLL_INTERVALS.fires,
    completeness: SourceCompletenessPolicy.Complete,
    emptyResultIsComplete: true,
  },
};

export const POINT_SOURCE_DEFINITIONS = RENDER_SOURCE_IDS.map((id) => ({
  id,
  ...POINT_SOURCE_POLICIES[id],
})) satisfies readonly PointSourceDefinition[];

/**
 * The one owner of a source's id, cache key and poll cadence. The DataWorker
 * runtime, the React provider and the poll hook all read it from here so a
 * source is never spelled out twice.
 */
export function getPointSourceDefinition<TId extends RenderSourceId>(
  id: TId,
): PointSourcePolicy & Readonly<{ id: TId }> {
  const policy: PointSourcePolicy = POINT_SOURCE_POLICIES[id];
  return { ...policy, id };
}

const POINT_TYPE_BY_SOURCE: ReadonlyMap<RenderSourceId, DataType> = new Map(
  POINT_SOURCE_DEFINITIONS.map((definition) => [
    definition.id,
    definition.pointType,
  ]),
);

/** The point type a source publishes. */
export function pointTypeForSource(source: RenderSourceId): DataType {
  return POINT_TYPE_BY_SOURCE.get(source) ?? Domain.Aircraft;
}

const SOURCE_BY_POINT_TYPE: ReadonlyMap<DataType, RenderSourceId> = new Map(
  POINT_SOURCE_DEFINITIONS.map((definition) => [
    definition.pointType,
    definition.id,
  ]),
);

/**
 * Which source answers for a rendered point type. The inverse of pointType,
 * derived from the same table, so the hit-test path cannot drift from it.
 */
export function sourceForPointType(
  pointType: string | null,
): RenderSourceId | null {
  if (pointType === null) return null;
  return SOURCE_BY_POINT_TYPE.get(pointType as DataType) ?? null;
}
