import type { DataPoint } from "@/features/base/dataPoints";
import { isRenderSourceId, type RenderSourceId } from "@/workers/data/sourceIds";
import { isRecord } from "@shared/geo";

export const RENDER_DATA_PROTOCOL_VERSION = 5 as const;

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
  | Readonly<{
      type: "pointsRebase";
      source: RenderSourceId;
      points: readonly DataPoint[];
    }>
  | (Readonly<{ type: "earthquakeRebase" }> & PackedEarthquakeRenderData)
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

// ── Shared field checks ──────────────────────────────────────────────

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string") return null;
    ids.push(id);
  }
  return ids;
}

/**
 * Both sides are our own workers, so this confirms the lanes line up rather
 * than re-deriving trust: a short lane would read past its end mid-frame.
 */
function lanesMatch(
  count: number,
  lanes: readonly (readonly [ArrayLike<number>, number])[],
): boolean {
  return lanes.every(([lane, stride]) => lane.length === count * stride);
}

function parseSearch(
  envelope: RenderDataEnvelope,
  type: "earthquakeSearch" | "fireSearch",
  value: Readonly<Record<string, unknown>>,
): RenderDataCommand | null {
  if (value.matchingIds === null) {
    return { ...envelope, type, matchingIds: null };
  }
  const matchingIds = parseIds(value.matchingIds);
  return matchingIds ? { ...envelope, type, matchingIds } : null;
}

function parseEarthquakeRebase(
  envelope: RenderDataEnvelope,
  value: Readonly<Record<string, unknown>>,
): RenderDataCommand | null {
  const { positions, unitVectors, magnitudes, timestamps } = value;
  const ids = parseIds(value.ids);
  if (
    !ids ||
    !(positions instanceof Float64Array) ||
    !(unitVectors instanceof Float32Array) ||
    !(magnitudes instanceof Float32Array) ||
    !(timestamps instanceof Float64Array) ||
    !lanesMatch(ids.length, [
      [positions, EARTHQUAKE_POSITION_COMPONENTS],
      [unitVectors, EARTHQUAKE_UNIT_VECTOR_COMPONENTS],
      [magnitudes, 1],
      [timestamps, 1],
    ])
  ) {
    return null;
  }
  return {
    ...envelope,
    type: "earthquakeRebase",
    ids,
    positions,
    unitVectors,
    magnitudes,
    timestamps,
  };
}

function parseFireRebase(
  envelope: RenderDataEnvelope,
  value: Readonly<Record<string, unknown>>,
): RenderDataCommand | null {
  const { positions, unitVectors, frp, timestamps, confidences } = value;
  const ids = parseIds(value.ids);
  if (
    !ids ||
    !(positions instanceof Float64Array) ||
    !(unitVectors instanceof Float32Array) ||
    !(frp instanceof Float32Array) ||
    !(timestamps instanceof Float64Array) ||
    !(confidences instanceof Uint8Array) ||
    !lanesMatch(ids.length, [
      [positions, PACKED_POSITION_COMPONENTS],
      [unitVectors, PACKED_UNIT_VECTOR_COMPONENTS],
      [frp, 1],
      [timestamps, 1],
      [confidences, 1],
    ])
  ) {
    return null;
  }
  return {
    ...envelope,
    type: "fireRebase",
    ids,
    positions,
    unitVectors,
    frp,
    timestamps,
    confidences,
  };
}

/**
 * Geometry-rich, low-cardinality sources ride as objects rather than packed
 * lanes. Only the fields the projector reads are checked here; each draw site
 * already guards its own payload.
 */
function isRenderPoint(value: unknown): value is DataPoint {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon) &&
    isRecord(value.data)
  );
}

function parsePointsRebase(
  envelope: RenderDataEnvelope,
  value: Readonly<Record<string, unknown>>,
): RenderDataCommand | null {
  if (!isRenderSourceId(value.source) || !Array.isArray(value.points)) {
    return null;
  }
  const points: DataPoint[] = [];
  for (const point of value.points) {
    if (!isRenderPoint(point)) return null;
    points.push(point);
  }
  return { ...envelope, type: "pointsRebase", source: value.source, points };
}

export function parseRenderDataCommand(
  value: unknown,
): RenderDataCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;

  switch (value.type) {
    case "bind":
      return { ...envelope, type: "bind" };
    case "earthquakeSearch":
    case "fireSearch":
      return parseSearch(envelope, value.type, value);
    case "pointsRebase":
      return parsePointsRebase(envelope, value);
    case "earthquakeRebase":
      return parseEarthquakeRebase(envelope, value);
    case "fireRebase":
      return parseFireRebase(envelope, value);
    default:
      return null;
  }
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
