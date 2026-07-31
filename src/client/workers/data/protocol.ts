import { isRecord } from "@shared/geo";
import type { DataPoint } from "@/features/base/dataPoints";
import { isSourceStatus, SourceStatus } from "@shared/domain/sourceStatus";
import type { SourceId } from "@shared/source";
import {
  parseTrailEntry,
  type TrailEntry,
} from "@/lib/geo/trails/trailStore";
import {
  QUERYABLE_SOURCE_CODECS,
  isQueryableSourceId,
  type QueryableSourceEntities,
  type QueryableSourceId,
  type QueryableSourceShapes,
} from "@/workers/data/queryableSources";
import { isSourceId } from "@/workers/data/sourceIds";
import type { PointUiQueryResult } from "@/workers/data/uiQuery";
import {
  parseAircraftDossier,
  type AircraftDossier,
} from "@shared/domain/aircraftDossier";
import {
  DataWorkerMessageType,
  DataWorkerProtocolVersion,
} from "@/workers/data/messageType";

export {
  DataWorkerMessageType,
  DataWorkerProtocolVersion,
};

export type DataWorkerCacheEntry = Readonly<{
  key: string;
  value: unknown;
}>;

export type DataWorkerPointSource = SourceId;
export type DataWorkerQueryableSource = QueryableSourceId;

export type AnySourceEntity =
  DataPoint;

export type AnySourceQueryResult = PointUiQueryResult<
  QueryableSourceEntities[QueryableSourceId]
>;

type SourceEntityBody = Readonly<{
  type: DataWorkerMessageType.SourceEntity;
  source: QueryableSourceId;
  sourceVersion: number;
  value: AnySourceEntity | null;
}>;

type SourceQueryBody = Readonly<{
  type: DataWorkerMessageType.SourceQuery;
  source: QueryableSourceId;
  sourceVersion: number;
  result: AnySourceQueryResult;
}>;

type QuerySourceCommandBody = {
  [TId in QueryableSourceId]: Readonly<{
    type: DataWorkerMessageType.QuerySource;
    source: TId;
    query: QueryableSourceShapes[TId]["query"];
  }>;
}[QueryableSourceId];

export type DataWorkerSourceSnapshot = Readonly<{
  source: DataWorkerPointSource;
  version: number;
  status: SourceStatus;
  loading: boolean;
  count: number;
  lastUpdatedAt: number | null;
  error: string | null;
}>;

export type DataWorkerEnvelope = Readonly<{
  protocolVersion: DataWorkerProtocolVersion;
  requestId: number | null;
}>;

export type DataWorkerCommandBody =
  | Readonly<{ type: DataWorkerMessageType.Init }>
  | Readonly<{
      type: DataWorkerMessageType.ConnectRender;
      port: MessagePort;
      renderSessionId: string;
    }>
  | Readonly<{
      type: DataWorkerMessageType.ConnectCorrelation;
      port: MessagePort;
      correlationSessionId: string;
    }>
  | Readonly<{
      type: DataWorkerMessageType.RefreshSource;
      source: DataWorkerPointSource;
    }>
  | Readonly<{
      type: DataWorkerMessageType.ListSourceEntities;
      source: DataWorkerPointSource;
    }>
  | Readonly<{
      type: DataWorkerMessageType.GetSourceEntity;
      source: DataWorkerQueryableSource;
      id: string;
    }>
  | QuerySourceCommandBody
  | Readonly<{ type: DataWorkerMessageType.GetTrail; id: string }>
  | Readonly<{
      type: DataWorkerMessageType.GetAircraftDossier;
      entityId: string;
    }>
  | Readonly<{ type: DataWorkerMessageType.Get; key: string }>
  | Readonly<{
      type: DataWorkerMessageType.Set;
      key: string;
      value: unknown;
    }>
  | Readonly<{
      type: DataWorkerMessageType.SetDeferred;
      key: string;
      value: unknown;
    }>
  | Readonly<{
      type: DataWorkerMessageType.ImportJson;
      key: string;
      json: string;
    }>
  | Readonly<{ type: DataWorkerMessageType.Delete; key: string }>
  | Readonly<{ type: DataWorkerMessageType.Clear }>
  | Readonly<{ type: DataWorkerMessageType.Flush }>
  | Readonly<{ type: DataWorkerMessageType.Estimate; key: string }>;

type WithEnvelope<T> = T extends object ? T & DataWorkerEnvelope : never;

export type DataWorkerCommand = WithEnvelope<DataWorkerCommandBody>;

export type DataWorkerEvent =
  | (DataWorkerEnvelope &
      Readonly<{
        type: DataWorkerMessageType.Ready;
        entries: readonly DataWorkerCacheEntry[];
      }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: DataWorkerMessageType.Value;
        value: unknown;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{ type: DataWorkerMessageType.Size; bytes: number }>)
  | (DataWorkerEnvelope &
      Readonly<{ type: DataWorkerMessageType.Complete }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: DataWorkerMessageType.SourceSnapshot;
        snapshot: DataWorkerSourceSnapshot;
      }>)
  | (DataWorkerEnvelope & SourceEntityBody)
  | (DataWorkerEnvelope & SourceQueryBody)
  | (DataWorkerEnvelope &
      Readonly<{
        type: DataWorkerMessageType.Trail;
        id: string;
        entry: TrailEntry | null;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: DataWorkerMessageType.AircraftDossier;
        entityId: string;
        dossier: AircraftDossier | null;
      }>)
  | (DataWorkerEnvelope &
      Readonly<{
        type: DataWorkerMessageType.Error;
        message: string;
      }>);

export function createDataWorkerCommand<T extends DataWorkerCommandBody>(
  body: T,
  requestId: number | null,
): T & DataWorkerEnvelope {
  return {
    ...body,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId,
  };
}

function parseEnvelope(
  value: Readonly<Record<string, unknown>>,
): DataWorkerEnvelope | null {
  if (
    value.protocolVersion !== DataWorkerProtocolVersion.Current
  ) {
    return null;
  }
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
    protocolVersion: DataWorkerProtocolVersion.Current,
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

function parseSourceSnapshot(
  value: unknown,
): DataWorkerSourceSnapshot | null {
  if (
    !isRecord(value) ||
    !isSourceId(value.source) ||
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
    (value.type === DataWorkerMessageType.RefreshSource ||
      value.type === DataWorkerMessageType.ListSourceEntities) &&
    isSourceId(value.source)
  ) {
    return { ...envelope, type: value.type, source: value.source };
  }

  if (!isQueryableSourceId(value.source)) return null;

  if (
    value.type === DataWorkerMessageType.GetSourceEntity &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.GetSourceEntity,
      source: value.source,
      id: value.id,
    };
  }

  if (value.type === DataWorkerMessageType.QuerySource) {
    return QUERYABLE_SOURCE_CODECS[value.source].buildQueryCommand(
      envelope,
      value.query,
    );
  }

  return null;
}

function parseCacheCommand(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerCommand | null {
  if (
    value.type === DataWorkerMessageType.Init ||
    value.type === DataWorkerMessageType.Clear ||
    value.type === DataWorkerMessageType.Flush
  ) {
    return { ...envelope, type: value.type };
  }

  if (
    (value.type === DataWorkerMessageType.Get ||
      value.type === DataWorkerMessageType.Delete ||
      value.type === DataWorkerMessageType.Estimate) &&
    typeof value.key === "string"
  ) {
    return { ...envelope, type: value.type, key: value.key };
  }

  if (
    value.type === DataWorkerMessageType.GetTrail &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.GetTrail,
      id: value.id,
    };
  }

  if (
    value.type === DataWorkerMessageType.GetAircraftDossier &&
    typeof value.entityId === "string" &&
    value.entityId.length > 0
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.GetAircraftDossier,
      entityId: value.entityId,
    };
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
    value.type === DataWorkerMessageType.ConnectRender &&
    isMessagePort(value.port) &&
    typeof value.renderSessionId === "string" &&
    value.renderSessionId.length > 0
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.ConnectRender,
      port: value.port,
      renderSessionId: value.renderSessionId,
    };
  }

  if (
    value.type === DataWorkerMessageType.ConnectCorrelation &&
    isMessagePort(value.port) &&
    typeof value.correlationSessionId === "string" &&
    value.correlationSessionId.length > 0
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.ConnectCorrelation,
      port: value.port,
      correlationSessionId: value.correlationSessionId,
    };
  }

  const sourceCommand = parseSourceCommand(envelope, value);
  if (sourceCommand) return sourceCommand;

  const cacheCommand = parseCacheCommand(envelope, value);
  if (cacheCommand) return cacheCommand;

  if (
    (value.type === DataWorkerMessageType.Set ||
      value.type === DataWorkerMessageType.SetDeferred) &&
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
    value.type === DataWorkerMessageType.ImportJson &&
    typeof value.key === "string" &&
    typeof value.json === "string"
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.ImportJson,
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

function parseSimpleCacheEvent(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerEvent | null {
  if (value.type === DataWorkerMessageType.Complete) {
    return { ...envelope, type: DataWorkerMessageType.Complete };
  }
  if (
    value.type === DataWorkerMessageType.Error &&
    typeof value.message === "string"
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.Error,
      message: value.message,
    };
  }
  if (
    value.type === DataWorkerMessageType.Size &&
    typeof value.bytes === "number" &&
    Number.isFinite(value.bytes) &&
    value.bytes >= 0
  ) {
    return {
      ...envelope,
      type: DataWorkerMessageType.Size,
      bytes: value.bytes,
    };
  }
  if (value.type === DataWorkerMessageType.Value) {
    return {
      ...envelope,
      type: DataWorkerMessageType.Value,
      value: value.value ?? null,
    };
  }
  return null;
}

function parseTrailEvent(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerEvent | null {
  if (
    value.type !== DataWorkerMessageType.Trail ||
    typeof value.id !== "string"
  ) {
    return null;
  }

  return {
    ...envelope,
    type: DataWorkerMessageType.Trail,
    id: value.id,
    entry:
      value.entry === null
        ? null
        : parseTrailEntry(value.entry),
  };
}

function parseAircraftDossierEvent(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerEvent | null {
  if (
    value.type !== DataWorkerMessageType.AircraftDossier ||
    typeof value.entityId !== "string"
  ) {
    return null;
  }

  const dossier = value.dossier === null
    ? null
    : parseAircraftDossier(value.dossier);
  if (value.dossier !== null && dossier === null) return null;
  return {
    ...envelope,
    type: DataWorkerMessageType.AircraftDossier,
    entityId: value.entityId,
    dossier,
  };
}

function parseReadyEvent(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerEvent | null {
  if (
    value.type !== DataWorkerMessageType.Ready ||
    !Array.isArray(value.entries)
  ) {
    return null;
  }

  const entries: DataWorkerCacheEntry[] = [];
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.key !== "string") return null;
    entries.push({ key: entry.key, value: entry.value });
  }
  return { ...envelope, type: DataWorkerMessageType.Ready, entries };
}

function parseCacheEvent(
  envelope: DataWorkerEnvelope,
  value: Readonly<Record<string, unknown>>,
): DataWorkerEvent | null {
  return parseSimpleCacheEvent(envelope, value) ??
    parseTrailEvent(envelope, value) ??
    parseAircraftDossierEvent(envelope, value) ??
    parseReadyEvent(envelope, value);
}

export function parseDataWorkerEvent(value: unknown): DataWorkerEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const envelope = parseEnvelope(value);
  if (!envelope) return null;

  if (value.type === DataWorkerMessageType.SourceSnapshot) {
    const snapshot = parseSourceSnapshot(value.snapshot);
    if (!snapshot) return null;
    return {
      ...envelope,
      type: DataWorkerMessageType.SourceSnapshot,
      snapshot,
    };
  }
  if (
    (value.type === DataWorkerMessageType.SourceEntity ||
      value.type === DataWorkerMessageType.SourceQuery) &&
    isQueryableSourceId(value.source) &&
    isSourceVersion(value.sourceVersion)
  ) {
    const codec = QUERYABLE_SOURCE_CODECS[value.source];
    return value.type === DataWorkerMessageType.SourceEntity
      ? codec.buildEntityEvent(envelope, value.sourceVersion, value.value)
      : codec.buildQueryEvent(envelope, value.sourceVersion, value.result);
  }
  return parseCacheEvent(envelope, value);
}
