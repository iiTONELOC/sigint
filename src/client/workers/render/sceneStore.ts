import type {
  SceneDataCommand,
  SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import {
  SceneDataCommandType,
  SceneGeometryKind,
} from "@/workers/render/sceneProtocol";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import type {
  GeoLineString,
  GeoPoint,
} from "@shared/geo";

enum SceneStoragePolicy {
  InitialCapacity = 16,
  GrowthFactor = 2,
}

enum SceneStorageComponentCount {
  Position = 2,
  UnitVector = 3,
}

enum SceneValueDefault {
  Numeric = 0,
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

export enum SceneStoreErrorKind {
  AttributeStrideChanged = "The scene attribute stride cannot change",
  DictionarySequenceInvalid = "The scene dictionary sequence is invalid",
  SourceMismatch = "The scene patch has an incorrect source",
  SourceVersionNotIncreasing = "The scene source version must increase",
  StringAttributeStrideChanged = "The scene string attribute stride cannot change",
}

export class SceneStoreError extends Error {
  readonly kind: SceneStoreErrorKind;

  constructor(kind: SceneStoreErrorKind) {
    super(kind);
    this.name = SceneStoreError.name;
    this.kind = kind;
  }
}

export type RenderScenePatch = Extract<
  SceneDataCommand,
  { type: SceneDataCommandType.SourcePatch }
>;

export type RenderSceneRecord = Readonly<{
  sceneId: string;
  entityId: string;
  longitude: number;
  latitude: number;
  unitX: number;
  unitY: number;
  unitZ: number;
  timestamp: number;
  attributes: readonly number[];
  geometry: RenderSceneGeometry | null;
}>;

export type RenderSceneGeometry = Readonly<{
  kind: SceneGeometryKind.Polygon | SceneGeometryKind.Polyline;
  groups: readonly (readonly GeoLineString[])[];
}>;

export type RenderSceneView = Readonly<{
  capacity: number;
  active: Uint8Array<ArrayBuffer>;
  sceneIds: readonly (string | null)[];
  entityIds: readonly (string | null)[];
  positions: Float64Array<ArrayBuffer>;
  unitVectors: Float32Array<ArrayBuffer>;
  timestamps: Float64Array<ArrayBuffer>;
  attributes: Float32Array<ArrayBuffer>;
  attributeStride: number;
  stringAttributes: Uint32Array<ArrayBuffer>;
  stringAttributeStride: number;
  dictionary: readonly string[];
  geometries: readonly (RenderSceneGeometry | null)[];
}>;

export function sceneNumericAttribute(
  view: RenderSceneView,
  index: number,
  attribute: number,
): number {
  return (
    view.attributes[index * view.attributeStride + attribute] ??
    SceneValueDefault.Numeric
  );
}

type SceneStorage = {
  capacity: number;
  active: Uint8Array<ArrayBuffer>;
  sceneIds: (string | null)[];
  entityIds: (string | null)[];
  positions: Float64Array<ArrayBuffer>;
  unitVectors: Float32Array<ArrayBuffer>;
  timestamps: Float64Array<ArrayBuffer>;
  attributes: Float32Array<ArrayBuffer>;
  stringAttributes: Uint32Array<ArrayBuffer>;
  geometries: (RenderSceneGeometry | null)[];
};

function copyIdentityLane(
  target: (string | null)[],
  source: readonly (string | null)[],
): void {
  for (const [index, identity] of source.entries()) {
    target[index] = identity;
  }
}

function copyGeometryLane(
  target: (RenderSceneGeometry | null)[],
  source: readonly (RenderSceneGeometry | null)[],
): void {
  for (const [index, geometry] of source.entries()) {
    target[index] = geometry;
  }
}

function copyStorage(target: SceneStorage, source: SceneStorage): void {
  target.active.set(source.active);
  copyIdentityLane(target.sceneIds, source.sceneIds);
  copyIdentityLane(target.entityIds, source.entityIds);
  target.positions.set(source.positions);
  target.unitVectors.set(source.unitVectors);
  target.timestamps.set(source.timestamps);
  target.attributes.set(source.attributes);
  target.stringAttributes.set(source.stringAttributes);
  copyGeometryLane(target.geometries, source.geometries);
}

function nextCapacity(current: number, required: number): number {
  if (required <= current) return current;
  const exponent = Math.ceil(
    Math.log2(required / SceneStoragePolicy.InitialCapacity),
  );
  const capacity =
    SceneStoragePolicy.InitialCapacity *
    SceneStoragePolicy.GrowthFactor ** Math.max(0, exponent);
  return Math.max(current, capacity);
}

function createStorage(
  capacity: number,
  attributeStride: number,
  stringAttributeStride: number,
  previous?: SceneStorage,
): SceneStorage {
  const active = new Uint8Array(capacity);
  const positions = new Float64Array(
    capacity * SceneStorageComponentCount.Position,
  );
  const unitVectors = new Float32Array(
    capacity * SceneStorageComponentCount.UnitVector,
  );
  const timestamps = new Float64Array(capacity);
  const attributes = new Float32Array(capacity * attributeStride);
  const stringAttributes = new Uint32Array(
    capacity * stringAttributeStride,
  );
  const storage: SceneStorage = {
    capacity,
    active,
    sceneIds: new Array<string | null>(capacity).fill(null),
    entityIds: new Array<string | null>(capacity).fill(null),
    positions,
    unitVectors,
    timestamps,
    attributes,
    stringAttributes,
    geometries: new Array<RenderSceneGeometry | null>(capacity).fill(null),
  };
  if (previous) copyStorage(storage, previous);
  return storage;
}

function maximumHandle(patch: SceneSourcePatch): number {
  let maximum = 0;
  for (const handle of patch.handles) {
    maximum = Math.max(maximum, handle);
  }
  for (const handle of patch.deletedHandles) {
    maximum = Math.max(maximum, handle);
  }
  return maximum;
}

function cumulativeStart(
  ends: Uint32Array<ArrayBuffer>,
  index: number,
): number {
  return index === 0 ? 0 : (ends[index - 1] ?? 0);
}

function geometryPart(
  patch: SceneSourcePatch,
  partIndex: number,
): GeoLineString | null {
  const pointStart = cumulativeStart(
    patch.geometryPartEnds,
    partIndex,
  );
  const pointEnd = patch.geometryPartEnds[partIndex];
  if (pointEnd === undefined) return null;
  const part: GeoPoint[] = [];
  for (
    let pointIndex = pointStart;
    pointIndex < pointEnd;
    pointIndex += 1
  ) {
    const offset =
      pointIndex * SceneStorageComponentCount.Position;
    const longitude = patch.geometryCoordinates[
      offset + ScenePositionOffset.Longitude
    ];
    const latitude = patch.geometryCoordinates[
      offset + ScenePositionOffset.Latitude
    ];
    if (longitude === undefined || latitude === undefined) return null;
    part.push([longitude, latitude]);
  }
  return part;
}

function geometryGroup(
  patch: SceneSourcePatch,
  groupIndex: number,
): readonly GeoLineString[] | null {
  const partStart = cumulativeStart(
    patch.geometryGroupEnds,
    groupIndex,
  );
  const partEnd = patch.geometryGroupEnds[groupIndex];
  if (partEnd === undefined) return null;
  const parts: GeoLineString[] = [];
  for (
    let partIndex = partStart;
    partIndex < partEnd;
    partIndex += 1
  ) {
    const part = geometryPart(patch, partIndex);
    if (!part) return null;
    parts.push(part);
  }
  return parts;
}

function geometryForRecord(
  patch: SceneSourcePatch,
  recordIndex: number,
): RenderSceneGeometry | null {
  const groupStart = cumulativeStart(
    patch.geometryRecordEnds,
    recordIndex,
  );
  const groupEnd = patch.geometryRecordEnds[recordIndex];
  const kind = patch.geometryKinds[recordIndex];
  if (
    groupEnd === undefined ||
    groupEnd === groupStart ||
    kind === undefined ||
    (kind !== SceneGeometryKind.Polygon &&
      kind !== SceneGeometryKind.Polyline)
  ) {
    return null;
  }

  const groups: (readonly GeoLineString[])[] = [];
  for (
    let groupIndex = groupStart;
    groupIndex < groupEnd;
    groupIndex += 1
  ) {
    const group = geometryGroup(patch, groupIndex);
    if (!group) return null;
    groups.push(group);
  }
  return { kind, groups };
}

export class SceneStore {
  private attributeStride: number | null = null;
  private dictionary: string[] = [];
  private readonly handlesByEntityId = new Map<string, Set<number>>();
  private readonly handlesBySceneId = new Map<string, number>();
  private itemCount = 0;
  private readonly source: RenderSourceId;
  private sourceVersion = 0;
  private storage = createStorage(0, 0, 0);
  private stringAttributeStride: number | null = null;

  constructor(source: RenderSourceId) {
    this.source = source;
  }

  apply(patch: RenderScenePatch): void {
    this.validatePatch(patch);
    this.applySchema(patch);
    this.applyDictionary(patch);
    this.ensureCapacity(maximumHandle(patch));

    if (patch.kind === DatasetPatchKind.Rebase) {
      this.resetRecords();
    }
    this.writeRecords(patch);
    this.deleteRecords(patch.deletedHandles);
    this.sourceVersion = patch.sourceVersion;
  }

  version(): number {
    return this.sourceVersion;
  }

  size(): number {
    return this.itemCount;
  }

  view(): RenderSceneView {
    return {
      capacity: this.storage.capacity,
      active: this.storage.active,
      sceneIds: this.storage.sceneIds,
      entityIds: this.storage.entityIds,
      positions: this.storage.positions,
      unitVectors: this.storage.unitVectors,
      timestamps: this.storage.timestamps,
      attributes: this.storage.attributes,
      attributeStride: this.attributeStride ?? 0,
      stringAttributes: this.storage.stringAttributes,
      stringAttributeStride: this.stringAttributeStride ?? 0,
      dictionary: this.dictionary,
      geometries: this.storage.geometries,
    };
  }

  handleForSceneId(sceneId: string): number | null {
    return this.handlesBySceneId.get(sceneId) ?? null;
  }

  handlesForEntityId(entityId: string): readonly number[] {
    return Array.from(this.handlesByEntityId.get(entityId) ?? []);
  }

  read(handle: number): RenderSceneRecord | null {
    if (!Number.isSafeInteger(handle) || handle < 1) return null;
    const index = handle - 1;
    if (this.storage.active[index] !== 1) return null;
    const sceneId = this.storage.sceneIds[index];
    const entityId = this.storage.entityIds[index];
    if (!sceneId || !entityId) return null;

    const positionOffset = index * SceneStorageComponentCount.Position;
    const unitOffset = index * SceneStorageComponentCount.UnitVector;
    const stride = this.attributeStride ?? 0;
    return {
      sceneId,
      entityId,
      longitude:
        this.storage.positions[
          positionOffset + ScenePositionOffset.Longitude
        ] ?? 0,
      latitude:
        this.storage.positions[
          positionOffset + ScenePositionOffset.Latitude
        ] ?? 0,
      unitX:
        this.storage.unitVectors[
          unitOffset + SceneUnitVectorOffset.X
        ] ?? 0,
      unitY:
        this.storage.unitVectors[
          unitOffset + SceneUnitVectorOffset.Y
        ] ?? 0,
      unitZ:
        this.storage.unitVectors[
          unitOffset + SceneUnitVectorOffset.Z
        ] ?? 0,
      timestamp: this.storage.timestamps[index] ?? 0,
      attributes: Array.from(
        this.storage.attributes.subarray(
          index * stride,
          index * stride + stride,
        ),
      ),
      geometry: this.storage.geometries[index] ?? null,
    };
  }

  private validatePatch(patch: RenderScenePatch): void {
    if (patch.source !== this.source) {
      throw new SceneStoreError(SceneStoreErrorKind.SourceMismatch);
    }
    if (patch.sourceVersion <= this.sourceVersion) {
      throw new SceneStoreError(
        SceneStoreErrorKind.SourceVersionNotIncreasing,
      );
    }
    if (
      this.attributeStride !== null &&
      patch.attributeStride !== this.attributeStride
    ) {
      throw new SceneStoreError(
        SceneStoreErrorKind.AttributeStrideChanged,
      );
    }
    if (
      this.stringAttributeStride !== null &&
      patch.stringAttributeStride !== this.stringAttributeStride
    ) {
      throw new SceneStoreError(
        SceneStoreErrorKind.StringAttributeStrideChanged,
      );
    }
  }

  private applySchema(patch: RenderScenePatch): void {
    if (this.attributeStride !== null) return;
    this.attributeStride = patch.attributeStride;
    this.stringAttributeStride = patch.stringAttributeStride;
    this.storage = createStorage(
      this.storage.capacity,
      this.attributeStride,
      this.stringAttributeStride,
      this.storage,
    );
  }

  private applyDictionary(patch: RenderScenePatch): void {
    if (patch.kind === DatasetPatchKind.Rebase) this.dictionary = [];
    if (patch.dictionaryStart !== this.dictionary.length) {
      throw new SceneStoreError(
        SceneStoreErrorKind.DictionarySequenceInvalid,
      );
    }
    this.dictionary.push(...patch.dictionaryValues);
  }

  private ensureCapacity(required: number): void {
    const capacity = nextCapacity(this.storage.capacity, required);
    if (capacity === this.storage.capacity) return;
    this.storage = createStorage(
      capacity,
      this.attributeStride ?? 0,
      this.stringAttributeStride ?? 0,
      this.storage,
    );
  }

  private resetRecords(): void {
    this.storage.active.fill(0);
    this.storage.sceneIds.fill(null);
    this.storage.entityIds.fill(null);
    this.storage.geometries.fill(null);
    this.handlesBySceneId.clear();
    this.handlesByEntityId.clear();
    this.itemCount = 0;
  }

  private writeRecords(patch: RenderScenePatch): void {
    for (const [patchIndex, handle] of patch.handles.entries()) {
      const index = handle - 1;
      if (this.storage.active[index] === 1) {
        this.removeIndexes(index, handle);
      } else {
        this.itemCount += 1;
      }
      this.writeIdentity(patch, patchIndex, handle, index);
      this.writePosition(patch, patchIndex, index);
      this.writeAttributes(patch, patchIndex, index);
      this.storage.geometries[index] = geometryForRecord(
        patch,
        patchIndex,
      );
    }
  }

  private writeIdentity(
    patch: RenderScenePatch,
    patchIndex: number,
    handle: number,
    index: number,
  ): void {
    const sceneId = patch.sceneIds[patchIndex] ?? null;
    const entityId = patch.entityIds[patchIndex] ?? null;
    this.storage.active[index] = 1;
    this.storage.sceneIds[index] = sceneId;
    this.storage.entityIds[index] = entityId;
    if (sceneId) this.handlesBySceneId.set(sceneId, handle);
    if (!entityId) return;
    const handles = this.handlesByEntityId.get(entityId) ?? new Set<number>();
    handles.add(handle);
    this.handlesByEntityId.set(entityId, handles);
  }

  private writePosition(
    patch: RenderScenePatch,
    patchIndex: number,
    index: number,
  ): void {
    const patchPositionOffset =
      patchIndex * SceneStorageComponentCount.Position;
    const positionOffset = index * SceneStorageComponentCount.Position;
    this.storage.positions.set(
      patch.positions.subarray(
        patchPositionOffset,
        patchPositionOffset + SceneStorageComponentCount.Position,
      ),
      positionOffset,
    );

    const patchUnitOffset =
      patchIndex * SceneStorageComponentCount.UnitVector;
    const unitOffset = index * SceneStorageComponentCount.UnitVector;
    this.storage.unitVectors.set(
      patch.unitVectors.subarray(
        patchUnitOffset,
        patchUnitOffset + SceneStorageComponentCount.UnitVector,
      ),
      unitOffset,
    );
    this.storage.timestamps[index] = patch.timestamps[patchIndex] ?? 0;
  }

  private writeAttributes(
    patch: RenderScenePatch,
    patchIndex: number,
    index: number,
  ): void {
    const stride = this.attributeStride ?? 0;
    const patchAttributeOffset = patchIndex * stride;
    this.storage.attributes.set(
      patch.attributes.subarray(
        patchAttributeOffset,
        patchAttributeOffset + stride,
      ),
      index * stride,
    );

    const stringStride = this.stringAttributeStride ?? 0;
    const patchStringOffset = patchIndex * stringStride;
    this.storage.stringAttributes.set(
      patch.stringAttributes.subarray(
        patchStringOffset,
        patchStringOffset + stringStride,
      ),
      index * stringStride,
    );
  }

  private deleteRecords(handles: Uint32Array<ArrayBuffer>): void {
    for (const handle of handles) {
      const index = handle - 1;
      if (this.storage.active[index] !== 1) continue;
      this.removeIndexes(index, handle);
      this.storage.active[index] = 0;
      this.storage.sceneIds[index] = null;
      this.storage.entityIds[index] = null;
      this.storage.geometries[index] = null;
      this.itemCount -= 1;
    }
  }

  private removeIndexes(index: number, handle: number): void {
    const sceneId = this.storage.sceneIds[index];
    if (sceneId) this.handlesBySceneId.delete(sceneId);

    const entityId = this.storage.entityIds[index];
    if (!entityId) return;
    const handles = this.handlesByEntityId.get(entityId);
    if (!handles) return;
    handles.delete(handle);
    if (handles.size === 0) this.handlesByEntityId.delete(entityId);
  }
}
