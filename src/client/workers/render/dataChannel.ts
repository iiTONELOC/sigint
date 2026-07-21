import { isRecord } from "@shared/geo";

export const RENDER_DATA_PROTOCOL_VERSION: 4 = 4;

export const PACKED_POSITION_COMPONENTS = 2;
export const PACKED_UNIT_VECTOR_COMPONENTS = 3;
export const EARTHQUAKE_POSITION_COMPONENTS = PACKED_POSITION_COMPONENTS;
export const EARTHQUAKE_UNIT_VECTOR_COMPONENTS =
  PACKED_UNIT_VECTOR_COMPONENTS;

type RenderDataEnvelope = Readonly<{
  protocolVersion: typeof RENDER_DATA_PROTOCOL_VERSION;
  sessionId: string;
  sequence: number;
}>;

export type PackedEarthquakeRenderData = Readonly<{
  ids: readonly string[];
  positions: Float64Array;
  unitVectors: Float32Array;
  magnitudes: Float32Array;
  timestamps: Float64Array;
}>;

export type PackedFireRenderData = Readonly<{
  ids: readonly string[];
  positions: Float64Array;
  unitVectors: Float32Array;
  frp: Float32Array;
  timestamps: Float64Array;
  confidences: Uint8Array;
}>;

export type RenderDataCommandBody =
  | Readonly<{ type: "bind" }>
  | Readonly<{
      type: "earthquakeSearch" | "fireSearch";
      matchingIds: readonly string[] | null;
    }>
  | (Readonly<{ type: "earthquakeRebase" }> &
      PackedEarthquakeRenderData)
  | (Readonly<{ type: "fireRebase" }> & PackedFireRenderData);

type WithEnvelope<T> = T extends object ? T & RenderDataEnvelope : never;

export type RenderDataCommand = WithEnvelope<RenderDataCommandBody>;

export type RenderDataProtocolState = {
  sessionId: string;
  sequence: number;
};

export function createRenderDataCommand<T extends RenderDataCommandBody>(
  body: T,
  sessionId: string,
  sequence: number,
): T & RenderDataEnvelope {
  return {
    ...body,
    protocolVersion: RENDER_DATA_PROTOCOL_VERSION,
    sessionId,
    sequence,
  };
}

function parseEnvelope(
  value: Readonly<Record<string, unknown>>,
): RenderDataEnvelope | null {
  if (
    value.protocolVersion !== RENDER_DATA_PROTOCOL_VERSION ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1
  ) {
    return null;
  }
  return {
    protocolVersion: RENDER_DATA_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    sequence: value.sequence,
  };
}

export function parseRenderDataCommand(
  value: unknown,
): RenderDataCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;
  if (value.type === "bind") return { ...envelope, type: "bind" };
  if (
    value.type === "earthquakeSearch" ||
    value.type === "fireSearch"
  ) {
    if (value.matchingIds === null) {
      return { ...envelope, type: value.type, matchingIds: null };
    }
    if (!Array.isArray(value.matchingIds)) return null;
    const matchingIds: string[] = [];
    for (const id of value.matchingIds) {
      if (typeof id !== "string") return null;
      matchingIds.push(id);
    }
    return { ...envelope, type: value.type, matchingIds };
  }
  if (value.type === "fireRebase") {
    if (
      !Array.isArray(value.ids) ||
      !(value.positions instanceof Float64Array) ||
      !(value.unitVectors instanceof Float32Array) ||
      !(value.frp instanceof Float32Array) ||
      !(value.timestamps instanceof Float64Array) ||
      !(value.confidences instanceof Uint8Array)
    ) {
      return null;
    }
    const ids: string[] = [];
    for (const id of value.ids) {
      if (typeof id !== "string") return null;
      ids.push(id);
    }
    const count = ids.length;
    if (
      value.positions.length !== count * PACKED_POSITION_COMPONENTS ||
      value.unitVectors.length !== count * PACKED_UNIT_VECTOR_COMPONENTS ||
      value.frp.length !== count ||
      value.timestamps.length !== count ||
      value.confidences.length !== count
    ) {
      return null;
    }
    return {
      ...envelope,
      type: "fireRebase",
      ids,
      positions: value.positions,
      unitVectors: value.unitVectors,
      frp: value.frp,
      timestamps: value.timestamps,
      confidences: value.confidences,
    };
  }
  if (
    value.type !== "earthquakeRebase" ||
    !Array.isArray(value.ids) ||
    !(value.positions instanceof Float64Array) ||
    !(value.unitVectors instanceof Float32Array) ||
    !(value.magnitudes instanceof Float32Array) ||
    !(value.timestamps instanceof Float64Array)
  ) {
    return null;
  }

  const ids: string[] = [];
  for (const id of value.ids) {
    if (typeof id !== "string") return null;
    ids.push(id);
  }
  const count = ids.length;
  if (
    value.positions.length !== count * EARTHQUAKE_POSITION_COMPONENTS ||
    value.unitVectors.length !== count * EARTHQUAKE_UNIT_VECTOR_COMPONENTS ||
    value.magnitudes.length !== count ||
    value.timestamps.length !== count
  ) {
    return null;
  }
  return {
    ...envelope,
    type: "earthquakeRebase",
    ids,
    positions: value.positions,
    unitVectors: value.unitVectors,
    magnitudes: value.magnitudes,
    timestamps: value.timestamps,
  };
}

export function acceptRenderDataCommand(
  state: RenderDataProtocolState,
  command: RenderDataCommand,
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
