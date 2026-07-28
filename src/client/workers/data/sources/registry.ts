import type { DataPoint, DataType } from "@/features/base/dataPoints";
import {
  EARTHQUAKE_SOURCE_POLICY,
} from "@/features/environmental/earthquake/data/source";
import {
  FIRE_SOURCE_POLICY,
} from "@/features/environmental/fires/data/source";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import {
  RENDER_SOURCE_IDS,
  type RenderSourceId,
} from "@/workers/data/sourceIds";

export type SourceCompletenessPolicy = "complete" | "partial" | "dynamic";

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
  aircraft: {
    pointType: "aircraft",
    cacheKey: CACHE_KEYS.aircraft,
    pollIntervalMs: POLL_INTERVALS.aircraft,
    completeness: "dynamic",
    emptyResultIsComplete: true,
  },
  ships: {
    pointType: "ships",
    cacheKey: CACHE_KEYS.ships,
    pollIntervalMs: POLL_INTERVALS.ships,
    completeness: "complete",
    emptyResultIsComplete: false,
  },
  events: {
    pointType: "events",
    cacheKey: CACHE_KEYS.events,
    pollIntervalMs: POLL_INTERVALS.events,
    completeness: "partial",
    emptyResultIsComplete: false,
  },
  weather: {
    pointType: "weather",
    cacheKey: CACHE_KEYS.weather,
    pollIntervalMs: POLL_INTERVALS.weather,
    completeness: "complete",
    emptyResultIsComplete: true,
  },
  cyclones: {
    pointType: "cyclones",
    cacheKey: CACHE_KEYS.cyclones,
    pollIntervalMs: POLL_INTERVALS.cyclones,
    completeness: "complete",
    emptyResultIsComplete: true,
  },
  earthquake: {
    pointType: "quakes",
    cacheKey: EARTHQUAKE_SOURCE_POLICY.cacheKey,
    pollIntervalMs: EARTHQUAKE_SOURCE_POLICY.pollIntervalMs,
    completeness: "complete",
    emptyResultIsComplete: true,
  },
  fire: {
    pointType: "fires",
    cacheKey: FIRE_SOURCE_POLICY.cacheKey,
    pollIntervalMs: FIRE_SOURCE_POLICY.pollIntervalMs,
    completeness: "complete",
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
