import { isRecord } from "@shared/geo";
import type { TrailEntry } from "@/lib/geo/trails/trailStore";
import type {
  AircraftDossier,
} from "@shared/domain/aircraftDossier";
import type {
  TsunamiAlert,
  WaveformRequest,
  WaveformResult,
} from "@shared/domain/earthquakes";
import type { CycloneDossierBundle } from "@shared/domain/cyclones";
import type {
  QueryableSourceId,
  QueryableSourceShapes,
} from "@/workers/data/queryableSources";
import {
  createDataWorkerMessage,
  parseDataWorkerEvent,
  DATA_WORKER_PROTOCOL_VERSION,
  DataWorkerMessageType,
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
  return Object.assign(new Error(DataWorkerClientError.UnexpectedEvent), {
    expected,
  });
}

function postMessageError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(DataWorkerClientError.PostMessageFailed);
}

function isEventType<TType extends DataWorkerMessageType>(
  event: DataWorkerEvent,
  type: TType,
): event is Extract<DataWorkerEvent, { type: TType }> {
  return event.type === type;
}

function createClient(
  worker: DataWorkerTransport,
  options: DataWorkerClientOptions = {},
) {
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
        DATA_WORKER_PROTOCOL_VERSION
    ) {
      rejectAll(new Error(DataWorkerClientError.ProtocolIncompatible));
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
    rejectAll(new Error(event.message || DataWorkerClientError.WorkerFailed));
  };

  const request = (
    body: DataWorkerCommandBody,
    transfer: Transferable[] = [],
    timeoutMs: number | null = requestTimeoutMs,
  ): Promise<DataWorkerEvent> => {
    if (failed) return Promise.reject(failed);
    nextRequestId++;
    const requestId = nextRequestId;
    return new Promise((resolve, reject) => {
      const timeout = timeoutMs === null
        ? null
        : setTimeout(() => {
            if (!pending.delete(requestId)) return;
            reject(
              Object.assign(
                new Error(DataWorkerClientError.RequestTimedOut),
                { requestTimeoutMs: timeoutMs },
              ),
            );
          }, timeoutMs);
      const cancelTimeout = (): void => {
        if (timeout !== null) clearTimeout(timeout);
      };
      pending.set(requestId, { resolve, reject, cancelTimeout });
      try {
        worker.postMessage(
          createDataWorkerMessage(body, requestId),
          transfer,
        );
      } catch (error) {
        pending.delete(requestId);
        reject(postMessageError(error));
        cancelTimeout();
      }
    });
  };

  const notify = (body: DataWorkerCommandBody): void => {
    if (failed) return;
    try {
      worker.postMessage(createDataWorkerMessage(body, null), []);
    } catch (error: unknown) {
      rejectAll(postMessageError(error));
    }
  };

  const expectEvent = async <TType extends DataWorkerMessageType>(
    body: DataWorkerCommandBody,
    type: TType,
    expected: string,
    transfer: Transferable[] = [],
    timeoutMs: number | null = requestTimeoutMs,
  ): Promise<Extract<DataWorkerEvent, { type: TType }>> => {
    const event = await request(body, transfer, timeoutMs);
    if (!isEventType(event, type)) throw unexpectedEvent(expected);
    return event;
  };

  const requireComplete = async (
    body: DataWorkerCommandBody,
    transfer: Transferable[] = [],
  ): Promise<void> => {
    await expectEvent(body, DataWorkerMessageType.Complete, "completion", transfer);
  };

  return {
    async init(): Promise<readonly DataWorkerCacheEntry[]> {
      return (await expectEvent(
        { type: DataWorkerMessageType.Init },
        DataWorkerMessageType.Ready,
        "cache entries",
      )).entries;
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

    async getTrail(id: string): Promise<TrailEntry | null> {
      return (await expectEvent(
        { type: DataWorkerMessageType.GetTrail, id },
        DataWorkerMessageType.Trail,
        "a trail",
      )).entry;
    },

    async getAircraftDossier(
      entityId: string,
    ): Promise<AircraftDossier | null> {
      return (await expectEvent(
        { type: DataWorkerMessageType.GetAircraftDossier, entityId },
        DataWorkerMessageType.AircraftDossier,
        "an aircraft dossier",
      )).dossier;
    },

    async getCycloneDossier(entityId: string): Promise<CycloneDossierBundle | null> {
      return (await expectEvent(
        { type: DataWorkerMessageType.GetCycloneDossier, entityId },
        DataWorkerMessageType.CycloneDossier,
        "a cyclone dossier",
      )).dossier;
    },

    async getEarthquakeWaveform(
      waveformRequest: WaveformRequest,
    ): Promise<WaveformResult> {
      return (await expectEvent(
        {
          type: DataWorkerMessageType.GetEarthquakeWaveform,
          request: waveformRequest,
        },
        DataWorkerMessageType.EarthquakeWaveform,
        "an earthquake waveform",
        [],
        null,
      )).result;
    },

    cancelEarthquakeWaveform(): void {
      notify({ type: DataWorkerMessageType.CancelEarthquakeWaveform });
    },

    async getTsunamiAlerts(): Promise<readonly TsunamiAlert[]> {
      return (await expectEvent(
        { type: DataWorkerMessageType.GetTsunamiAlerts },
        DataWorkerMessageType.TsunamiAlerts,
        "tsunami alerts",
        [],
        null,
      )).alerts;
    },

    async getSourceEntity(
      source: DataWorkerQueryableSource,
      id: string,
    ): Promise<DataWorkerSourceEntityResult> {
      return expectEvent(
        { type: DataWorkerMessageType.GetSourceEntity, source, id },
        DataWorkerMessageType.SourceEntity,
        "source entity",
      );
    },

    async querySource(
      queryRequest: DataWorkerSourceQueryRequest,
    ): Promise<DataWorkerSourceQueryResult> {
      return expectEvent(
        { type: DataWorkerMessageType.QuerySource, ...queryRequest },
        DataWorkerMessageType.SourceQuery,
        "source query",
      );
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
      return (await expectEvent(
        { type: DataWorkerMessageType.Get, key },
        DataWorkerMessageType.Value,
        "cache value",
      )).value;
    },

    async importJson(
      key: string,
      json: string,
    ): Promise<unknown> {
      return (await expectEvent(
        { type: DataWorkerMessageType.ImportJson, key, json },
        DataWorkerMessageType.Value,
        "imported value",
      )).value;
    },

    set(key: string, value: unknown): Promise<void> {
      return requireComplete({
        type: DataWorkerMessageType.Set,
        key,
        value,
      });
    },

    setDeferred(key: string, value: unknown): void {
      notify({ type: DataWorkerMessageType.SetDeferred, key, value });
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
      return (await expectEvent(
        { type: DataWorkerMessageType.Estimate, key },
        DataWorkerMessageType.Size,
        "cache size",
      )).bytes;
    },

    terminate(): void {
      rejectAll(new Error(DataWorkerClientError.Terminated));
      sourceListeners.clear();
      worker.terminate();
    },
  };
}

export type DataWorkerClient = Readonly<ReturnType<typeof createClient>>;

export const createDataWorkerClient = (
  worker: DataWorkerTransport,
  options: DataWorkerClientOptions = {},
): DataWorkerClient => createClient(worker, options);

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
    sharedClient = null;
  }
  return sharedClient;
}
