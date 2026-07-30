import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { isRecord, parseGeoPoint } from "@shared/geo";

export enum RenderDataProtocolVersion {
  Current = 8,
}

export enum RenderDataCommandType {
  Bind = "bind",
  PointsRebase = "pointsRebase",
}

enum RenderDataSequence {
  Minimum = 1,
}

export type LegacyPointSourceId = Domain.Cyclones;

type RenderDataEnvelope = Readonly<{
  protocolVersion: RenderDataProtocolVersion;
  sessionId: string;
  sequence: number;
}>;

export type RenderDataCommandBody =
  | Readonly<{ type: RenderDataCommandType.Bind }>
  | Readonly<{
      type: RenderDataCommandType.PointsRebase;
      source: LegacyPointSourceId;
      points: readonly DataPoint[];
    }>;

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

/** The final legacy object source remains until its composite scene migration. */
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
  return value === Domain.Cyclones;
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
    case RenderDataCommandType.PointsRebase:
      return parsePointsRebase(envelope, value);
    default:
      return null;
  }
}
