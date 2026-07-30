import { isRecord } from "@shared/geo";

export const DATA_WORKER_PROTOCOL_VERSION: 1 = 1;

export type DataWorkerCacheEntry = Readonly<{
  key: string;
  value: unknown;
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
