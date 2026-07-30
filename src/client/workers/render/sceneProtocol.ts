import { GeoLimit, isRecord } from "@shared/geo";
import { Domain } from "@shared/domain/identity";
import {
  isAircraftRoutePolyline,
} from "@shared/domain/aircraftDossier";
import {
  isRenderSourceId,
  type RenderSourceId,
} from "@/workers/data/sourceIds";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  isTrackSource,
  isTrackMotion,
  isTrailPoint,
} from "@/lib/geo/trails/trailStore";
import {
  isRenderSelectionSnapshot,
  type RenderSelectionOverlay,
  type RenderSelectionSnapshot,
} from "@/workers/render/protocol";

export enum SceneProtocolVersion {
  Current = 6,
}

export enum SceneDataCommandType {
  Bind = "bind",
  SourcePatch = "sourcePatch",
  SourceSearch = "sourceSearch",
  SelectionOverlay = "selectionOverlay",
}

export enum SceneInterestCommandType {
  Selection = "selectionInterest",
}

export enum SceneGeometryKind {
  None = 0,
  Polygon = 1,
  Polyline = 2,
}

type TransferUint8Array = Uint8Array<ArrayBuffer>;
type TransferUint32Array = Uint32Array<ArrayBuffer>;
type TransferFloat32Array = Float32Array<ArrayBuffer>;
type TransferFloat64Array = Float64Array<ArrayBuffer>;

enum SceneProtocolComponentCount {
  Position = 2,
  UnitVector = 3,
}

type SceneGeometryBuffers = Readonly<{
  geometryKinds: TransferUint8Array;
  geometryCoordinates: TransferFloat64Array;
  geometryPartEnds: TransferUint32Array;
  geometryGroupEnds: TransferUint32Array;
  geometryRecordEnds: TransferUint32Array;
}>;

type ScenePatchBuffers = Readonly<{
  handles: TransferUint32Array;
  sceneIds: readonly string[];
  entityIds: readonly string[];
  positions: TransferFloat64Array;
  unitVectors: TransferFloat32Array;
  timestamps: TransferFloat64Array;
  attributes: TransferFloat32Array;
  attributeStride: number;
  stringAttributes: TransferUint32Array;
  stringAttributeStride: number;
  dictionaryStart: number;
  dictionaryValues: readonly string[];
  deletedHandles: TransferUint32Array;
}> &
  SceneGeometryBuffers;

type GeometryIndexRange = readonly [start: number, end: number];

export type SceneSourcePatch = Readonly<{
  type: SceneDataCommandType.SourcePatch;
  source: RenderSourceId;
  sourceVersion: number;
  kind: DatasetPatchKind;
}> &
  ScenePatchBuffers;

export type SceneSourceSearch = Readonly<{
  type: SceneDataCommandType.SourceSearch;
  source: RenderSourceId;
  searchRevision: number;
  active: boolean;
  handles: TransferUint32Array;
}>;

export type SceneSourceCommandBody =
  | SceneSourcePatch
  | SceneSourceSearch;

export type SceneSelectionOverlay = RenderSelectionOverlay &
  Readonly<{ type: SceneDataCommandType.SelectionOverlay }>;

export type ScenePublishCommandBody =
  | SceneSourceCommandBody
  | SceneSelectionOverlay;

export type SceneDataCommandBody =
  | Readonly<{ type: SceneDataCommandType.Bind }>
  | ScenePublishCommandBody;

export type SceneProtocolEnvelope = Readonly<{
  protocolVersion: SceneProtocolVersion;
  sessionId: string;
  sequence: number;
}>;

export type SceneSourceCommand = SceneSourcePatch & SceneProtocolEnvelope;

export type SceneSearchCommand = SceneSourceSearch & SceneProtocolEnvelope;

export type SceneLayerCommand =
  | SceneSourceCommand
  | SceneSearchCommand;

export type SceneDataCommand =
  | (Readonly<{ type: SceneDataCommandType.Bind }> &
      SceneProtocolEnvelope)
  | SceneLayerCommand
  | (SceneSelectionOverlay & SceneProtocolEnvelope);

export type SceneSelectionInterest = Readonly<{
  type: SceneInterestCommandType.Selection;
  selection: RenderSelectionSnapshot;
}>;

export type SceneInterestCommand =
  SceneSelectionInterest & SceneProtocolEnvelope;

export class SceneProtocolState {
  readonly sessionId: string;
  private sequence = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  accept(command: SceneProtocolEnvelope): boolean {
    if (
      command.sessionId !== this.sessionId ||
      command.sequence <= this.sequence
    ) {
      return false;
    }
    this.sequence = command.sequence;
    return true;
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isPositiveSequence(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

function isTransferUint32Array(
  value: unknown,
): value is TransferUint32Array {
  return value instanceof Uint32Array && value.buffer instanceof ArrayBuffer;
}

function isTransferUint8Array(
  value: unknown,
): value is TransferUint8Array {
  return value instanceof Uint8Array && value.buffer instanceof ArrayBuffer;
}

function isTransferFloat32Array(
  value: unknown,
): value is TransferFloat32Array {
  return value instanceof Float32Array && value.buffer instanceof ArrayBuffer;
}

function isTransferFloat64Array(
  value: unknown,
): value is TransferFloat64Array {
  return value instanceof Float64Array && value.buffer instanceof ArrayBuffer;
}

function hasValidCoordinatePairs(
  coordinates: TransferFloat64Array,
): boolean {
  if (
    coordinates.length % SceneProtocolComponentCount.Position !==
    0
  ) {
    return false;
  }
  for (
    let offset = 0;
    offset < coordinates.length;
    offset += SceneProtocolComponentCount.Position
  ) {
    const longitude = coordinates[offset];
    const latitude = coordinates[offset + 1];
    if (
      longitude === undefined ||
      latitude === undefined ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < GeoLimit.MinLongitude ||
      longitude > GeoLimit.MaxLongitude ||
      latitude < GeoLimit.MinLatitude ||
      latitude > GeoLimit.MaxLatitude
    ) {
      return false;
    }
  }
  return true;
}

function hasValidCumulativeEnds(
  ends: TransferUint32Array,
  finalValue: number,
  minimumSpan: number,
): boolean {
  let previous = 0;
  for (const end of ends) {
    if (end < previous || end - previous < minimumSpan) return false;
    previous = end;
  }
  return previous === finalValue;
}

function geometryKindIsValid(
  value: number,
): value is SceneGeometryKind {
  return (
    value === SceneGeometryKind.None ||
    value === SceneGeometryKind.Polygon ||
    value === SceneGeometryKind.Polyline
  );
}

function geometryPartIsClosed(
  coordinates: TransferFloat64Array,
  pointStart: number,
  pointEnd: number,
): boolean {
  const firstOffset =
    pointStart * SceneProtocolComponentCount.Position;
  const lastOffset =
    (pointEnd - 1) * SceneProtocolComponentCount.Position;
  return (
    coordinates[firstOffset] === coordinates[lastOffset] &&
    coordinates[firstOffset + 1] === coordinates[lastOffset + 1]
  );
}

function geometryIndexRange(
  ends: TransferUint32Array,
  index: number,
): GeometryIndexRange | null {
  const end = ends[index];
  if (end === undefined) return null;
  const start = index === 0 ? 0 : ends[index - 1];
  return start === undefined ? null : [start, end];
}

function geometryGroupCountIsValid(
  kind: SceneGeometryKind,
  count: number,
): boolean {
  switch (kind) {
    case SceneGeometryKind.None:
      return count === 0;
    case SceneGeometryKind.Polygon:
      return count > 0;
    case SceneGeometryKind.Polyline:
      return count === 1;
  }
}

function geometryPartIsValid(
  value: SceneGeometryBuffers,
  kind: SceneGeometryKind,
  partIndex: number,
): boolean {
  const range = geometryIndexRange(
    value.geometryPartEnds,
    partIndex,
  );
  if (!range) return false;
  const [pointStart, pointEnd] = range;
  const minimum =
    kind === SceneGeometryKind.Polygon
      ? GeoLimit.MinRingPointCount
      : SceneProtocolComponentCount.Position;
  return (
    pointEnd - pointStart >= minimum &&
    (kind !== SceneGeometryKind.Polygon ||
      geometryPartIsClosed(
        value.geometryCoordinates,
        pointStart,
        pointEnd,
      ))
  );
}

function geometryGroupIsValid(
  value: SceneGeometryBuffers,
  kind: SceneGeometryKind,
  groupIndex: number,
): boolean {
  const range = geometryIndexRange(
    value.geometryGroupEnds,
    groupIndex,
  );
  if (!range || range[0] === range[1]) return false;
  for (
    let partIndex = range[0];
    partIndex < range[1];
    partIndex += 1
  ) {
    if (!geometryPartIsValid(value, kind, partIndex)) return false;
  }
  return true;
}

function hasValidGeometryRecord(
  value: SceneGeometryBuffers,
  recordIndex: number,
): boolean {
  const kind = value.geometryKinds[recordIndex];
  if (kind === undefined || !geometryKindIsValid(kind)) return false;
  const range = geometryIndexRange(
    value.geometryRecordEnds,
    recordIndex,
  );
  if (!range || !geometryGroupCountIsValid(kind, range[1] - range[0])) {
    return false;
  }
  for (
    let groupIndex = range[0];
    groupIndex < range[1];
    groupIndex += 1
  ) {
    if (!geometryGroupIsValid(value, kind, groupIndex)) return false;
  }
  return true;
}

function hasValidGeometryBuffers(
  value: Readonly<Record<string, unknown>>,
  recordCount: number,
): value is Readonly<Record<string, unknown>> &
  SceneGeometryBuffers {
  if (
    !isTransferUint8Array(value.geometryKinds) ||
    !isTransferFloat64Array(value.geometryCoordinates) ||
    !isTransferUint32Array(value.geometryPartEnds) ||
    !isTransferUint32Array(value.geometryGroupEnds) ||
    !isTransferUint32Array(value.geometryRecordEnds)
  ) {
    return false;
  }
  if (
    value.geometryKinds.length !== recordCount ||
    value.geometryRecordEnds.length !== recordCount ||
    !hasValidCoordinatePairs(value.geometryCoordinates)
  ) {
    return false;
  }
  const geometry = {
    geometryKinds: value.geometryKinds,
    geometryCoordinates: value.geometryCoordinates,
    geometryPartEnds: value.geometryPartEnds,
    geometryGroupEnds: value.geometryGroupEnds,
    geometryRecordEnds: value.geometryRecordEnds,
  };
  const pointCount =
    geometry.geometryCoordinates.length /
    SceneProtocolComponentCount.Position;
  return (
    hasValidCumulativeEnds(
      geometry.geometryPartEnds,
      pointCount,
      0,
    ) &&
    hasValidCumulativeEnds(
      geometry.geometryGroupEnds,
      geometry.geometryPartEnds.length,
      1,
    ) &&
    hasValidCumulativeEnds(
      geometry.geometryRecordEnds,
      geometry.geometryGroupEnds.length,
      0,
    ) &&
    geometry.geometryKinds.every(geometryKindIsValid) &&
    geometry.geometryRecordEnds.every((_end, recordIndex) =>
      hasValidGeometryRecord(geometry, recordIndex),
    )
  );
}

function hasValidPatchBuffers(
  value: Readonly<Record<string, unknown>>,
): value is Readonly<Record<string, unknown>> & ScenePatchBuffers {
  const attributeStride = value.attributeStride;
  const stringAttributeStride = value.stringAttributeStride;
  const dictionaryStart = value.dictionaryStart;
  if (
    !isTransferUint32Array(value.handles) ||
    !isStringArray(value.sceneIds) ||
    !isStringArray(value.entityIds) ||
    !isTransferFloat64Array(value.positions) ||
    !isTransferFloat32Array(value.unitVectors) ||
    !isTransferFloat64Array(value.timestamps) ||
    !isTransferFloat32Array(value.attributes) ||
    !isTransferUint32Array(value.stringAttributes) ||
    !isTransferUint32Array(value.deletedHandles) ||
    !isNonNegativeInteger(attributeStride) ||
    !isNonNegativeInteger(stringAttributeStride) ||
    !isNonNegativeInteger(dictionaryStart)
  ) {
    return false;
  }

  const dictionaryValues = value.dictionaryValues;
  if (!isStringArray(dictionaryValues)) return false;

  const count = value.handles.length;
  const deleted = new Set(value.deletedHandles);
  return (
    value.handles.every((handle) => handle > 0) &&
    value.deletedHandles.every((handle) => handle > 0) &&
    value.handles.every((handle) => !deleted.has(handle)) &&
    value.sceneIds.length === count &&
    value.entityIds.length === count &&
    value.positions.length ===
      count * SceneProtocolComponentCount.Position &&
    value.unitVectors.length ===
      count * SceneProtocolComponentCount.UnitVector &&
    value.timestamps.length === count &&
    value.positions.every(Number.isFinite) &&
    value.timestamps.every(Number.isFinite) &&
    value.attributes.length === count * attributeStride &&
    value.stringAttributes.length ===
      count * stringAttributeStride &&
    value.stringAttributes.every(
      (index) =>
        index <=
        dictionaryStart + dictionaryValues.length,
    ) &&
    new Set(dictionaryValues).size === dictionaryValues.length &&
    new Set(value.handles).size === count &&
    new Set(value.sceneIds).size === count &&
    hasValidGeometryBuffers(value, count)
  );
}

export function createSceneDataCommand<
  TBody extends SceneDataCommandBody,
>(
  body: TBody,
  sessionId: string,
  sequence: number,
): TBody & SceneProtocolEnvelope {
  return {
    ...body,
    protocolVersion: SceneProtocolVersion.Current,
    sessionId,
    sequence,
  };
}

export function createSceneInterestCommand(
  selection: RenderSelectionSnapshot,
  sessionId: string,
  sequence: number,
): SceneInterestCommand {
  return {
    type: SceneInterestCommandType.Selection,
    selection,
    protocolVersion: SceneProtocolVersion.Current,
    sessionId,
    sequence,
  };
}

function sceneProtocolEnvelope(
  value: Readonly<Record<string, unknown>>,
): SceneProtocolEnvelope | null {
  if (
    value.protocolVersion !== SceneProtocolVersion.Current ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    !isPositiveSequence(value.sequence)
  ) {
    return null;
  }
  return {
    protocolVersion: SceneProtocolVersion.Current,
    sessionId: value.sessionId,
    sequence: value.sequence,
  };
}

function isSceneSelectionOverlay(
  value: Readonly<Record<string, unknown>>,
): value is Readonly<Record<string, unknown>> &
  RenderSelectionOverlay {
  if (
    !isRenderSelectionSnapshot(value.selection) ||
    !Array.isArray(value.trail) ||
    !value.trail.every(isTrailPoint) ||
    (value.motion !== null && !isTrackMotion(value.motion)) ||
    (value.route !== null && !isAircraftRoutePolyline(value.route))
  ) {
    return false;
  }
  const identity = value.selection.identity;
  if (identity === null || !isTrackSource(identity.source)) {
    return value.trail.length === 0 &&
      value.motion === null &&
      value.route === null;
  }
  return identity.source === Domain.Aircraft || value.route === null;
}

export function parseSceneDataCommand(
  value: unknown,
): SceneDataCommand | null {
  if (!isRecord(value)) return null;
  const envelope = sceneProtocolEnvelope(value);
  if (!envelope) return null;

  if (value.type === SceneDataCommandType.Bind) {
    return { ...envelope, type: SceneDataCommandType.Bind };
  }

  if (
    value.type === SceneDataCommandType.SelectionOverlay &&
    isSceneSelectionOverlay(value)
  ) {
    return {
      ...envelope,
      type: SceneDataCommandType.SelectionOverlay,
      selection: value.selection,
      trail: value.trail,
      motion: value.motion,
      route: value.route,
    };
  }

  if (
    value.type === SceneDataCommandType.SourceSearch &&
    isRenderSourceId(value.source) &&
    isPositiveSequence(value.searchRevision) &&
    typeof value.active === "boolean" &&
    isTransferUint32Array(value.handles) &&
    value.handles.every((handle) => handle > 0) &&
    new Set(value.handles).size === value.handles.length
  ) {
    return {
      ...envelope,
      type: SceneDataCommandType.SourceSearch,
      source: value.source,
      searchRevision: value.searchRevision,
      active: value.active,
      handles: value.handles,
    };
  }

  if (
    value.type !== SceneDataCommandType.SourcePatch ||
    !isRenderSourceId(value.source) ||
    !isNonNegativeInteger(value.sourceVersion) ||
    (value.kind !== DatasetPatchKind.Rebase &&
      value.kind !== DatasetPatchKind.Patch) ||
    !hasValidPatchBuffers(value) ||
    (value.kind === DatasetPatchKind.Rebase &&
      value.dictionaryStart !== 0)
  ) {
    return null;
  }

  return {
    ...envelope,
    type: SceneDataCommandType.SourcePatch,
    source: value.source,
    sourceVersion: value.sourceVersion,
    kind: value.kind,
    handles: value.handles,
    sceneIds: value.sceneIds,
    entityIds: value.entityIds,
    positions: value.positions,
    unitVectors: value.unitVectors,
    timestamps: value.timestamps,
    attributes: value.attributes,
    attributeStride: value.attributeStride,
    stringAttributes: value.stringAttributes,
    stringAttributeStride: value.stringAttributeStride,
    dictionaryStart: value.dictionaryStart,
    dictionaryValues: value.dictionaryValues,
    geometryKinds: value.geometryKinds,
    geometryCoordinates: value.geometryCoordinates,
    geometryPartEnds: value.geometryPartEnds,
    geometryGroupEnds: value.geometryGroupEnds,
    geometryRecordEnds: value.geometryRecordEnds,
    deletedHandles: value.deletedHandles,
  };
}

export function parseSceneInterestCommand(
  value: unknown,
): SceneInterestCommand | null {
  if (!isRecord(value)) return null;
  const envelope = sceneProtocolEnvelope(value);
  if (
    !envelope ||
    value.type !== SceneInterestCommandType.Selection ||
    !isRenderSelectionSnapshot(value.selection)
  ) {
    return null;
  }
  return {
    ...envelope,
    type: SceneInterestCommandType.Selection,
    selection: value.selection,
  };
}

export function sceneDataTransfers(
  command: SceneDataCommand,
): readonly Transferable[] {
  if (command.type === SceneDataCommandType.Bind) return [];
  if (command.type === SceneDataCommandType.SelectionOverlay) return [];
  if (command.type === SceneDataCommandType.SourceSearch) {
    return [command.handles.buffer];
  }
  return [
    command.handles.buffer,
    command.positions.buffer,
    command.unitVectors.buffer,
    command.timestamps.buffer,
    command.attributes.buffer,
    command.stringAttributes.buffer,
    command.geometryKinds.buffer,
    command.geometryCoordinates.buffer,
    command.geometryPartEnds.buffer,
    command.geometryGroupEnds.buffer,
    command.geometryRecordEnds.buffer,
    command.deletedHandles.buffer,
  ];
}
