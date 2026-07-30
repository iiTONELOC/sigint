import {
  DatasetPatchKind,
  type DatasetEntity,
  type DatasetPatch,
} from "@/workers/data/datasetStore";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import {
  SceneDataCommandType,
  SceneGeometryKind,
  type SceneSourcePatch,
  type SceneSourceSearch,
} from "@/workers/render/sceneProtocol";
import { geographicToUnitVector } from "@/lib/geo/unitSphere";
import {
  GeoLimit,
  geometryPolygons,
  latitudeOf,
  longitudeOf,
  type GeoJsonPolygonGeometry,
  type GeoLineString,
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

enum SceneDefault {
  Timestamp = 0,
}

export enum SceneCodecErrorKind {
  InvalidAttributeStride = "The scene attribute stride must be a nonnegative integer",
  DuplicateSceneId = "A scene patch must contain unique scene identifiers",
  InvalidGeometry = "The scene geometry must contain valid topology",
  InvalidPatchMembership = "A scene entity cannot be both upserted and deleted",
  InvalidPosition = "The scene position must contain finite coordinates",
  SceneIdConflict = "A scene identifier cannot belong to multiple entities",
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
  TRecord extends DatasetEntity,
> = Readonly<{
  source: RenderSourceId;
  attributeStride: number;
  records: (entity: TEntity) => readonly TRecord[];
  position: (record: TRecord) => GeoPoint;
  motionPosition?: (record: TRecord) => GeoPoint;
  timestamp: (record: TRecord) => number;
  geometry?: (record: TRecord) => SceneGeometryInput | null | undefined;
  writeAttributes: (
    record: TRecord,
    target: Float32Array<ArrayBuffer>,
    offset: number,
  ) => void;
  stringAttributeStride?: number;
  writeStringAttributes?: (
    record: TRecord,
    target: Uint32Array<ArrayBuffer>,
    offset: number,
    intern: (value: string) => number,
  ) => void;
}>;

export type SceneGeometryInput = Readonly<{
  kind: SceneGeometryKind.Polygon | SceneGeometryKind.Polyline;
  groups: readonly (readonly GeoLineString[])[];
}>;

export function singleSceneRecord<TEntity extends DatasetEntity>(
  entity: TEntity,
): readonly TEntity[] {
  return [entity];
}

export function scenePolygonGeometry(
  geometry: GeoJsonPolygonGeometry,
): SceneGeometryInput {
  return {
    kind: SceneGeometryKind.Polygon,
    groups: geometryPolygons(geometry),
  };
}

export function scenePolylineGeometry(
  lines: readonly GeoLineString[],
): SceneGeometryInput {
  return {
    kind: SceneGeometryKind.Polyline,
    groups: [lines],
  };
}

type ScenePatchAllocation = Readonly<{
  handles: Uint32Array<ArrayBuffer>;
  sceneIds: string[];
  entityIds: string[];
  positions: Float64Array<ArrayBuffer>;
  motionPositions: Float64Array<ArrayBuffer>;
  unitVectors: Float32Array<ArrayBuffer>;
  timestamps: Float64Array<ArrayBuffer>;
  attributes: Float32Array<ArrayBuffer>;
  stringAttributes: Uint32Array<ArrayBuffer>;
}>;

type SceneGeometryBuffers = Readonly<{
  geometryKinds: Uint8Array<ArrayBuffer>;
  geometryCoordinates: Float64Array<ArrayBuffer>;
  geometryPartEnds: Uint32Array<ArrayBuffer>;
  geometryGroupEnds: Uint32Array<ArrayBuffer>;
  geometryRecordEnds: Uint32Array<ArrayBuffer>;
}>;

type SceneGeometryAllocation = {
  kinds: number[];
  coordinates: number[];
  partEnds: number[];
  groupEnds: number[];
  recordEnds: number[];
};

type SceneProjectedRecord<
  TEntity extends DatasetEntity,
  TRecord extends DatasetEntity,
> = Readonly<{
  entity: TEntity;
  record: TRecord;
}>;

export type SceneTimestampedEntity = Readonly<{
  timestamp?: string;
}>;

export function sceneTimestamp(entity: SceneTimestampedEntity): number {
  if (!entity.timestamp) return SceneDefault.Timestamp;
  const timestamp = Date.parse(entity.timestamp);
  return Number.isFinite(timestamp) ? timestamp : SceneDefault.Timestamp;
}

function validateAttributeStride(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SceneCodecError(SceneCodecErrorKind.InvalidAttributeStride);
  }
}

export class ScenePatchCodec<
  TEntity extends DatasetEntity,
  TRecord extends DatasetEntity = TEntity,
> {
  private readonly dictionary = new Map<string, number>();
  private readonly dictionaryValues: string[] = [];
  private readonly entityIdBySceneId = new Map<string, string>();
  private readonly handleAllocator = new SceneHandleAllocator();
  private readonly motionPositionStride: number;
  private readonly options: ScenePatchCodecOptions<TEntity, TRecord>;
  private readonly sceneIdsByEntityId = new Map<string, Set<string>>();
  private readonly stringAttributeStride: number;

  constructor(options: ScenePatchCodecOptions<TEntity, TRecord>) {
    validateAttributeStride(options.attributeStride);
    this.stringAttributeStride = options.stringAttributeStride ?? 0;
    validateAttributeStride(this.stringAttributeStride);
    this.motionPositionStride = options.motionPosition
      ? SceneComponentCount.Position
      : 0;
    this.options = options;
  }

  encode(patch: DatasetPatch<TEntity>): SceneSourcePatch {
    this.validatePatchMembership(patch);
    const projected = this.projectRecords(patch.upserts);
    this.validateSceneIds(projected);
    const allocation = this.allocate(projected.length);
    const geometry = this.encodeGeometry(projected);
    const dictionaryStart =
      patch.kind === DatasetPatchKind.Rebase ? 0 : this.dictionaryValues.length;

    for (const [index, item] of projected.entries()) {
      this.writeRecord(allocation, item, index);
    }

    const releasedHandles = [
      ...this.releaseStaleRecords(patch.upserts, projected),
      ...this.releaseDeletedEntities(patch),
    ];
    return {
      type: SceneDataCommandType.SourcePatch,
      source: this.options.source,
      sourceVersion: patch.version,
      kind: patch.kind,
      ...allocation,
      ...geometry,
      attributeStride: this.options.attributeStride,
      motionPositionStride: this.motionPositionStride,
      stringAttributeStride: this.stringAttributeStride,
      dictionaryStart,
      dictionaryValues:
        patch.kind === DatasetPatchKind.Rebase
          ? this.dictionaryValues.slice()
          : this.dictionaryValues.slice(dictionaryStart),
      deletedHandles: new Uint32Array(releasedHandles),
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
      motionPositions: new Float64Array(
        count * this.motionPositionStride,
      ),
      unitVectors: new Float32Array(count * SceneComponentCount.UnitVector),
      timestamps: new Float64Array(count),
      attributes: new Float32Array(count * this.options.attributeStride),
      stringAttributes: new Uint32Array(
        count * this.stringAttributeStride,
      ),
    };
  }

  private encodeGeometry(
    projected: readonly SceneProjectedRecord<TEntity, TRecord>[],
  ): SceneGeometryBuffers {
    const allocation: SceneGeometryAllocation = {
      kinds: [],
      coordinates: [],
      partEnds: [],
      groupEnds: [],
      recordEnds: [],
    };
    for (const item of projected) {
      this.appendGeometry(allocation, item.record);
    }
    return {
      geometryKinds: new Uint8Array(allocation.kinds),
      geometryCoordinates: new Float64Array(allocation.coordinates),
      geometryPartEnds: new Uint32Array(allocation.partEnds),
      geometryGroupEnds: new Uint32Array(allocation.groupEnds),
      geometryRecordEnds: new Uint32Array(allocation.recordEnds),
    };
  }

  private appendGeometry(
    allocation: SceneGeometryAllocation,
    record: TRecord,
  ): void {
    const geometry = this.options.geometry?.(record);
    if (geometry === undefined || geometry === null) {
      allocation.kinds.push(SceneGeometryKind.None);
      allocation.recordEnds.push(allocation.groupEnds.length);
      return;
    }
    this.validateGeometry(geometry, record.id);
    allocation.kinds.push(geometry.kind);
    for (const group of geometry.groups) {
      this.appendGeometryGroup(allocation, group);
    }
    allocation.recordEnds.push(allocation.groupEnds.length);
  }

  private appendGeometryGroup(
    allocation: SceneGeometryAllocation,
    parts: readonly GeoLineString[],
  ): void {
    for (const part of parts) {
      this.appendGeometryPart(allocation, part);
    }
    allocation.groupEnds.push(allocation.partEnds.length);
  }

  private appendGeometryPart(
    allocation: SceneGeometryAllocation,
    part: GeoLineString,
  ): void {
    for (const point of part) {
      allocation.coordinates.push(
        longitudeOf(point),
        latitudeOf(point),
      );
    }
    allocation.partEnds.push(
      allocation.coordinates.length / SceneComponentCount.Position,
    );
  }

  private writeRecord(
    allocation: ScenePatchAllocation,
    projected: SceneProjectedRecord<TEntity, TRecord>,
    index: number,
  ): void {
    const sceneId = projected.record.id;
    const entityId = projected.entity.id;
    const position = this.options.position(projected.record);
    const longitude = longitudeOf(position);
    const latitude = latitudeOf(position);
    const timestamp = this.options.timestamp(projected.record);
    this.validateEntity(sceneId, longitude, latitude, timestamp);

    allocation.handles[index] = this.handleAllocator.acquire(sceneId);
    allocation.sceneIds[index] = sceneId;
    allocation.entityIds[index] = entityId;
    this.registerIdentity(sceneId, entityId);
    this.writePosition(allocation, index, longitude, latitude);
    this.writeMotionPosition(allocation, projected.record, index);
    allocation.timestamps[index] = timestamp;
    this.options.writeAttributes(
      projected.record,
      allocation.attributes,
      index * this.options.attributeStride,
    );
    this.options.writeStringAttributes?.(
      projected.record,
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

  private writeMotionPosition(
    allocation: ScenePatchAllocation,
    record: TRecord,
    index: number,
  ): void {
    const position = this.options.motionPosition?.(record);
    if (!position) return;
    const longitude = longitudeOf(position);
    const latitude = latitudeOf(position);
    this.validatePosition(record.id, longitude, latitude);
    const offset = index * this.motionPositionStride;
    allocation.motionPositions[
      offset + ScenePositionOffset.Longitude
    ] = longitude;
    allocation.motionPositions[
      offset + ScenePositionOffset.Latitude
    ] = latitude;
  }

  private validateEntity(
    sceneId: string,
    longitude: number,
    latitude: number,
    timestamp: number,
  ): void {
    this.validatePosition(sceneId, longitude, latitude);
    if (!Number.isFinite(timestamp)) {
      throw new SceneCodecError(SceneCodecErrorKind.InvalidTimestamp, sceneId);
    }
  }

  private validatePosition(
    sceneId: string,
    longitude: number,
    latitude: number,
  ): void {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new SceneCodecError(SceneCodecErrorKind.InvalidPosition, sceneId);
    }
  }

  private validateGeometry(
    geometry: SceneGeometryInput,
    sceneId: string,
  ): void {
    if (
      geometry.groups.length === 0 ||
      (geometry.kind === SceneGeometryKind.Polyline &&
        geometry.groups.length !== 1)
    ) {
      throw new SceneCodecError(
        SceneCodecErrorKind.InvalidGeometry,
        sceneId,
      );
    }
    for (const group of geometry.groups) {
      if (group.length === 0) {
        throw new SceneCodecError(
          SceneCodecErrorKind.InvalidGeometry,
          sceneId,
        );
      }
      for (const part of group) {
        this.validateGeometryPart(geometry.kind, part, sceneId);
      }
    }
  }

  private validateGeometryPart(
    kind: SceneGeometryKind.Polygon | SceneGeometryKind.Polyline,
    part: GeoLineString,
    sceneId: string,
  ): void {
    const minimum =
      kind === SceneGeometryKind.Polygon
        ? GeoLimit.MinRingPointCount
        : SceneComponentCount.Position;
    const first = part[0];
    const last = part.at(-1);
    if (
      part.length < minimum ||
      first === undefined ||
      last === undefined ||
      (kind === SceneGeometryKind.Polygon &&
        (longitudeOf(first) !== longitudeOf(last) ||
          latitudeOf(first) !== latitudeOf(last))) ||
      !part.every((point) => this.positionIsValid(point))
    ) {
      throw new SceneCodecError(
        SceneCodecErrorKind.InvalidGeometry,
        sceneId,
      );
    }
  }

  private positionIsValid(point: GeoPoint): boolean {
    const longitude = longitudeOf(point);
    const latitude = latitudeOf(point);
    return (
      Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      longitude >= GeoLimit.MinLongitude &&
      longitude <= GeoLimit.MaxLongitude &&
      latitude >= GeoLimit.MinLatitude &&
      latitude <= GeoLimit.MaxLatitude
    );
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
    this.entityIdBySceneId.set(sceneId, entityId);
    const sceneIds = this.sceneIdsByEntityId.get(entityId) ?? new Set();
    sceneIds.add(sceneId);
    this.sceneIdsByEntityId.set(entityId, sceneIds);
  }

  private projectRecords(
    entities: readonly TEntity[],
  ): readonly SceneProjectedRecord<TEntity, TRecord>[] {
    const projected: SceneProjectedRecord<TEntity, TRecord>[] = [];
    for (const entity of entities) {
      for (const record of this.options.records(entity)) {
        projected.push({ entity, record });
      }
    }
    return projected;
  }

  private validatePatchMembership(patch: DatasetPatch<TEntity>): void {
    const upsertIds = new Set(patch.upserts.map((entity) => entity.id));
    if (patch.deletedIds.some((entityId) => upsertIds.has(entityId))) {
      throw new SceneCodecError(
        SceneCodecErrorKind.InvalidPatchMembership,
      );
    }
  }

  private validateSceneIds(
    projected: readonly SceneProjectedRecord<TEntity, TRecord>[],
  ): void {
    const sceneIds = new Set<string>();
    for (const item of projected) {
      if (sceneIds.has(item.record.id)) {
        throw new SceneCodecError(
          SceneCodecErrorKind.DuplicateSceneId,
          item.record.id,
        );
      }
      const owner = this.entityIdBySceneId.get(item.record.id);
      if (owner !== undefined && owner !== item.entity.id) {
        throw new SceneCodecError(
          SceneCodecErrorKind.SceneIdConflict,
          item.record.id,
        );
      }
      sceneIds.add(item.record.id);
    }
  }

  private releaseStaleRecords(
    entities: readonly TEntity[],
    projected: readonly SceneProjectedRecord<TEntity, TRecord>[],
  ): number[] {
    const currentByEntityId = new Map<string, Set<string>>();
    for (const entity of entities) {
      currentByEntityId.set(entity.id, new Set());
    }
    for (const item of projected) {
      currentByEntityId.get(item.entity.id)?.add(item.record.id);
    }

    const released: number[] = [];
    for (const [entityId, currentSceneIds] of currentByEntityId) {
      const previousSceneIds = this.sceneIdsByEntityId.get(entityId);
      if (!previousSceneIds) continue;
      for (const sceneId of previousSceneIds) {
        if (!currentSceneIds.has(sceneId)) {
          const handle = this.releaseSceneId(sceneId);
          if (handle !== null) released.push(handle);
        }
      }
    }
    return released;
  }

  private releaseDeletedEntities(patch: DatasetPatch<TEntity>): number[] {
    const deletedIds = new Set(patch.deletedIds);
    if (patch.kind === DatasetPatchKind.Rebase) {
      const retainedIds = new Set(patch.upserts.map((entity) => entity.id));
      for (const entityId of this.sceneIdsByEntityId.keys()) {
        if (!retainedIds.has(entityId)) deletedIds.add(entityId);
      }
    }
    return this.releaseEntities(deletedIds);
  }

  private releaseEntities(entityIds: Iterable<string>): number[] {
    const released: number[] = [];
    for (const entityId of entityIds) {
      const sceneIds = this.sceneIdsByEntityId.get(entityId);
      if (!sceneIds) continue;
      for (const sceneId of Array.from(sceneIds)) {
        const handle = this.releaseSceneId(sceneId);
        if (handle !== null) released.push(handle);
      }
    }
    return released;
  }

  private releaseSceneId(sceneId: string): number | null {
    const entityId = this.entityIdBySceneId.get(sceneId);
    const handle = this.handleAllocator.release(sceneId);
    this.entityIdBySceneId.delete(sceneId);
    if (entityId === undefined) return handle;
    const sceneIds = this.sceneIdsByEntityId.get(entityId);
    sceneIds?.delete(sceneId);
    if (sceneIds?.size === 0) this.sceneIdsByEntityId.delete(entityId);
    return handle;
  }
}
