import { isRecord } from "@shared/geo";
import {
  isRenderSourceId,
  type RenderSourceId,
} from "@/workers/data/sourceIds";

export const SCENE_DATA_PROTOCOL_VERSION = 1 as const;

export type ScenePatchKind = "rebase" | "patch";

type TransferUint32Array = Uint32Array<ArrayBuffer>;
type TransferFloat32Array = Float32Array<ArrayBuffer>;

type ScenePatchBuffers = Readonly<{
  handles: TransferUint32Array;
  ids: readonly string[];
  positions: TransferFloat32Array;
  unitVectors: TransferFloat32Array;
  attributes: TransferFloat32Array;
  attributeStride: number;
  stringAttributes: TransferUint32Array;
  stringAttributeStride: number;
  dictionaryStart: number;
  dictionaryValues: readonly string[];
  deletedHandles: TransferUint32Array;
}>;

export type SceneSourcePatch = Readonly<{
  type: "sourcePatch";
  source: RenderSourceId;
  sourceVersion: number;
  kind: ScenePatchKind;
}> &
  ScenePatchBuffers;

export type SceneDataCommandBody =
  | Readonly<{ type: "bind" }>
  | SceneSourcePatch;

export type SceneDataEnvelope = Readonly<{
  protocolVersion: typeof SCENE_DATA_PROTOCOL_VERSION;
  sessionId: string;
  sequence: number;
}>;

export type SceneDataCommand = SceneDataCommandBody & SceneDataEnvelope;

export type SceneDataProtocolState = {
  sessionId: string;
  sequence: number;
};

function isPositiveSequence(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isSourceVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
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

function hasValidPatchBuffers(
  value: Readonly<Record<string, unknown>>,
): value is Readonly<Record<string, unknown>> & ScenePatchBuffers {
  const attributeStride = value.attributeStride;
  const stringAttributeStride = value.stringAttributeStride;
  const dictionaryStart = value.dictionaryStart;
  if (
    !isTransferUint32Array(value.handles) ||
    !isStringArray(value.ids) ||
    !isTransferFloat32Array(value.positions) ||
    !isTransferFloat32Array(value.unitVectors) ||
    !isTransferFloat32Array(value.attributes) ||
    !isTransferUint32Array(value.stringAttributes) ||
    !isTransferUint32Array(value.deletedHandles) ||
    typeof attributeStride !== "number" ||
    !Number.isSafeInteger(attributeStride) ||
    attributeStride < 0 ||
    typeof stringAttributeStride !== "number" ||
    !Number.isSafeInteger(stringAttributeStride) ||
    stringAttributeStride < 0 ||
    typeof dictionaryStart !== "number" ||
    !Number.isSafeInteger(dictionaryStart) ||
    dictionaryStart < 0
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
    value.ids.length === count &&
    value.positions.length === count * 2 &&
    value.unitVectors.length === count * 3 &&
    value.attributes.length === count * attributeStride &&
    value.stringAttributes.length ===
      count * stringAttributeStride &&
    value.stringAttributes.every(
      (index) =>
        index <=
        dictionaryStart + dictionaryValues.length,
    ) &&
    new Set(dictionaryValues).size === dictionaryValues.length &&
    new Set(value.handles).size === count
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
    protocolVersion: SCENE_DATA_PROTOCOL_VERSION,
    sessionId,
    sequence,
  };
}

export function parseSceneDataCommand(
  value: unknown,
): SceneDataCommand | null {
  if (
    !isRecord(value) ||
    value.protocolVersion !== SCENE_DATA_PROTOCOL_VERSION ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    !isPositiveSequence(value.sequence)
  ) {
    return null;
  }

  const envelope: SceneDataEnvelope = {
    protocolVersion: SCENE_DATA_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    sequence: value.sequence,
  };

  if (value.type === "bind") {
    return { ...envelope, type: "bind" };
  }

  if (
    value.type !== "sourcePatch" ||
    !isRenderSourceId(value.source) ||
    !isSourceVersion(value.sourceVersion) ||
    (value.kind !== "rebase" && value.kind !== "patch") ||
    !hasValidPatchBuffers(value) ||
    (value.kind === "rebase" && value.dictionaryStart !== 0)
  ) {
    return null;
  }

  return {
    ...envelope,
    type: "sourcePatch",
    source: value.source,
    sourceVersion: value.sourceVersion,
    kind: value.kind,
    handles: value.handles,
    ids: value.ids,
    positions: value.positions,
    unitVectors: value.unitVectors,
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
  if (command.type === "bind") return [];
  return [
    command.handles.buffer,
    command.positions.buffer,
    command.unitVectors.buffer,
    command.attributes.buffer,
    command.stringAttributes.buffer,
    command.deletedHandles.buffer,
  ];
}

export function acceptSceneDataCommand(
  state: SceneDataProtocolState,
  command: SceneDataCommand,
): boolean {
  if (
    command.sessionId !== state.sessionId ||
    command.sequence <= state.sequence
  ) {
    return false;
  }
  state.sequence = command.sequence;
  return true;
}
