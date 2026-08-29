import { CacheKey } from "./cache";
import { Domain } from "./identity";
import type { PointType } from "./pointType";
import {
  RENDER_SOURCE_IDS,
  type RenderSourceId,
} from "../source";
import {
  CYCLONE_SCENE_ATTRIBUTE_COUNT,
  AIRCRAFT_MOTION_ATTRIBUTE_OFFSET,
  AIRCRAFT_SCENE_ATTRIBUTE_COUNT,
  AIRCRAFT_SCENE_STRING_ATTRIBUTE_COUNT,
  EARTHQUAKE_SCENE_ATTRIBUTE_COUNT,
  FIRE_SCENE_ATTRIBUTE_COUNT,
  SHIP_MOTION_ATTRIBUTE_OFFSET,
  SHIP_SCENE_ATTRIBUTE_COUNT,
  WEATHER_SCENE_ATTRIBUTE_COUNT,
} from "../scene";
import { MS_PER_MINUTE } from "../time";

enum PointSourcePollInterval {
  FastMs = 15_000,
  FiveMinutesMs = 300_000,
  SevenMinutesMs = 420_000,
  TenMinutesMs = 600_000,
  FifteenMinutesMs = 900_000,
  TwentyFiveMinutesMs = 1_500_000,
}

export type PointSourceDefinition<
  TId extends RenderSourceId = RenderSourceId,
> = Readonly<{
  id: TId;
  pointType: PointType;
  interactionPointTypes?: readonly PointType[];
  cacheKey: CacheKey;
  pollIntervalMs: number;
  retryIntervalMs?: number;
  sceneSchema: Readonly<{
    attributeStride: number;
    stringAttributeStride: number;
    motionAttributeOffset?: number;
  }>;
}>;

type PointSourcePolicy = Omit<PointSourceDefinition, "id">;

const POINT_SOURCE_POLICIES = {
  [Domain.Aircraft]: {
    pointType: Domain.Aircraft,
    cacheKey: CacheKey.Aircraft,
    pollIntervalMs: PointSourcePollInterval.FastMs,
    sceneSchema: {
      attributeStride: AIRCRAFT_SCENE_ATTRIBUTE_COUNT,
      stringAttributeStride: AIRCRAFT_SCENE_STRING_ATTRIBUTE_COUNT,
      motionAttributeOffset: AIRCRAFT_MOTION_ATTRIBUTE_OFFSET,
    },
  },
  [Domain.Ships]: {
    pointType: Domain.Ships,
    cacheKey: CacheKey.Ships,
    pollIntervalMs: PointSourcePollInterval.FastMs,
    sceneSchema: {
      attributeStride: SHIP_SCENE_ATTRIBUTE_COUNT,
      stringAttributeStride: 0,
      motionAttributeOffset: SHIP_MOTION_ATTRIBUTE_OFFSET,
    },
  },
  [Domain.Events]: {
    pointType: Domain.Events,
    cacheKey: CacheKey.Events,
    pollIntervalMs: PointSourcePollInterval.FifteenMinutesMs,
    sceneSchema: {
      attributeStride: 1,
      stringAttributeStride: 0,
    },
  },
  [Domain.Weather]: {
    pointType: Domain.Weather,
    cacheKey: CacheKey.Weather,
    pollIntervalMs: PointSourcePollInterval.FiveMinutesMs,
    sceneSchema: {
      attributeStride: WEATHER_SCENE_ATTRIBUTE_COUNT,
      stringAttributeStride: 0,
    },
  },
  [Domain.Cyclones]: {
    pointType: Domain.Cyclones,
    interactionPointTypes: [Domain.CyclonesForecast],
    cacheKey: CacheKey.Cyclones,
    pollIntervalMs: PointSourcePollInterval.TwentyFiveMinutesMs,
    sceneSchema: {
      attributeStride: CYCLONE_SCENE_ATTRIBUTE_COUNT,
      stringAttributeStride: 1,
    },
  },
  [Domain.CycloneWarnings]: {
    pointType: Domain.CyclonesWarning,
    cacheKey: CacheKey.CycloneWarnings,
    pollIntervalMs: PointSourcePollInterval.FiveMinutesMs,
    sceneSchema: {
      attributeStride: 1,
      stringAttributeStride: 0,
    },
  },
  [Domain.Earthquake]: {
    pointType: Domain.Quakes,
    cacheKey: CacheKey.Earthquake,
    pollIntervalMs: PointSourcePollInterval.SevenMinutesMs,
    retryIntervalMs: MS_PER_MINUTE,
    sceneSchema: {
      attributeStride: EARTHQUAKE_SCENE_ATTRIBUTE_COUNT,
      stringAttributeStride: 0,
    },
  },
  [Domain.Fire]: {
    pointType: Domain.Fires,
    cacheKey: CacheKey.Fires,
    pollIntervalMs: PointSourcePollInterval.TenMinutesMs,
    retryIntervalMs: MS_PER_MINUTE,
    sceneSchema: {
      attributeStride: FIRE_SCENE_ATTRIBUTE_COUNT,
      stringAttributeStride: 0,
    },
  },
} satisfies Readonly<Record<RenderSourceId, PointSourcePolicy>>;

export function getPointSourceDefinition<TId extends RenderSourceId>(
  id: TId,
): PointSourceDefinition<TId> {
  const policy: PointSourcePolicy = POINT_SOURCE_POLICIES[id];
  return { ...policy, id };
}

export function sceneSchemaMatches(
  source: RenderSourceId,
  attributeStride: number,
  stringAttributeStride: number,
): boolean {
  const schema = POINT_SOURCE_POLICIES[source].sceneSchema;
  return (
    attributeStride === schema.attributeStride &&
    stringAttributeStride === schema.stringAttributeStride
  );
}

export function motionAttributeOffsetForSource(
  source: Domain.Aircraft | Domain.Ships,
): number {
  return POINT_SOURCE_POLICIES[source].sceneSchema.motionAttributeOffset;
}

const SOURCE_BY_POINT_TYPE: ReadonlyMap<PointType, RenderSourceId> = new Map(
  RENDER_SOURCE_IDS.flatMap((source) => {
    const policy: PointSourcePolicy = POINT_SOURCE_POLICIES[source];
    return [
      policy.pointType,
      ...(policy.interactionPointTypes ?? []),
    ].map((pointType) => [pointType, source]);
  }),
);

export function sourceForPointType(
  pointType: string | null,
): RenderSourceId | null {
  if (pointType === null) return null;
  return SOURCE_BY_POINT_TYPE.get(pointType as PointType) ?? null;
}
