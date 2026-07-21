import {
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import { isRecord } from "@shared/geo";

export const CORRELATION_DATA_PROTOCOL_VERSION: 1 = 1;

type CorrelationDataEnvelope = Readonly<{
  protocolVersion: typeof CORRELATION_DATA_PROTOCOL_VERSION;
  sessionId: string;
  sequence: number;
}>;

export type CorrelationDataCommandBody =
  | Readonly<{ type: "bind" }>
  | Readonly<{ type: "fireRebase"; points: readonly FirePoint[] }>;

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

export function parseCorrelationDataCommand(
  value: unknown,
): CorrelationDataCommand | null {
  if (
    !isRecord(value) ||
    value.protocolVersion !== CORRELATION_DATA_PROTOCOL_VERSION ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1
  ) {
    return null;
  }
  const envelope: CorrelationDataEnvelope = {
    protocolVersion: CORRELATION_DATA_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    sequence: value.sequence,
  };
  if (value.type === "bind") return { ...envelope, type: "bind" };
  if (value.type !== "fireRebase" || !Array.isArray(value.points)) {
    return null;
  }
  const points: FirePoint[] = [];
  for (const candidate of value.points) {
    const point = parseFirePoint(candidate);
    if (!point) return null;
    points.push(point);
  }
  return { ...envelope, type: "fireRebase", points };
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
