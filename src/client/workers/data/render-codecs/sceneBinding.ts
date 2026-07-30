import type {
  DatasetEntity,
  DatasetPatch,
} from "@/workers/data/datasetStore";
import type {
  SceneSourceCommandBody,
} from "@/workers/render/sceneProtocol";
import { ScenePatchCodec } from "./sceneCodec";

export type SceneCommandPublisher = (
  command: SceneSourceCommandBody,
) => void;

export class SceneBinding<TEntity extends DatasetEntity> {
  private readonly codec: ScenePatchCodec<TEntity>;
  private readonly publishScene: SceneCommandPublisher;

  constructor(
    codec: ScenePatchCodec<TEntity>,
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
