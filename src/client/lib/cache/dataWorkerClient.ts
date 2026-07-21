import type { EarthquakePoint } from "@/features/environmental/earthquake/data/source";
import type {
  EarthquakeUiQuery,
  EarthquakeUiQueryResult,
} from "@/features/environmental/earthquake/data/uiQueries";
import { isRecord } from "@shared/geo";
import {
  createDataWorkerCommand,
  parseDataWorkerEvent,
  DATA_WORKER_PROTOCOL_VERSION,
  type DataWorkerCacheEntry,
  type DataWorkerCommandBody,
  type DataWorkerEvent,
  type DataWorkerSourceSnapshot,
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
  sourceVersion: number;
  value: EarthquakePoint | null;
}>;

export type DataWorkerSourceQueryResult = Readonly<{
  sourceVersion: number;
  result: EarthquakeUiQueryResult;
}>;

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
  refreshSource: (source: "earthquake") => Promise<void>;
  getSourceEntity: (
    source: "earthquake",
    id: string,
  ) => Promise<DataWorkerSourceEntityResult>;
  querySource: (
    source: "earthquake",
    query: EarthquakeUiQuery,
  ) => Promise<DataWorkerSourceQueryResult>;
  setSourceSearch: (
    source: "earthquake",
    text: string | null,
  ) => Promise<void>;
  getSourceSnapshot: (
    source: "earthquake",
  ) => DataWorkerSourceSnapshot | null;
  subscribeSource: (
    source: "earthquake",
    listener: DataWorkerSourceListener,
  ) => () => void;
  get: (key: string) => Promise<unknown | null>;
  importJson: (key: string, json: string) => Promise<unknown | null>;
  set: (key: string, value: unknown) => Promise<void>;
  setDeferred: (key: string, value: unknown) => void;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  flush: () => Promise<void>;
  estimate: (key: string) => Promise<number>;
  terminate: () => void;
}>;

function unexpectedEvent(expected: string): Error {
  return new Error(`DataWorker did not return ${expected}`);
}

export function createDataWorkerClient(
  worker: DataWorkerTransport,
  options: DataWorkerClientOptions = {},
): DataWorkerClient {
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DATA_WORKER_CLIENT_POLICY.requestTimeoutMs;
  let nextRequestId = 0;
  let failed: Error | null = null;
  let earthquakeSnapshot: DataWorkerSourceSnapshot | null = null;
  const pending = new Map<number, PendingRequest>();
  const sourceListeners = new Set<DataWorkerSourceListener>();

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
      message.data.protocolVersion !== DATA_WORKER_PROTOCOL_VERSION
    ) {
      rejectAll(new Error("DataWorker protocol is incompatible"));
      return;
    }
    const event = parseDataWorkerEvent(message.data);
    if (!event) return;
    if (event.type === "sourceSnapshot") {
      earthquakeSnapshot = event.snapshot;
      for (const listener of sourceListeners) {
        listener(event.snapshot);
      }
      return;
    }
    if (event.requestId === null) return;
    const request = pending.get(event.requestId);
    if (!request) return;
    pending.delete(event.requestId);
    request.cancelTimeout();
    if (event.type === "error") {
      request.reject(new Error(event.message));
    } else {
      request.resolve(event);
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    rejectAll(new Error(event.message || "DataWorker failed"));
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
          new Error(`DataWorker request timed out after ${requestTimeoutMs}ms`),
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
            : new Error("DataWorker postMessage failed"),
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
    if (event.type !== "complete") throw unexpectedEvent("completion");
  };

  return {
    async init(): Promise<readonly DataWorkerCacheEntry[]> {
      const event = await request({ type: "init" });
      if (event.type !== "ready") throw unexpectedEvent("cache entries");
      return event.entries;
    },

    connectRender(
      port: MessagePort,
      renderSessionId: string,
    ): Promise<void> {
      return requireComplete(
        { type: "connectRender", port, renderSessionId },
        [port],
      );
    },

    refreshSource(source: "earthquake"): Promise<void> {
      return requireComplete({ type: "refreshSource", source });
    },

    async getSourceEntity(
      source: "earthquake",
      id: string,
    ): Promise<DataWorkerSourceEntityResult> {
      const event = await request({
        type: "getSourceEntity",
        source,
        id,
      });
      if (event.type !== "sourceEntity") {
        throw unexpectedEvent("source entity");
      }
      return {
        sourceVersion: event.sourceVersion,
        value: event.value,
      };
    },

    async querySource(
      source: "earthquake",
      query: EarthquakeUiQuery,
    ): Promise<DataWorkerSourceQueryResult> {
      const event = await request({
        type: "querySource",
        source,
        query,
      });
      if (event.type !== "sourceQuery") {
        throw unexpectedEvent("source query");
      }
      return {
        sourceVersion: event.sourceVersion,
        result: event.result,
      };
    },

    setSourceSearch(
      source: "earthquake",
      text: string | null,
    ): Promise<void> {
      return requireComplete({ type: "setSourceSearch", source, text });
    },

    getSourceSnapshot(
      _source: "earthquake",
    ): DataWorkerSourceSnapshot | null {
      return earthquakeSnapshot;
    },

    subscribeSource(
      _source: "earthquake",
      listener: DataWorkerSourceListener,
    ): () => void {
      sourceListeners.add(listener);
      if (earthquakeSnapshot) listener(earthquakeSnapshot);
      return () => {
        sourceListeners.delete(listener);
      };
    },

    async get(key: string): Promise<unknown | null> {
      const event = await request({ type: "get", key });
      if (event.type !== "value") throw unexpectedEvent("cache value");
      return event.value;
    },

    async importJson(
      key: string,
      json: string,
    ): Promise<unknown | null> {
      const event = await request({ type: "importJson", key, json });
      if (event.type !== "value") throw unexpectedEvent("imported value");
      return event.value;
    },

    set(key: string, value: unknown): Promise<void> {
      return requireComplete({ type: "set", key, value });
    },

    setDeferred(key: string, value: unknown): void {
      if (failed) return;
      try {
        worker.postMessage(
          createDataWorkerCommand(
            { type: "setDeferred", key, value },
            null,
          ),
          [],
        );
      } catch {}
    },

    delete(key: string): Promise<void> {
      return requireComplete({ type: "delete", key });
    },

    clear(): Promise<void> {
      return requireComplete({ type: "clear" });
    },

    flush(): Promise<void> {
      return requireComplete({ type: "flush" });
    },

    async estimate(key: string): Promise<number> {
      const event = await request({ type: "estimate", key });
      if (event.type !== "size") throw unexpectedEvent("cache size");
      return event.bytes;
    },

    terminate(): void {
      rejectAll(new Error("DataWorker terminated"));
      sourceListeners.clear();
      worker.terminate();
    },
  };
}

let sharedClient: DataWorkerClient | null | undefined;

export function getDataWorkerClient(): DataWorkerClient | null {
  if (sharedClient !== undefined) return sharedClient;
  if (typeof Worker === "undefined") {
    sharedClient = null;
    return sharedClient;
  }
  sharedClient = createDataWorkerClient(
    new Worker("/workers/dataWorker.js", { type: "module" }),
  );
  return sharedClient;
}
