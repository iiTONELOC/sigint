import {
  DatasetPatchKind,
  type DatasetEntity,
  type DatasetPatch,
} from "@/workers/data/datasetStore";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import {
  SceneDataCommandType,
  type SceneSourcePatch,
  type SceneSourceSearch,
} from "@/workers/render/sceneProtocol";
import { geographicToUnitVector } from "@/lib/geo/unitSphere";
import {
  latitudeOf,
  longitudeOf,
  type GeoPoint,
} from "@shared/geo";
import { SceneHandleAllocator } from "./sceneHandleAllocator";

enum SceneComponentCount {
  Position = 2,
  UnitVector = 3,
}

enum ScenePositionOffset {
  Longitude = 0,
  Latitude = 1,
}

enum SceneUnitVectorOffset {
  X = 0,
  Y = 1,
  Z = 2,
}

export enum SceneCodecErrorKind {
  InvalidAttributeStride = "The scene attribute stride must be a nonnegative integer",
  InvalidPosition = "The scene position must contain finite coordinates",
  InvalidTimestamp = "The scene timestamp must be finite",
}

export class SceneCodecError extends Error {
  readonly kind: SceneCodecErrorKind;
  readonly sceneId: string | null;

  constructor(kind: SceneCodecErrorKind, sceneId: string | null = null) {
    super(kind);
    this.name = SceneCodecError.name;
    this.kind = kind;
    this.sceneId = sceneId;
  }
}

export type ScenePatchCodecOptions<
  TEntity extends DatasetEntity,
> = Readonly<{
  source: RenderSourceId;
  attributeStride: number;
  position: (entity: TEntity) => GeoPoint;
  timestamp: (entity: TEntity) => number;
  sceneId?: (entity: TEntity) => string;
  entityId?: (entity: TEntity) => string;
  writeAttributes: (
    entity: TEntity,
    target: Float32Array<ArrayBuffer>,
    offset: number,
  ) => void;
  stringAttributeStride?: number;
  writeStringAttributes?: (
    entity: TEntity,
    target: Uint32Array<ArrayBuffer>,
    offset: number,
    intern: (value: string) => number,
  ) => void;
}>;

type ScenePatchAllocation = Readonly<{
  handles: Uint32Array<ArrayBuffer>;
  sceneIds: string[];
  entityIds: string[];
  positions: Float64Array<ArrayBuffer>;
  unitVectors: Float32Array<ArrayBuffer>;
  timestamps: Float64Array<ArrayBuffer>;
  attributes: Float32Array<ArrayBuffer>;
  stringAttributes: Uint32Array<ArrayBuffer>;
}>;

function validateAttributeStride(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SceneCodecError(SceneCodecErrorKind.InvalidAttributeStride);
  }
}

export class ScenePatchCodec<TEntity extends DatasetEntity> {
  private readonly dictionary = new Map<string, number>();
  private readonly dictionaryValues: string[] = [];
  private readonly entityIdBySceneId = new Map<string, string>();
  private readonly handleAllocator = new SceneHandleAllocator();
  private readonly options: ScenePatchCodecOptions<TEntity>;
  private readonly sceneIdsByEntityId = new Map<string, Set<string>>();
  private readonly stringAttributeStride: number;

  constructor(options: ScenePatchCodecOptions<TEntity>) {
    validateAttributeStride(options.attributeStride);
    this.stringAttributeStride = options.stringAttributeStride ?? 0;
    validateAttributeStride(this.stringAttributeStride);
    this.options = options;
  }

  encode(patch: DatasetPatch<TEntity>): SceneSourcePatch {
    const allocation = this.allocate(patch.upserts.length);
    const dictionaryStart =
      patch.kind === DatasetPatchKind.Rebase ? 0 : this.dictionaryValues.length;

    for (const [index, entity] of patch.upserts.entries()) {
      this.writeEntity(allocation, entity, index);
    }

    const deletedHandles = this.release(patch.deletedIds);
    return {
      type: SceneDataCommandType.SourcePatch,
      source: this.options.source,
      sourceVersion: patch.version,
      kind: patch.kind,
      ...allocation,
      attributeStride: this.options.attributeStride,
      stringAttributeStride: this.stringAttributeStride,
      dictionaryStart,
      dictionaryValues:
        patch.kind === DatasetPatchKind.Rebase
          ? this.dictionaryValues.slice()
          : this.dictionaryValues.slice(dictionaryStart),
      deletedHandles,
    };
  }

  encodeSearch(
    entityIds: readonly string[],
    searchRevision: number,
    active: boolean,
  ): SceneSourceSearch {
    const handles = new Set<number>();
    for (const entityId of entityIds) {
      for (const sceneId of this.sceneIdsByEntityId.get(entityId) ?? []) {
        const handle = this.handleAllocator.handleForSceneId(sceneId);
        if (handle !== null) handles.add(handle);
      }
    }
    return {
      type: SceneDataCommandType.SourceSearch,
      source: this.options.source,
      searchRevision,
      active,
      handles: new Uint32Array(handles),
    };
  }

  private allocate(count: number): ScenePatchAllocation {
    return {
      handles: new Uint32Array(count),
      sceneIds: new Array<string>(count),
      entityIds: new Array<string>(count),
      positions: new Float64Array(count * SceneComponentCount.Position),
      unitVectors: new Float32Array(count * SceneComponentCount.UnitVector),
      timestamps: new Float64Array(count),
      attributes: new Float32Array(count * this.options.attributeStride),
      stringAttributes: new Uint32Array(
        count * this.stringAttributeStride,
      ),
    };
  }

  private writeEntity(
    allocation: ScenePatchAllocation,
    entity: TEntity,
    index: number,
  ): void {
    const sceneId = this.options.sceneId?.(entity) ?? entity.id;
    const entityId = this.options.entityId?.(entity) ?? entity.id;
    const position = this.options.position(entity);
    const longitude = longitudeOf(position);
    const latitude = latitudeOf(position);
    const timestamp = this.options.timestamp(entity);
    this.validateEntity(sceneId, longitude, latitude, timestamp);

    allocation.handles[index] = this.handleAllocator.acquire(sceneId);
    allocation.sceneIds[index] = sceneId;
    allocation.entityIds[index] = entityId;
    this.registerIdentity(sceneId, entityId);
    this.writePosition(allocation, index, longitude, latitude);
    allocation.timestamps[index] = timestamp;
    this.options.writeAttributes(
      entity,
      allocation.attributes,
      index * this.options.attributeStride,
    );
    this.options.writeStringAttributes?.(
      entity,
      allocation.stringAttributes,
      index * this.stringAttributeStride,
      (text) => this.intern(text),
    );
  }

  private writePosition(
    allocation: ScenePatchAllocation,
    index: number,
    longitude: number,
    latitude: number,
  ): void {
    const positionOffset = index * SceneComponentCount.Position;
    allocation.positions[
      positionOffset + ScenePositionOffset.Longitude
    ] = longitude;
    allocation.positions[
      positionOffset + ScenePositionOffset.Latitude
    ] = latitude;

    const unit = geographicToUnitVector(latitude, longitude);
    const unitOffset = index * SceneComponentCount.UnitVector;
    allocation.unitVectors[unitOffset + SceneUnitVectorOffset.X] = unit.x;
    allocation.unitVectors[unitOffset + SceneUnitVectorOffset.Y] = unit.y;
    allocation.unitVectors[unitOffset + SceneUnitVectorOffset.Z] = unit.z;
  }

  private validateEntity(
    sceneId: string,
    longitude: number,
    latitude: number,
    timestamp: number,
  ): void {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new SceneCodecError(SceneCodecErrorKind.InvalidPosition, sceneId);
    }
    if (!Number.isFinite(timestamp)) {
      throw new SceneCodecError(SceneCodecErrorKind.InvalidTimestamp, sceneId);
    }
  }

  private intern(value: string): number {
    if (value.length === 0) return 0;
    const current = this.dictionary.get(value);
    if (current !== undefined) return current;
    const index = this.dictionaryValues.length + 1;
    this.dictionary.set(value, index);
    this.dictionaryValues.push(value);
    return index;
  }

  private registerIdentity(sceneId: string, entityId: string): void {
    const previousEntityId = this.entityIdBySceneId.get(sceneId);
    if (previousEntityId && previousEntityId !== entityId) {
      const previousSceneIds =
        this.sceneIdsByEntityId.get(previousEntityId);
      previousSceneIds?.delete(sceneId);
      if (previousSceneIds?.size === 0) {
        this.sceneIdsByEntityId.delete(previousEntityId);
      }
    }
    this.entityIdBySceneId.set(sceneId, entityId);
    const sceneIds = this.sceneIdsByEntityId.get(entityId) ?? new Set();
    sceneIds.add(sceneId);
    this.sceneIdsByEntityId.set(entityId, sceneIds);
  }

  private release(entityIds: readonly string[]): Uint32Array<ArrayBuffer> {
    const released: number[] = [];
    for (const entityId of entityIds) {
      const sceneIds = this.sceneIdsByEntityId.get(entityId);
      if (!sceneIds) continue;
      for (const sceneId of sceneIds) {
        const handle = this.handleAllocator.release(sceneId);
        if (handle !== null) released.push(handle);
        this.entityIdBySceneId.delete(sceneId);
      }
      this.sceneIdsByEntityId.delete(entityId);
    }
    return new Uint32Array(released);
  }
}
