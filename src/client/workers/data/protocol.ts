import { isRecord } from "@shared/geo";
import {
  parseTrailEntry,
  type TrailEntry,
} from "@/lib/geo/trails/trailStore";
import {
  QUERYABLE_SOURCE_CODECS,
  isQueryableSourceId,
  type QueryableSourceId,
  type QueryableSourceShapes,
} from "@/workers/data/queryableSources";
import { isDataSourceId, type DataSourceId } from "@/workers/data/sourceIds";

export const DATA_WORKER_PROTOCOL_VERSION = 8 as const;

export type DataWorkerCacheEntry = Readonly<{
  key: string;
  value: unknown;
}>;

export type DataWorkerPointSource = DataSourceId;
export type DataWorkerQueryableSource = QueryableSourceId;

type SourceEntityBody = {
  [TId in QueryableSourceId]: Readonly<{
    type: "sourceEntity";
    source: TId;
    sourceVersion: number;
    value: QueryableSourceShapes[TId]["entity"] | null;
  }>;
}[QueryableSourceId];

type SourceQueryBody = {
  [TId in QueryableSourceId]: Readonly<{
    type: "sourceQuery";
    source: TId;
    sourceVersion: number;
    result: QueryableSourceShapes[TId]["result"];
  }>;
}[QueryableSourceId];

type QuerySourceCommandBody = {
  [TId in QueryableSourceId]: Readonly<{
    type: "querySource";
    source: TId;
    query: QueryableSourceShapes[TId]["query"];
  }>;
}[QueryableSourceId];

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
      type: "listSourceEntities";
      source: DataWorkerPointSource;
    }>
  | Readonly<{
      type: "getSourceEntity";
      source: DataWorkerQueryableSource;
      id: string;
    }>
  | QuerySourceCommandBody
  | Readonly<{
      type: "setSourceSearch";
      source: DataWorkerQueryableSource;
      text: string | null;
    }>
  | Readonly<{ type: "getTrail"; id: string }>
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
      Readonly<{ type: "value"; value: unknown }>)
  | (DataWorkerEnvelope & Readonly<{ type: "size"; bytes: number }>)
  | (DataWorkerEnvelope & Readonly<{ type: "complete" }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: "sourceSnapshot";
        snapshot: DataWorkerSourceSnapshot;
      }>)
  | (DataWorkerEnvelope & SourceEntityBody)
  | (DataWorkerEnvelope & SourceQueryBody)
  | (DataWorkerEnvelope &
      Readonly<{ type: "trail"; id: string; entry: TrailEntry | null }>)
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

function parseSourceCommand(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerCommand | null {
  if (
    (value.type === "refreshSource" || value.type === "listSourceEntities") &&
    isDataSourceId(value.source)
  ) {
    return { ...envelope, type: value.type, source: value.source };
  }

  if (!isQueryableSourceId(value.source)) return null;

  if (
    value.type === "getSourceEntity" &&
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

  if (value.type === "querySource") {
    return QUERYABLE_SOURCE_CODECS[value.source].buildQueryCommand(
      envelope,
      value.query,
    );
  }

  if (
    value.type === "setSourceSearch" &&
    (value.text === null || typeof value.text === "string")
  ) {
    return {
      ...envelope,
      type: "setSourceSearch",
      source: value.source,
      text: value.text,
    };
  }

  return null;
}

function parseCacheCommand(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerCommand | null {
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
    value.type === "getTrail" &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return { ...envelope, type: "getTrail", id: value.id };
  }

  return null;
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

  const sourceCommand = parseSourceCommand(envelope, value);
  if (sourceCommand) return sourceCommand;

  const cacheCommand = parseCacheCommand(envelope, value);
  if (cacheCommand) return cacheCommand;

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

function isSourceVersion(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
}

function parseCacheEvent(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerEvent | null {
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
    return { ...envelope, type: "value", value: value.value ?? null };
  }
  if (value.type === "trail" && typeof value.id === "string") {
    return {
      ...envelope,
      type: "trail",
      id: value.id,
      entry:
        value.entry === null
          ? null
          : parseTrailEntry(value.id, value.entry),
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
    (value.type === "sourceEntity" || value.type === "sourceQuery") &&
    isQueryableSourceId(value.source) &&
    isSourceVersion(value.sourceVersion)
  ) {
    const codec = QUERYABLE_SOURCE_CODECS[value.source];
    return value.type === "sourceEntity"
      ? codec.buildEntityEvent(envelope, value.sourceVersion, value.value)
      : codec.buildQueryEvent(envelope, value.sourceVersion, value.result);
  }
  return parseCacheEvent(envelope, value);
}
