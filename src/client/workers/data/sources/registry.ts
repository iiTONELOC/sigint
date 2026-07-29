import type { DataPoint, DataType } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { SourceCompletenessPolicy } from "@shared/domain/sourcePolicy";

export { SourceCompletenessPolicy };
import {
  EARTHQUAKE_SOURCE_POLICY,
} from "@/features/environmental/earthquake/data/source";
import {
  FIRE_SOURCE_POLICY,
} from "@/features/environmental/fires/data/source";
import { WEATHER_SOURCE_POLICY } from "@/features/environmental/weather/source";
import { CYCLONE_WARNING_SOURCE_POLICY } from "@/features/environmental/cyclones/warningSource";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import {
  RENDER_SOURCE_IDS,
  type RenderSourceId,
} from "@/workers/data/sourceIds";

export type PointSourcePolicy = Readonly<{
  pointType: DataType;
  cacheKey: string;
  pollIntervalMs: number;
  completeness: SourceCompletenessPolicy;
  emptyResultIsComplete: boolean;
}>;

export type PointSourceDefinition = PointSourcePolicy & Readonly<{
  id: RenderSourceId;
}>;

const POINT_SOURCE_POLICIES = {
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
    cacheKey: CACHE_KEYS.events,
    pollIntervalMs: POLL_INTERVALS.events,
    completeness: SourceCompletenessPolicy.Partial,
    emptyResultIsComplete: false,
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
    cacheKey: EARTHQUAKE_SOURCE_POLICY.cacheKey,
    pollIntervalMs: EARTHQUAKE_SOURCE_POLICY.pollIntervalMs,
    completeness: SourceCompletenessPolicy.Complete,
    emptyResultIsComplete: true,
  },
  [Domain.Fire]: {
    pointType: Domain.Fires,
    cacheKey: FIRE_SOURCE_POLICY.cacheKey,
    pollIntervalMs: FIRE_SOURCE_POLICY.pollIntervalMs,
    completeness: SourceCompletenessPolicy.Complete,
    emptyResultIsComplete: true,
  },
} as const satisfies Readonly<Record<RenderSourceId, PointSourcePolicy>>;

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

export type PointSourceEntity = Extract<
  DataPoint,
  { type: (typeof POINT_SOURCE_DEFINITIONS)[number]["pointType"] }
>;

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
