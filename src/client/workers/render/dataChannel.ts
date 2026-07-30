import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { isRecord, parseGeoPoint } from "@shared/geo";

export enum RenderDataProtocolVersion {
  Current = 5,
}

export enum RenderDataCommandType {
  Bind = "bind",
  EarthquakeSearch = "earthquakeSearch",
  FireSearch = "fireSearch",
  PointsRebase = "pointsRebase",
  EarthquakeRebase = "earthquakeRebase",
  FireRebase = "fireRebase",
}

export enum RenderDataLaneComponentCount {
  Scalar = 1,
  Position = 2,
  UnitVector = 3,
}

enum RenderDataSequence {
  Minimum = 1,
}

export type LegacyPointSourceId =
  | Domain.Weather
  | Domain.Cyclones
  | Domain.CycloneWarnings;

type RenderDataEnvelope = Readonly<{
  protocolVersion: RenderDataProtocolVersion;
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
  | Readonly<{ type: RenderDataCommandType.Bind }>
  | Readonly<{
      type:
        | RenderDataCommandType.EarthquakeSearch
        | RenderDataCommandType.FireSearch;
      matchingIds: readonly string[] | null;
    }>
  | Readonly<{
      type: RenderDataCommandType.PointsRebase;
      source: LegacyPointSourceId;
      points: readonly DataPoint[];
    }>
  | (Readonly<{ type: RenderDataCommandType.EarthquakeRebase }> &
      PackedEarthquakeRenderData)
  | (Readonly<{ type: RenderDataCommandType.FireRebase }> &
      PackedFireRenderData);

type WithEnvelope<T> = T extends object ? T & RenderDataEnvelope : never;

export type RenderDataCommand = WithEnvelope<RenderDataCommandBody>;

export class RenderDataProtocolState {
  private readonly sessionId: string;
  private sequence = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  accept(command: RenderDataCommand): boolean {
    if (
      command.sessionId !== this.sessionId ||
      command.sequence <= this.sequence
    ) {
      return false;
    }
    this.sequence = command.sequence;
    return true;
  }

  lastSequence(): number {
    return this.sequence;
  }
}

export function createRenderDataCommand<T extends RenderDataCommandBody>(
  body: T,
  sessionId: string,
  sequence: number,
): T & RenderDataEnvelope {
  return {
    ...body,
    protocolVersion: RenderDataProtocolVersion.Current,
    sessionId,
    sequence,
  };
}

function parseEnvelope(
  value: Readonly<Record<string, unknown>>,
): RenderDataEnvelope | null {
  if (
    value.protocolVersion !== RenderDataProtocolVersion.Current ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < RenderDataSequence.Minimum
  ) {
    return null;
  }
  return {
    protocolVersion: RenderDataProtocolVersion.Current,
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
  type:
    | RenderDataCommandType.EarthquakeSearch
    | RenderDataCommandType.FireSearch,
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
      [positions, RenderDataLaneComponentCount.Position],
      [unitVectors, RenderDataLaneComponentCount.UnitVector],
      [magnitudes, RenderDataLaneComponentCount.Scalar],
      [timestamps, RenderDataLaneComponentCount.Scalar],
    ])
  ) {
    return null;
  }
  return {
    ...envelope,
    type: RenderDataCommandType.EarthquakeRebase,
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
      [positions, RenderDataLaneComponentCount.Position],
      [unitVectors, RenderDataLaneComponentCount.UnitVector],
      [frp, RenderDataLaneComponentCount.Scalar],
      [timestamps, RenderDataLaneComponentCount.Scalar],
      [confidences, RenderDataLaneComponentCount.Scalar],
    ])
  ) {
    return null;
  }
  return {
    ...envelope,
    type: RenderDataCommandType.FireRebase,
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
function hasRenderPosition(
  value: Readonly<Record<string, unknown>>,
): boolean {
  if (parseGeoPoint(value.position) !== null) return true;
  return (
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon)
  );
}

function isRenderPoint(value: unknown): value is DataPoint {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    hasRenderPosition(value) &&
    isRecord(value.data)
  );
}

function isLegacyPointSourceId(
  value: unknown,
): value is LegacyPointSourceId {
  return (
    value === Domain.Weather ||
    value === Domain.Cyclones ||
    value === Domain.CycloneWarnings
  );
}

function parsePointsRebase(
  envelope: RenderDataEnvelope,
  value: Readonly<Record<string, unknown>>,
): RenderDataCommand | null {
  if (
    !isLegacyPointSourceId(value.source) ||
    !Array.isArray(value.points)
  ) {
    return null;
  }
  const points: DataPoint[] = [];
  for (const point of value.points) {
    if (!isRenderPoint(point)) return null;
    points.push(point);
  }
  return {
    ...envelope,
    type: RenderDataCommandType.PointsRebase,
    source: value.source,
    points,
  };
}

export function parseRenderDataCommand(
  value: unknown,
): RenderDataCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;

  switch (value.type) {
    case RenderDataCommandType.Bind:
      return { ...envelope, type: RenderDataCommandType.Bind };
    case RenderDataCommandType.EarthquakeSearch:
    case RenderDataCommandType.FireSearch:
      return parseSearch(envelope, value.type, value);
    case RenderDataCommandType.PointsRebase:
      return parsePointsRebase(envelope, value);
    case RenderDataCommandType.EarthquakeRebase:
      return parseEarthquakeRebase(envelope, value);
    case RenderDataCommandType.FireRebase:
      return parseFireRebase(envelope, value);
    default:
      return null;
  }
}
