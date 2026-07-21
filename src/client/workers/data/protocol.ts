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

export const DATA_WORKER_PROTOCOL_VERSION: 5 = 5;

export type DataWorkerCacheEntry = Readonly<{
  key: string;
  value: unknown;
}>;

export type DataWorkerSourceStatus =
  | "loading"
  | "live"
  | "cached"
  | "error"
  | "empty";

export type DataWorkerSourceSnapshot = Readonly<{
  source: "earthquake";
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
      type: "refreshSource";
      source: "earthquake";
    }>
  | Readonly<{
      type: "getSourceEntity";
      source: "earthquake";
      id: string;
    }>
  | Readonly<{
      type: "querySource";
      source: "earthquake";
      query: EarthquakeUiQuery;
    }>
  | Readonly<{
      type: "setSourceSearch";
      source: "earthquake";
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
        type: "sourceQuery";
        source: "earthquake";
        sourceVersion: number;
        result: EarthquakeUiQueryResult;
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
    value === "empty"
  );
}

function parseSourceSnapshot(
  value: unknown,
): DataWorkerSourceSnapshot | null {
  if (
    !isRecord(value) ||
    value.source !== "earthquake" ||
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
    source: "earthquake",
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
    value.type === "refreshSource" &&
    value.source === "earthquake"
  ) {
    return { ...envelope, type: "refreshSource", source: "earthquake" };
  }

  if (
    value.type === "getSourceEntity" &&
    value.source === "earthquake" &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return {
      ...envelope,
      type: "getSourceEntity",
      source: "earthquake",
      id: value.id,
    };
  }

  if (value.type === "querySource" && value.source === "earthquake") {
    const query = parseEarthquakeUiQuery(value.query);
    if (!query) return null;
    return {
      ...envelope,
      type: "querySource",
      source: "earthquake",
      query,
    };
  }

  if (
    value.type === "setSourceSearch" &&
    value.source === "earthquake" &&
    (value.text === null || typeof value.text === "string")
  ) {
    return {
      ...envelope,
      type: "setSourceSearch",
      source: "earthquake",
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
    value.source === "earthquake" &&
    typeof value.sourceVersion === "number" &&
    Number.isSafeInteger(value.sourceVersion) &&
    value.sourceVersion >= 0
  ) {
    if (value.value === null) {
      return {
        ...envelope,
        type: "sourceEntity",
        source: "earthquake",
        sourceVersion: value.sourceVersion,
        value: null,
      };
    }
    const point = parseEarthquakePoint(value.value);
    if (!point) return null;
    return {
      ...envelope,
      type: "sourceEntity",
      source: "earthquake",
      sourceVersion: value.sourceVersion,
      value: point,
    };
  }
  if (
    value.type === "sourceQuery" &&
    value.source === "earthquake" &&
    typeof value.sourceVersion === "number" &&
    Number.isSafeInteger(value.sourceVersion) &&
    value.sourceVersion >= 0
  ) {
    const result = parseEarthquakeUiQueryResult(value.result);
    if (!result) return null;
    return {
      ...envelope,
      type: "sourceQuery",
      source: "earthquake",
      sourceVersion: value.sourceVersion,
      result,
    };
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
