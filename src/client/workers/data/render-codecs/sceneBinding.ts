import type {
  DatasetEntity,
  DatasetPatch,
} from "@/workers/data/datasetStore";
import {
  recordPosition,
  type PositionedRecord,
} from "@/workers/data/source-model/position";
import type {
  SceneSourceCommandBody,
} from "@/workers/render/sceneProtocol";
import type { RenderSourceId } from "@shared/source";
import {
  ScenePatchCodec,
  sceneTimestamp,
  singleSceneRecord,
  type SceneGeometryInput,
  type SceneTimestampedEntity,
} from "./sceneCodec";

export type SceneCommandPublisher = (
  command: SceneSourceCommandBody,
) => void;

export class SceneBinding<
  TEntity extends DatasetEntity,
  TRecord extends DatasetEntity = TEntity,
> {
  private readonly codec: ScenePatchCodec<TEntity, TRecord>;
  private readonly publishScene: SceneCommandPublisher;

  constructor(
    codec: ScenePatchCodec<TEntity, TRecord>,
    publishScene: SceneCommandPublisher,
  ) {
    this.codec = codec;
    this.publishScene = publishScene;
  }

  publish(patch: DatasetPatch<TEntity>): void {
    this.publishScene(this.codec.encode(patch));
  }

  publishSearch(
    entityIds: readonly string[],
    searchRevision: number,
    active: boolean,
  ): void {
    this.publishScene(
      this.codec.encodeSearch(entityIds, searchRevision, active),
    );
  }
}

export type PointSceneRecord = DatasetEntity &
  PositionedRecord &
  SceneTimestampedEntity;

export type PointSceneSpec<TRecord extends PointSceneRecord> = Readonly<{
  source: RenderSourceId;
  geometry?: (record: TRecord) => SceneGeometryInput | null;
  writeAttributes: (
    record: TRecord,
    target: Float32Array<ArrayBuffer>,
    offset: number,
  ) => void;
}>;

/** One scene record per entity, positioned and timestamped by the record. */
export function pointSceneBinding<TRecord extends PointSceneRecord>(
  publishScene: SceneCommandPublisher,
  spec: PointSceneSpec<TRecord>,
): SceneBinding<TRecord> {
  return new SceneBinding(
    new ScenePatchCodec<TRecord>({
      ...spec,
      records: singleSceneRecord,
      position: recordPosition,
      timestamp: sceneTimestamp,
    }),
    publishScene,
  );
}
