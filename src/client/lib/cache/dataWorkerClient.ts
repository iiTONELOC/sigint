import {
  createDataWorkerCommand,
  parseDataWorkerEvent,
  type DataWorkerCacheEntry,
  type DataWorkerCommandBody,
  type DataWorkerEvent,
} from "@/workers/data/protocol";

type PendingRequest = Readonly<{
  resolve: (event: DataWorkerEvent) => void;
  reject: (error: Error) => void;
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
): DataWorkerClient {
  let nextRequestId = 0;
  let failed: Error | null = null;
  const pending = new Map<number, PendingRequest>();

  const rejectAll = (error: Error): void => {
    failed = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  worker.onmessage = (message: MessageEvent<unknown>) => {
    const event = parseDataWorkerEvent(message.data);
    if (!event || event.requestId === null) return;
    const request = pending.get(event.requestId);
    if (!request) return;
    pending.delete(event.requestId);
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
      pending.set(requestId, { resolve, reject });
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
