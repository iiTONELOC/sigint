import { isRecord } from "@shared/geo";
import type { TrailEntry } from "@/lib/geo/trails/trailStore";
import type {
  AircraftDossier,
} from "@shared/domain/aircraftDossier";
import type {
  QueryableSourceId,
  QueryableSourceShapes,
} from "@/workers/data/queryableSources";
import {
  createDataWorkerCommand,
  parseDataWorkerEvent,
  DataWorkerMessageType,
  DataWorkerProtocolVersion,
  type DataWorkerCacheEntry,
  type DataWorkerCommandBody,
  type DataWorkerEvent,
  type DataWorkerPointSource,
  type DataWorkerQueryableSource,
  type DataWorkerSourceSnapshot,
  type AnySourceEntity,
  type AnySourceQueryResult,
} from "@/workers/data/protocol";
export type DataWorkerClientPolicy = Readonly<{
  requestTimeoutMs: number;
}>;

export const DATA_WORKER_CLIENT_POLICY: DataWorkerClientPolicy = {
  requestTimeoutMs: 10_000,
};

export type DataWorkerClientOptions = Readonly<{
  requestTimeoutMs?: number;
}>;

type PendingRequest = Readonly<{
  resolve: (event: DataWorkerEvent) => void;
  reject: (error: Error) => void;
  cancelTimeout: () => void;
}>;

export type DataWorkerSourceListener = (
  snapshot: DataWorkerSourceSnapshot,
) => void;

export type DataWorkerSourceEntityResult = Readonly<{
  source: QueryableSourceId;
  sourceVersion: number;
  value: AnySourceEntity | null;
}>;

export type DataWorkerSourceQueryResult = Readonly<{
  source: QueryableSourceId;
  sourceVersion: number;
  result: AnySourceQueryResult;
}>;

export type DataWorkerSourceQueryRequest = {
  [TId in QueryableSourceId]: Readonly<{
    source: TId;
    query: QueryableSourceShapes[TId]["query"];
  }>;
}[QueryableSourceId];

export type DataWorkerTransport = {
  onmessage: ((message: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (
    message: unknown,
    transfer: Transferable[],
  ) => void;
  terminate: () => void;
};

export type DataWorkerClient = Readonly<{
  init: () => Promise<readonly DataWorkerCacheEntry[]>;
  connectRender: (port: MessagePort, renderSessionId: string) => Promise<void>;
  connectCorrelation: (
    port: MessagePort,
    correlationSessionId: string,
  ) => Promise<void>;
  refreshSource: (source: DataWorkerPointSource) => Promise<void>;
  listSourceEntities: (source: DataWorkerPointSource) => Promise<unknown>;
  getTrail: (id: string) => Promise<TrailEntry | null>;
  getAircraftDossier: (
    entityId: string,
  ) => Promise<AircraftDossier | null>;
  getSourceEntity: (
    source: DataWorkerQueryableSource,
    id: string,
  ) => Promise<DataWorkerSourceEntityResult>;
  querySource: (
    request: DataWorkerSourceQueryRequest,
  ) => Promise<DataWorkerSourceQueryResult>;
  setSourceSearch: (
    source: DataWorkerQueryableSource,
    text: string | null,
  ) => Promise<void>;
  getSourceSnapshot: (
    source: DataWorkerPointSource,
  ) => DataWorkerSourceSnapshot | null;
  subscribeSource: (
    source: DataWorkerPointSource,
    listener: DataWorkerSourceListener,
  ) => () => void;
  get: (key: string) => Promise<unknown>;
  importJson: (key: string, json: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  setDeferred: (key: string, value: unknown) => void;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  flush: () => Promise<void>;
  estimate: (key: string) => Promise<number>;
  terminate: () => void;
}>;

export enum DataWorkerClientError {
  UnexpectedEvent = "DataWorker returned an unexpected event",
  ProtocolIncompatible = "DataWorker protocol is incompatible",
  WorkerFailed = "DataWorker failed",
  RequestTimedOut = "DataWorker request timed out",
  PostMessageFailed = "DataWorker postMessage failed",
  Terminated = "DataWorker terminated",
}

export enum DataWorkerClientPath {
  Worker = "/workers/dataWorker.js",
}

function unexpectedEvent(expected: string): Error {
  return Object.assign(
    new Error(DataWorkerClientError.UnexpectedEvent),
    { expected },
  );
}

export function createDataWorkerClient(
  worker: DataWorkerTransport,
  options: DataWorkerClientOptions = {},
): DataWorkerClient {
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DATA_WORKER_CLIENT_POLICY.requestTimeoutMs;
  let nextRequestId = 0;
  let failed: Error | null = null;
  const sourceSnapshots = new Map<DataWorkerPointSource, DataWorkerSourceSnapshot>();
  const pending = new Map<number, PendingRequest>();
  const sourceListeners = new Set<Readonly<{
    source: DataWorkerPointSource;
    listener: DataWorkerSourceListener;
  }>>();

  const rejectAll = (error: Error): void => {
    failed = error;
    for (const request of pending.values()) {
      request.cancelTimeout();
      request.reject(error);
    }
    pending.clear();
  };

  worker.onmessage = (message: MessageEvent<unknown>) => {
    if (
      isRecord(message.data) &&
      "protocolVersion" in message.data &&
      message.data.protocolVersion !==
        DataWorkerProtocolVersion.Current
    ) {
      rejectAll(
        new Error(DataWorkerClientError.ProtocolIncompatible),
      );
      return;
    }
    const event = parseDataWorkerEvent(message.data);
    if (!event) return;
    if (event.type === DataWorkerMessageType.SourceSnapshot) {
      sourceSnapshots.set(event.snapshot.source, event.snapshot);
      for (const registration of sourceListeners) {
        if (registration.source === event.snapshot.source) {
          registration.listener(event.snapshot);
        }
      }
      return;
    }
    if (event.requestId === null) return;
    const request = pending.get(event.requestId);
    if (!request) return;
    pending.delete(event.requestId);
    request.cancelTimeout();
    if (event.type === DataWorkerMessageType.Error) {
      request.reject(new Error(event.message));
    } else {
      request.resolve(event);
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    rejectAll(
      new Error(event.message || DataWorkerClientError.WorkerFailed),
    );
  };

  const request = (
    body: DataWorkerCommandBody,
    transfer: Transferable[] = [],
  ): Promise<DataWorkerEvent> => {
    if (failed) return Promise.reject(failed);
    nextRequestId++;
    const requestId = nextRequestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!pending.delete(requestId)) return;
        reject(
          Object.assign(
            new Error(DataWorkerClientError.RequestTimedOut),
            { requestTimeoutMs },
          ),
        );
      }, requestTimeoutMs);
      const cancelTimeout = (): void => clearTimeout(timeout);
      pending.set(requestId, { resolve, reject, cancelTimeout });
      try {
        worker.postMessage(
          createDataWorkerCommand(body, requestId),
          transfer,
        );
      } catch (error) {
        pending.delete(requestId);
        reject(
          error instanceof Error
            ? error
            : new Error(DataWorkerClientError.PostMessageFailed),
        );
        cancelTimeout();
      }
    });
  };

  const requireComplete = async (
    body: DataWorkerCommandBody,
    transfer: Transferable[] = [],
  ): Promise<void> => {
    const event = await request(body, transfer);
    if (event.type !== DataWorkerMessageType.Complete) {
      throw unexpectedEvent("completion");
    }
  };

  return {
    async init(): Promise<readonly DataWorkerCacheEntry[]> {
      const event = await request({
        type: DataWorkerMessageType.Init,
      });
      if (event.type !== DataWorkerMessageType.Ready) {
        throw unexpectedEvent("cache entries");
      }
      return event.entries;
    },

    connectRender(
      port: MessagePort,
      renderSessionId: string,
    ): Promise<void> {
      return requireComplete(
        {
          type: DataWorkerMessageType.ConnectRender,
          port,
          renderSessionId,
        },
        [port],
      );
    },

    connectCorrelation(
      port: MessagePort,
      correlationSessionId: string,
    ): Promise<void> {
      return requireComplete(
        {
          type: DataWorkerMessageType.ConnectCorrelation,
          port,
          correlationSessionId,
        },
        [port],
      );
    },

    refreshSource(source: DataWorkerPointSource): Promise<void> {
      return requireComplete({
        type: DataWorkerMessageType.RefreshSource,
        source,
      });
    },

    async listSourceEntities(
      source: DataWorkerPointSource,
    ): Promise<unknown> {
      const event = await request({
        type: DataWorkerMessageType.ListSourceEntities,
        source,
      });
      if (event.type !== DataWorkerMessageType.Value) {
        throw unexpectedEvent("source entities");
      }
      return event.value;
    },

    async getTrail(id: string): Promise<TrailEntry | null> {
      const event = await request({
        type: DataWorkerMessageType.GetTrail,
        id,
      });
      if (event.type !== DataWorkerMessageType.Trail) {
        throw unexpectedEvent("a trail");
      }
      return event.entry;
    },

    async getAircraftDossier(
      entityId: string,
    ): Promise<AircraftDossier | null> {
      const event = await request({
        type: DataWorkerMessageType.GetAircraftDossier,
        entityId,
      });
      if (event.type !== DataWorkerMessageType.AircraftDossier) {
        throw unexpectedEvent("an aircraft dossier");
      }
      return event.dossier;
    },

    async getSourceEntity(
      source: DataWorkerQueryableSource,
      id: string,
    ): Promise<DataWorkerSourceEntityResult> {
      const event = await request({
        type: DataWorkerMessageType.GetSourceEntity,
        source,
        id,
      });
      if (event.type !== DataWorkerMessageType.SourceEntity) {
        throw unexpectedEvent("source entity");
      }
      return event;
    },

    async querySource(
      queryRequest: DataWorkerSourceQueryRequest,
    ): Promise<DataWorkerSourceQueryResult> {
      const event = await request({
        type: DataWorkerMessageType.QuerySource,
        ...queryRequest,
      });
      if (event.type !== DataWorkerMessageType.SourceQuery) {
        throw unexpectedEvent("source query");
      }
      return event;
    },

    setSourceSearch(
      source: DataWorkerQueryableSource,
      text: string | null,
    ): Promise<void> {
      return requireComplete({
        type: DataWorkerMessageType.SetSourceSearch,
        source,
        text,
      });
    },

    getSourceSnapshot(
      source: DataWorkerPointSource,
    ): DataWorkerSourceSnapshot | null {
      return sourceSnapshots.get(source) ?? null;
    },

    subscribeSource(
      source: DataWorkerPointSource,
      listener: DataWorkerSourceListener,
    ): () => void {
      const registration = { source, listener };
      sourceListeners.add(registration);
      const snapshot = sourceSnapshots.get(source);
      if (snapshot) listener(snapshot);
      return () => {
        sourceListeners.delete(registration);
      };
    },

    async get(key: string): Promise<unknown> {
      const event = await request({
        type: DataWorkerMessageType.Get,
        key,
      });
      if (event.type !== DataWorkerMessageType.Value) {
        throw unexpectedEvent("cache value");
      }
      return event.value;
    },

    async importJson(
      key: string,
      json: string,
    ): Promise<unknown> {
      const event = await request({
        type: DataWorkerMessageType.ImportJson,
        key,
        json,
      });
      if (event.type !== DataWorkerMessageType.Value) {
        throw unexpectedEvent("imported value");
      }
      return event.value;
    },

    set(key: string, value: unknown): Promise<void> {
      return requireComplete({
        type: DataWorkerMessageType.Set,
        key,
        value,
      });
    },

    setDeferred(key: string, value: unknown): void {
      if (failed) return;
      try {
        worker.postMessage(
          createDataWorkerCommand(
            { type: DataWorkerMessageType.SetDeferred, key, value },
            null,
          ),
          [],
        );
      } catch (error: unknown) {
        rejectAll(
          error instanceof Error
            ? error
            : new Error(DataWorkerClientError.PostMessageFailed),
        );
      }
    },

    delete(key: string): Promise<void> {
      return requireComplete({
        type: DataWorkerMessageType.Delete,
        key,
      });
    },

    clear(): Promise<void> {
      return requireComplete({ type: DataWorkerMessageType.Clear });
    },

    flush(): Promise<void> {
      return requireComplete({ type: DataWorkerMessageType.Flush });
    },

    async estimate(key: string): Promise<number> {
      const event = await request({
        type: DataWorkerMessageType.Estimate,
        key,
      });
      if (event.type !== DataWorkerMessageType.Size) {
        throw unexpectedEvent("cache size");
      }
      return event.bytes;
    },

    terminate(): void {
      rejectAll(new Error(DataWorkerClientError.Terminated));
      sourceListeners.clear();
      worker.terminate();
    },
  };
}

let sharedClient: DataWorkerClient | null | undefined;

export function getDataWorkerClient(): DataWorkerClient | null {
  if (sharedClient !== undefined) return sharedClient;
  if (typeof Worker === "undefined" || typeof window === "undefined") {
    sharedClient = null;
    return sharedClient;
  }
  try {
    sharedClient = createDataWorkerClient(
      new Worker(DataWorkerClientPath.Worker, { type: "module" }),
    );
  } catch {
    // No worker available (test runtime, blocked script). Callers fall back
    // to their own fetch path rather than losing the feed entirely.
    sharedClient = null;
  }
  return sharedClient;
}
