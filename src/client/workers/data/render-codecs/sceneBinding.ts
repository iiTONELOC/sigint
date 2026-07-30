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

export type SceneSearchBindingOptions = Readonly<{
  findEntityIds: (text: string) => readonly string[];
  publishSearch: (
    entityIds: readonly string[],
    revision: number,
    active: boolean,
  ) => void;
}>;

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

export class SceneSearchBinding {
  private readonly findEntityIds: (
    text: string,
  ) => readonly string[];
  private readonly publishSearch: (
    entityIds: readonly string[],
    revision: number,
    active: boolean,
  ) => void;
  private revision = 0;
  private text: string | null = null;

  constructor(options: SceneSearchBindingOptions) {
    this.findEntityIds = options.findEntityIds;
    this.publishSearch = options.publishSearch;
  }

  update(text: string | null): void {
    const normalized = text?.trim() ?? "";
    this.text = normalized.length > 0 ? normalized : null;
    this.revision += 1;
    this.publish();
  }

  refresh(): void {
    if (this.revision === 0) return;
    this.publish();
  }

  private publish(): void {
    const entityIds = this.text
      ? this.findEntityIds(this.text)
      : [];
    this.publishSearch(
      entityIds,
      this.revision,
      this.text !== null,
    );
  }
}
