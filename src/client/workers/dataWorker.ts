import { EARTHQUAKE_SOURCE_POLICY } from "@/features/environmental/earthquake/data/source";
import { createDeferredWriteCoordinator } from "@/lib/cache/deferredWriteCoordinator";
import {
  DATA_CACHE_POLICY,
  createDataCacheStore,
} from "@/workers/data/cacheStore";
import { packEarthquakeRenderData } from "@/workers/data/earthquakeRenderData";
import { createEarthquakeSourceOwner } from "@/workers/data/earthquakeSourceOwner";
import {
  DATA_WORKER_PROTOCOL_VERSION,
  parseDataWorkerCommand,
  type DataWorkerCommand,
  type DataWorkerEvent,
  type DataWorkerSourceSnapshot,
} from "@/workers/data/protocol";
import { createRenderDataCommand } from "@/workers/render/dataChannel";

const store = createDataCacheStore(indexedDB);
let renderPort: MessagePort | null = null;
let renderSessionId: string | null = null;
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

function publishSource(snapshot: DataWorkerSourceSnapshot): void {
  post({
    type: "sourceSnapshot",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId: null,
    snapshot,
  });
}

function rebaseEarthquakeRender(
  points: ReturnType<typeof earthquakeOwner.read>,
): void {
  if (!renderPort || !renderSessionId) return;
  const packed = packEarthquakeRenderData(points);
  renderSequence++;
  renderPort.postMessage(
    createRenderDataCommand(
      { type: "earthquakeRebase", ...packed },
      renderSessionId,
      renderSequence,
    ),
    [
      packed.positions.buffer,
      packed.unitVectors.buffer,
      packed.magnitudes.buffer,
      packed.timestamps.buffer,
    ],
  );
}

const earthquakeOwner = createEarthquakeSourceOwner({
  readCache: () => store.get(EARTHQUAKE_SOURCE_POLICY.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(EARTHQUAKE_SOURCE_POLICY.cacheKey, snapshot);
  },
  publish: publishSource,
  rebaseRender: rebaseEarthquakeRender,
});

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
      renderSessionId = command.renderSessionId;
      renderSequence = 0;
      renderPort.start();
      renderSequence++;
      renderPort.postMessage(
        createRenderDataCommand(
          { type: "bind" },
          renderSessionId,
          renderSequence,
        ),
      );
      earthquakeOwner.rebase();
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
      void earthquakeOwner.start();
      return;
    }
    if (command.type === "refreshSource") {
      await earthquakeOwner.refresh();
      complete(requestId);
      return;
    }
    if (command.type === "getSourceEntity") {
      const snapshot = earthquakeOwner.snapshot();
      post({
        type: "sourceEntity",
        protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
        requestId,
        source: "earthquake",
        sourceVersion: snapshot.version,
        value: earthquakeOwner.find(command.id),
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
