import type {
  TrackSource,
  TrailPoint,
} from "@/lib/geo/trails/trailStore";
import type {
  DatasetEntity,
} from "@/workers/data/datasetStore";
import type {
  TrailRecorder,
} from "@/workers/data/trails/trailRecorder";
import {
  recordPosition,
  type PositionedRecord,
} from "@/workers/data/source-model/position";
import {
  MovingSceneAttribute,
} from "@/workers/render/scene/movingSceneSchema";
import type {
  GeoPoint,
} from "@shared/geo";

export type MovingSceneTrailReader = Pick<
  TrailRecorder,
  "lastPoint"
>;

export type MovingSceneRecord<
  TEntity extends DatasetEntity & PositionedRecord,
> = Readonly<{
    id: string;
    entity: TEntity;
    trailPoint: TrailPoint | null;
  }>;

export type MovingSceneMotion = Readonly<{
  directionDegrees: number;
  speedMetersPerSecond: number;
}>;

export function movingSceneRecords<
  TEntity extends DatasetEntity & PositionedRecord,
>(
  source: TrackSource,
  trails: MovingSceneTrailReader,
  entity: TEntity,
): readonly MovingSceneRecord<TEntity>[] {
  return [{
    id: entity.id,
    entity,
    trailPoint: trails.lastPoint(source, entity.id),
  }];
}

export function movingScenePosition<
  TEntity extends DatasetEntity & PositionedRecord,
>(record: MovingSceneRecord<TEntity>): GeoPoint {
  return recordPosition(record.entity);
}

export function movingSceneMotionPosition<
  TEntity extends DatasetEntity & PositionedRecord,
>(record: MovingSceneRecord<TEntity>): GeoPoint {
  const trailPoint = record.trailPoint;
  return trailPoint
    ? [trailPoint.lon, trailPoint.lat]
    : recordPosition(record.entity);
}

export function movingSceneTimestamp<
  TEntity extends DatasetEntity & PositionedRecord,
>(record: MovingSceneRecord<TEntity>): number {
  return record.trailPoint?.ts ?? 0;
}

export function writeMovingSceneAttributes<
  TEntity extends DatasetEntity & PositionedRecord,
>(
  record: MovingSceneRecord<TEntity>,
  target: Float32Array<ArrayBuffer>,
  offset: number,
  motion: MovingSceneMotion,
): void {
  const trailPoint = record.trailPoint;
  target[offset + MovingSceneAttribute.DirectionDegrees] =
    trailPoint ? motion.directionDegrees : 0;
  target[offset + MovingSceneAttribute.SpeedMetersPerSecond] =
    trailPoint ? motion.speedMetersPerSecond : 0;
}
