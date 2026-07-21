import { parseFirePoint, type FirePoint } from "@/features/environmental/fires/data/source";
import { parseFireUiQuery, parseFireUiQueryResult, type FireUiQuery, type FireUiQueryResult } from "@/features/environmental/fires/data/uiQueries";
import {
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  parseEarthquakeUiQuery,
  parseEarthquakeUiQueryResult,
  type EarthquakeUiQuery,
  type EarthquakeUiQueryResult,
} from "@/features/environmental/earthquake/data/uiQueries";
import { isRecord } from "@shared/geo";
import { isDataSourceId, type DataSourceId } from "@/workers/data/sourceIds";

export const DATA_WORKER_PROTOCOL_VERSION: 7 = 7;

export type DataWorkerCacheEntry = Readonly<{
  key: string;
  value: unknown;
}>;

export type DataWorkerPointSource = DataSourceId;
export type DataWorkerQueryableSource = "earthquake" | "fire";

export type DataWorkerSourceStatus =
  | "loading"
  | "live"
  | "cached"
  | "error"
  | "empty"
  | "unavailable";

export type DataWorkerSourceSnapshot = Readonly<{
  source: DataWorkerPointSource;
  version: number;
  status: DataWorkerSourceStatus;
  loading: boolean;
  count: number;
  lastUpdatedAt: number | null;
  error: string | null;
}>;

type DataWorkerEnvelope = Readonly<{
  protocolVersion: typeof DATA_WORKER_PROTOCOL_VERSION;
  requestId: number | null;
}>;

export type DataWorkerCommandBody =
  | Readonly<{ type: "init" }>
  | Readonly<{
      type: "connectRender";
      port: MessagePort;
      renderSessionId: string;
    }>
  | Readonly<{
      type: "connectCorrelation";
      port: MessagePort;
      correlationSessionId: string;
    }>
  | Readonly<{
      type: "refreshSource";
      source: DataWorkerPointSource;
    }>
  | Readonly<{
      type: "getSourceEntity";
      source: DataWorkerQueryableSource;
      id: string;
    }>
  | Readonly<{
      type: "querySource";
      source: "earthquake";
      query: EarthquakeUiQuery;
    }>
  | Readonly<{
      type: "querySource";
      source: "fire";
      query: FireUiQuery;
    }>
  | Readonly<{
      type: "setSourceSearch";
      source: DataWorkerQueryableSource;
      text: string | null;
    }>
  | Readonly<{ type: "get"; key: string }>
  | Readonly<{ type: "set"; key: string; value: unknown }>
  | Readonly<{ type: "setDeferred"; key: string; value: unknown }>
  | Readonly<{ type: "importJson"; key: string; json: string }>
  | Readonly<{ type: "delete"; key: string }>
  | Readonly<{ type: "clear" }>
  | Readonly<{ type: "flush" }>
  | Readonly<{ type: "estimate"; key: string }>;

type WithEnvelope<T> = T extends object ? T & DataWorkerEnvelope : never;

export type DataWorkerCommand = WithEnvelope<DataWorkerCommandBody>;

export type DataWorkerEvent =
  | (DataWorkerEnvelope &
      Readonly<{
        type: "ready";
        entries: readonly DataWorkerCacheEntry[];
      }>)
  | (DataWorkerEnvelope &
      Readonly<{ type: "value"; value: unknown | null }>)
  | (DataWorkerEnvelope & Readonly<{ type: "size"; bytes: number }>)
  | (DataWorkerEnvelope & Readonly<{ type: "complete" }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: "sourceSnapshot";
        snapshot: DataWorkerSourceSnapshot;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: "sourceEntity";
        source: "earthquake";
        sourceVersion: number;
        value: EarthquakePoint | null;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: "sourceEntity";
        source: "fire";
        sourceVersion: number;
        value: FirePoint | null;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: "sourceQuery";
        source: "earthquake";
        sourceVersion: number;
        result: EarthquakeUiQueryResult;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: "sourceQuery";
        source: "fire";
        sourceVersion: number;
        result: FireUiQueryResult;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{ type: "error"; message: string }>);

export function createDataWorkerCommand<T extends DataWorkerCommandBody>(
  body: T,
  requestId: number | null,
): T & DataWorkerEnvelope {
  return {
    ...body,
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId,
  };
}

function parseEnvelope(
  value: Readonly<Record<string, unknown>>,
): DataWorkerEnvelope | null {
  if (value.protocolVersion !== DATA_WORKER_PROTOCOL_VERSION) return null;
  const requestId = value.requestId;
  if (
    requestId !== null &&
    (typeof requestId !== "number" ||
      !Number.isSafeInteger(requestId) ||
      requestId < 0)
  ) {
    return null;
  }
  return {
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId,
  };
}
function isMessagePort(value: unknown): value is MessagePort {
  return (
    isRecord(value) &&
    typeof value.postMessage === "function" &&
    typeof value.start === "function" &&
    typeof value.close === "function"
  );
}

function isSourceStatus(value: unknown): value is DataWorkerSourceStatus {
  return (
    value === "loading" ||
    value === "live" ||
    value === "cached" ||
    value === "error" ||
    value === "empty" ||
    value === "unavailable"
  );
}

function parseSourceSnapshot(
  value: unknown,
): DataWorkerSourceSnapshot | null {
  if (
    !isRecord(value) ||
    !isDataSourceId(value.source) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0 ||
    !isSourceStatus(value.status) ||
    typeof value.loading !== "boolean" ||
    typeof value.count !== "number" ||
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    (value.lastUpdatedAt !== null &&
      (typeof value.lastUpdatedAt !== "number" ||
        !Number.isFinite(value.lastUpdatedAt) ||
        value.lastUpdatedAt < 0)) ||
    (value.error !== null && typeof value.error !== "string")
  ) {
    return null;
  }
  return {
    source: value.source,
    version: value.version,
    status: value.status,
    loading: value.loading,
    count: value.count,
    lastUpdatedAt: value.lastUpdatedAt,
    error: value.error,
  };
}

export function parseDataWorkerCommand(
  value: unknown,
): DataWorkerCommand | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;

  if (
    value.type === "connectRender" &&
    isMessagePort(value.port) &&
    typeof value.renderSessionId === "string" &&
    value.renderSessionId.length > 0
  ) {
    return {
      ...envelope,
      type: "connectRender",
      port: value.port,
      renderSessionId: value.renderSessionId,
    };
  }

  if (
    value.type === "connectCorrelation" &&
    isMessagePort(value.port) &&
    typeof value.correlationSessionId === "string" &&
    value.correlationSessionId.length > 0
  ) {
    return {
      ...envelope,
      type: "connectCorrelation",
      port: value.port,
      correlationSessionId: value.correlationSessionId,
    };
  }

  if (
    value.type === "refreshSource" &&
    isDataSourceId(value.source)
  ) {
    return { ...envelope, type: "refreshSource", source: value.source };
  }

  if (
    value.type === "getSourceEntity" &&
(value.source === "earthquake" || value.source === "fire") &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return {
      ...envelope,
      type: "getSourceEntity",
      source: value.source,
      id: value.id,
    };
  }

  if (value.type === "querySource" && value.source === "earthquake") {
    const query = parseEarthquakeUiQuery(value.query);
    if (!query) return null;
    return { ...envelope, type: "querySource", source: "earthquake", query };
  }
  if (value.type === "querySource" && value.source === "fire") {
    const query = parseFireUiQuery(value.query);
    if (!query) return null;
    return { ...envelope, type: "querySource", source: "fire", query };
  }

  if (
    value.type === "setSourceSearch" &&
(value.source === "earthquake" || value.source === "fire") &&
    (value.text === null || typeof value.text === "string")
  ) {
    return {
      ...envelope,
      type: "setSourceSearch",
      source: value.source,
      text: value.text,
    };
  }

  if (
    value.type === "init" ||
    value.type === "clear" ||
    value.type === "flush"
  ) {
    return { ...envelope, type: value.type };
  }

  if (
    (value.type === "get" ||
      value.type === "delete" ||
      value.type === "estimate") &&
    typeof value.key === "string"
  ) {
    return { ...envelope, type: value.type, key: value.key };
  }

  if (
    (value.type === "set" || value.type === "setDeferred") &&
    typeof value.key === "string"
  ) {
    return {
      ...envelope,
      type: value.type,
      key: value.key,
      value: value.value,
    };
  }

  if (
    value.type === "importJson" &&
    typeof value.key === "string" &&
    typeof value.json === "string"
  ) {
    return {
      ...envelope,
      type: "importJson",
      key: value.key,
      json: value.json,
    };
  }

  return null;
}

export function parseDataWorkerEvent(value: unknown): DataWorkerEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;

  if (value.type === "sourceSnapshot") {
    const snapshot = parseSourceSnapshot(value.snapshot);
    if (!snapshot) return null;
    return {
      ...envelope,
      type: "sourceSnapshot",
      snapshot,
    };
  }
  if (
    value.type === "sourceEntity" &&
    (value.source === "earthquake" || value.source === "fire") &&
    typeof value.sourceVersion === "number" &&
    Number.isSafeInteger(value.sourceVersion) &&
    value.sourceVersion >= 0
  ) {
    if (value.value === null) {
      return {
        ...envelope,
        type: "sourceEntity",
        source: value.source,
        sourceVersion: value.sourceVersion,
        value: null,
      };
    }
    if (value.source === "earthquake") {
      const point = parseEarthquakePoint(value.value);
      return point
        ? { ...envelope, type: "sourceEntity", source: "earthquake", sourceVersion: value.sourceVersion, value: point }
        : null;
    }
    const point = parseFirePoint(value.value);
    return point
      ? { ...envelope, type: "sourceEntity", source: "fire", sourceVersion: value.sourceVersion, value: point }
      : null;
  }
  if (
    value.type === "sourceQuery" &&
    (value.source === "earthquake" || value.source === "fire") &&
    typeof value.sourceVersion === "number" &&
    Number.isSafeInteger(value.sourceVersion) &&
    value.sourceVersion >= 0
  ) {
    if (value.source === "earthquake") {
      const result = parseEarthquakeUiQueryResult(value.result);
      return result
        ? { ...envelope, type: "sourceQuery", source: "earthquake", sourceVersion: value.sourceVersion, result }
        : null;
    }
    const result = parseFireUiQueryResult(value.result);
    return result
      ? { ...envelope, type: "sourceQuery", source: "fire", sourceVersion: value.sourceVersion, result }
      : null;
  }
  if (value.type === "complete") {
    return { ...envelope, type: "complete" };
  }
  if (value.type === "error" && typeof value.message === "string") {
    return { ...envelope, type: "error", message: value.message };
  }
  if (
    value.type === "size" &&
    typeof value.bytes === "number" &&
    Number.isFinite(value.bytes) &&
    value.bytes >= 0
  ) {
    return { ...envelope, type: "size", bytes: value.bytes };
  }
  if (value.type === "value") {
    return {
      ...envelope,
      type: "value",
      value: value.value ?? null,
    };
  }
  if (value.type !== "ready" || !Array.isArray(value.entries)) return null;

  const entries: DataWorkerCacheEntry[] = [];
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.key !== "string") return null;
    entries.push({ key: entry.key, value: entry.value });
  }
  return { ...envelope, type: "ready", entries };
}
