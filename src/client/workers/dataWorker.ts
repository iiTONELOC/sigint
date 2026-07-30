import { createDeferredWriteCoordinator } from "@/lib/cache/deferredWriteCoordinator";
import {
  DATA_WORKER_PROTOCOL_VERSION,
  parseDataWorkerCommand,
  type DataWorkerCommand,
  type DataWorkerEvent,
} from "@/workers/data/protocol";
import {
  DATA_CACHE_POLICY,
  createDataCacheStore,
} from "@/workers/data/cacheStore";

import { createRenderDataCommand } from "@/workers/render/dataChannel";

const store = createDataCacheStore(indexedDB);
let renderPort: MessagePort | null = null;
let renderSequence = 0;

const coordinator = createDeferredWriteCoordinator<unknown>({
  minWriteIntervalMs: DATA_CACHE_POLICY.minWriteIntervalMs,
  now: Date.now,
  ready: store.open,
  schedule: (callback, delayMs) => {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
  write: store.set,
});

function post(event: DataWorkerEvent): void {
  globalThis.postMessage(event);
}

function complete(requestId: number | null): void {
  if (requestId === null) return;
  post({
    type: "complete",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId,
  });
}

function fail(requestId: number | null, error: unknown): void {
  if (requestId === null) return;
  post({
    type: "error",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId,
    message:
      error instanceof Error ? error.message : "DataWorker operation failed",
  });
}

async function handleCommand(command: DataWorkerCommand): Promise<void> {
  const { requestId } = command;
  try {
    if (command.type === "connectRender") {
      renderPort?.close();
      renderPort = command.port;
      renderSequence = 0;
      renderPort.start();
      renderSequence++;
      renderPort.postMessage(
        createRenderDataCommand(
          { type: "bind" },
          command.renderSessionId,
          renderSequence,
        ),
      );
      complete(requestId);
      return;
    }
    if (command.type === "init") {
      await store.open();
      post({
        type: "ready",
        protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
        requestId,
        entries: await store.getAll(),
      });
      return;
    }
    if (command.type === "get") {
      post({
        type: "value",
        protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
        requestId,
        value: await store.get(command.key),
      });
      return;
    }
    if (command.type === "importJson") {
      const value: unknown = JSON.parse(command.json);
      await coordinator.set(command.key, value);
      post({
        type: "value",
        protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
        requestId,
        value,
      });
      return;
    }
    if (command.type === "set") {
      await coordinator.set(command.key, command.value);
      complete(requestId);
      return;
    }
    if (command.type === "setDeferred") {
      coordinator.setDeferred(command.key, command.value);
      complete(requestId);
      return;
    }
    if (command.type === "delete") {
      await coordinator.delete(
        command.key,
        () => store.delete(command.key),
      );
      complete(requestId);
      return;
    }
    if (command.type === "clear") {
      await coordinator.clear(store.clear);
      complete(requestId);
      return;
    }
    if (command.type === "flush") {
      await coordinator.flush();
      complete(requestId);
      return;
    }

    post({
      type: "size",
      protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
      requestId,
      bytes: await store.estimate(command.key),
    });
  } catch (error) {
    fail(requestId, error);
  }
}

globalThis.onmessage = (event: MessageEvent<unknown>) => {
  const command = parseDataWorkerCommand(event.data);
  if (!command) return;
  void handleCommand(command);
};
