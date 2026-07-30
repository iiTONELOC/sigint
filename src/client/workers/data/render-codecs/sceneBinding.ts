import type {
  DatasetEntity,
  DatasetPatch,
} from "@/workers/data/datasetStore";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import { ScenePatchCodec } from "./sceneCodec";

export type ScenePatchPublisher = (patch: SceneSourcePatch) => void;

export class SceneBinding<TEntity extends DatasetEntity> {
  private readonly codec: ScenePatchCodec<TEntity>;
  private readonly publishScene: ScenePatchPublisher;

  constructor(
    codec: ScenePatchCodec<TEntity>,
    publishScene: ScenePatchPublisher,
  ) {
    this.codec = codec;
    this.publishScene = publishScene;
  }

  publish(patch: DatasetPatch<TEntity>): void {
    this.publishScene(this.codec.encode(patch));
  }
}
