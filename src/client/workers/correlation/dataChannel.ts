import type { DataPoint } from "@/features/base/dataPoints";
import {
  isQueryableSourceId,
  parseQueryableSourceList,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import { isRecord } from "@shared/geo";

export enum CorrelationDataProtocolVersion {
  Current = 2,
}

export enum CorrelationDataCommandType {
  Bind = "bind",
  SourceRebase = "sourceRebase",
}

type CorrelationDataEnvelope = Readonly<{
  protocolVersion: CorrelationDataProtocolVersion;
  sessionId: string;
  sequence: number;
}>;

export type CorrelationDataCommandBody =
  | Readonly<{ type: CorrelationDataCommandType.Bind }>
  | Readonly<{
      type: CorrelationDataCommandType.SourceRebase;
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
    protocolVersion: CorrelationDataProtocolVersion.Current,
    sessionId,
    sequence,
  };
}

function parseEnvelope(
  value: Record<string, unknown>,
): CorrelationDataEnvelope | null {
  if (
    value.protocolVersion !== CorrelationDataProtocolVersion.Current ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1
  ) {
    return null;
  }
  return {
    protocolVersion: CorrelationDataProtocolVersion.Current,
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

  if (value.type === CorrelationDataCommandType.Bind) {
    return { ...envelope, type: CorrelationDataCommandType.Bind };
  }
  if (
    value.type !== CorrelationDataCommandType.SourceRebase ||
    !isQueryableSourceId(value.source)
  ) {
    return null;
  }
  const points = parseQueryableSourceList(value.source, value.points);
  return points
    ? {
        ...envelope,
        type: CorrelationDataCommandType.SourceRebase,
        source: value.source,
        points,
      }
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
