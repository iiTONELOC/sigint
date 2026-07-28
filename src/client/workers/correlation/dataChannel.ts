import type { DataPoint } from "@/features/base/dataPoints";
import {
  isQueryableSourceId,
  parseQueryableSourceList,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import { isRecord } from "@shared/geo";

export const CORRELATION_DATA_PROTOCOL_VERSION = 2 as const;

type CorrelationDataEnvelope = Readonly<{
  protocolVersion: typeof CORRELATION_DATA_PROTOCOL_VERSION;
  sessionId: string;
  sequence: number;
}>;

export type CorrelationDataCommandBody =
  | Readonly<{ type: "bind" }>
  | Readonly<{
      type: "sourceRebase";
      source: QueryableSourceId;
      points: readonly DataPoint[];
    }>;

type WithEnvelope<T> = T extends object
  ? T & CorrelationDataEnvelope
  : never;

export type CorrelationDataCommand =
  WithEnvelope<CorrelationDataCommandBody>;

export type CorrelationDataProtocolState = {
  sessionId: string;
  sequence: number;
};

export function createCorrelationDataCommand<
  T extends CorrelationDataCommandBody,
>(
  body: T,
  sessionId: string,
  sequence: number,
): T & CorrelationDataEnvelope {
  return {
    ...body,
    protocolVersion: CORRELATION_DATA_PROTOCOL_VERSION,
    sessionId,
    sequence,
  };
}

function parseEnvelope(
  value: Record<string, unknown>,
): CorrelationDataEnvelope | null {
  if (
    value.protocolVersion !== CORRELATION_DATA_PROTOCOL_VERSION ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1
  ) {
    return null;
  }
  return {
    protocolVersion: CORRELATION_DATA_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    sequence: value.sequence,
  };
}

export function parseCorrelationDataCommand(
  value: unknown,
): CorrelationDataCommand | null {
  if (!isRecord(value)) return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;

  if (value.type === "bind") return { ...envelope, type: "bind" };
  if (value.type !== "sourceRebase" || !isQueryableSourceId(value.source)) {
    return null;
  }
  const points = parseQueryableSourceList(value.source, value.points);
  return points
    ? { ...envelope, type: "sourceRebase", source: value.source, points }
    : null;
}

export function acceptCorrelationDataCommand(
  state: CorrelationDataProtocolState,
  command: CorrelationDataCommand,
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
