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
import { MovingSceneAttribute } from "@shared/scene";
import { motionAttributeOffsetForSource } from "@shared/domain/pointSource";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "./sceneBinding";
import { ScenePatchCodec } from "./sceneCodec";
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

export type MovingSceneSpec<
  TEntity extends DatasetEntity & PositionedRecord,
> = Readonly<{
  source: TrackSource;
  trails: MovingSceneTrailReader;
  motion: (entity: TEntity) => MovingSceneMotion;
  writeAttributes: (
    entity: TEntity,
    target: Float32Array<ArrayBuffer>,
    offset: number,
  ) => void;
  writeStringAttributes?: (
    entity: TEntity,
    target: Uint32Array<ArrayBuffer>,
    offset: number,
    intern: (value: string) => number,
  ) => void;
}>;

/** One scene record per moving entity, positioned by its last trail point. */
export function movingSceneBinding<
  TEntity extends DatasetEntity & PositionedRecord,
>(
  publishScene: SceneCommandPublisher,
  spec: MovingSceneSpec<TEntity>,
): SceneBinding<TEntity, MovingSceneRecord<TEntity>> {
  const motionOffset = motionAttributeOffsetForSource(spec.source);
  const writeStringAttributes = spec.writeStringAttributes;
  return new SceneBinding(
    new ScenePatchCodec<TEntity, MovingSceneRecord<TEntity>>({
      source: spec.source,
      records: (entity) => movingSceneRecords(spec.source, spec.trails, entity),
      position: movingScenePosition,
      motionPosition: movingSceneMotionPosition,
      timestamp: movingSceneTimestamp,
      writeAttributes: (record, target, offset) => {
        spec.writeAttributes(record.entity, target, offset);
        writeMovingSceneAttributes(
          record,
          target,
          offset + motionOffset,
          spec.motion(record.entity),
        );
      },
      ...(writeStringAttributes
        ? {
            writeStringAttributes: (record, target, offset, intern) => {
              writeStringAttributes(record.entity, target, offset, intern);
            },
          }
        : {}),
    }),
    publishScene,
  );
}
