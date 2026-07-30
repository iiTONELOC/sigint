import { isRecord } from "@shared/geo";
import {
  isRenderSourceId,
  type RenderSourceId,
} from "@/workers/data/sourceIds";
import { DatasetPatchKind } from "@/workers/data/datasetStore";

export enum SceneDataProtocolVersion {
  Current = 1,
}

export enum SceneDataCommandType {
  Bind = "bind",
  SourcePatch = "sourcePatch",
}

type TransferUint32Array = Uint32Array<ArrayBuffer>;
type TransferFloat32Array = Float32Array<ArrayBuffer>;
type TransferFloat64Array = Float64Array<ArrayBuffer>;

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
}>;

export type SceneSourcePatch = Readonly<{
  type: SceneDataCommandType.SourcePatch;
  source: RenderSourceId;
  sourceVersion: number;
  kind: DatasetPatchKind;
}> &
  ScenePatchBuffers;

export type SceneDataCommandBody =
  | Readonly<{ type: SceneDataCommandType.Bind }>
  | SceneSourcePatch;

export type SceneDataEnvelope = Readonly<{
  protocolVersion: SceneDataProtocolVersion;
  sessionId: string;
  sequence: number;
}>;

export type SceneSourceCommand = SceneSourcePatch & SceneDataEnvelope;

export type SceneDataCommand =
  | (Readonly<{ type: SceneDataCommandType.Bind }> & SceneDataEnvelope)
  | SceneSourceCommand;

export class SceneDataProtocolState {
  readonly sessionId: string;
  private sequence = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  accept(command: SceneDataCommand): boolean {
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
    value.positions.length === count * 2 &&
    value.unitVectors.length === count * 3 &&
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
    new Set(value.sceneIds).size === count
  );
}

export function createSceneDataCommand<
  TBody extends SceneDataCommandBody,
>(
  body: TBody,
  sessionId: string,
  sequence: number,
): TBody & SceneDataEnvelope {
  return {
    ...body,
    protocolVersion: SceneDataProtocolVersion.Current,
    sessionId,
    sequence,
  };
}

export function parseSceneDataCommand(
  value: unknown,
): SceneDataCommand | null {
  if (
    !isRecord(value) ||
    value.protocolVersion !== SceneDataProtocolVersion.Current ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    !isPositiveSequence(value.sequence)
  ) {
    return null;
  }

  const envelope: SceneDataEnvelope = {
    protocolVersion: SceneDataProtocolVersion.Current,
    sessionId: value.sessionId,
    sequence: value.sequence,
  };

  if (value.type === SceneDataCommandType.Bind) {
    return { ...envelope, type: SceneDataCommandType.Bind };
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
    deletedHandles: value.deletedHandles,
  };
}

export function sceneDataTransfers(
  command: SceneDataCommand,
): readonly Transferable[] {
  if (command.type === SceneDataCommandType.Bind) return [];
  return [
    command.handles.buffer,
    command.positions.buffer,
    command.unitVectors.buffer,
    command.timestamps.buffer,
    command.attributes.buffer,
    command.stringAttributes.buffer,
    command.deletedHandles.buffer,
  ];
}
