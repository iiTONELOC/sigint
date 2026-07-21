import { EARTHQUAKE_SOURCE_POLICY } from "@/features/environmental/earthquake/data/source";
import { FIRE_SOURCE_POLICY } from "@/features/environmental/fires/data/source";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { createAircraftSourceRuntime } from "@/workers/data/sources/aircraft";
import { createScenePublisher } from "@/workers/data/render-codecs/scenePublisher";
import {
  findFireSearchIds,
  runFireUiQuery,
} from "@/features/environmental/fires/data/uiQueries";
import {
  findEarthquakeSearchIds,
  runEarthquakeUiQuery,
} from "@/features/environmental/earthquake/data/uiQueries";
import { createDeferredWriteCoordinator } from "@/lib/cache/deferredWriteCoordinator";
import {
  DATA_CACHE_POLICY,
  createDataCacheStore,
} from "@/workers/data/cacheStore";
import { packEarthquakeRenderData } from "@/workers/data/earthquakeRenderData";
import { createEarthquakeSourceOwner } from "@/workers/data/earthquakeSourceOwner";
import { createFireSourceOwner } from "@/workers/data/fireSourceOwner";
import { packFireRenderData } from "@/workers/data/fireRenderData";
import { mainThreadCacheEntries } from "@/workers/data/cacheOwnership";
import {
  DATA_WORKER_PROTOCOL_VERSION,
  parseDataWorkerCommand,
  type DataWorkerCommand,
  type DataWorkerEvent,
  type DataWorkerSourceSnapshot,
} from "@/workers/data/protocol";
import { createRenderDataCommand } from "@/workers/render/dataChannel";
import { createCorrelationDataCommand } from "@/workers/correlation/dataChannel";

const store = createDataCacheStore(indexedDB);
const scenePublisher = createScenePublisher();
let renderPort: MessagePort | null = null;
let renderSessionId: string | null = null;
let renderSequence = 0;
let correlationPort: MessagePort | null = null;
let correlationSessionId: string | null = null;
let correlationSequence = 0;
let earthquakeSearchText: string | null = null;
let fireSearchText: string | null = null;

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

const aircraftOwner = createAircraftSourceRuntime({
  readCache: () => store.get(CACHE_KEYS.aircraft),
  persistCache: async (snapshot) => {
    coordinator.setDeferred(CACHE_KEYS.aircraft, snapshot);
  },
  publishStatus: publishSource,
  publishScene: (patch) => {
    scenePublisher.publish(patch);
  },
});

function publishEarthquakeSearch(): void {
  if (!renderPort || !renderSessionId) return;
  const matchingIds = earthquakeSearchText
    ? findEarthquakeSearchIds(earthquakeOwner.read(), earthquakeSearchText)
    : null;
  renderSequence++;
  renderPort.postMessage(
    createRenderDataCommand(
      { type: "earthquakeSearch", matchingIds },
      renderSessionId,
      renderSequence,
    ),
  );
}

function publishFireSearch(): void {
  if (!renderPort || !renderSessionId) return;
  const matchingIds = fireSearchText
    ? findFireSearchIds(fireOwner.read(), fireSearchText)
    : null;
  renderSequence++;
  renderPort.postMessage(
    createRenderDataCommand(
      { type: "fireSearch", matchingIds },
      renderSessionId,
      renderSequence,
    ),
  );
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
  publishEarthquakeSearch();
}

const earthquakeOwner = createEarthquakeSourceOwner({
  readCache: () => store.get(EARTHQUAKE_SOURCE_POLICY.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(EARTHQUAKE_SOURCE_POLICY.cacheKey, snapshot);
  },
  publish: publishSource,
  rebaseRender: rebaseEarthquakeRender,
});

function rebaseFireRender(
  points: ReturnType<typeof fireOwner.read>,
): void {
  if (!renderPort || !renderSessionId) return;
  const packed = packFireRenderData(points);
  renderSequence++;
  renderPort.postMessage(
    createRenderDataCommand(
      { type: "fireRebase", ...packed },
      renderSessionId,
      renderSequence,
    ),
    [
      packed.positions.buffer,
      packed.unitVectors.buffer,
      packed.frp.buffer,
      packed.timestamps.buffer,
      packed.confidences.buffer,
    ],
  );
  publishFireSearch();
}

function rebaseFireCorrelation(
  points: ReturnType<typeof fireOwner.read>,
): void {
  if (!correlationPort || !correlationSessionId) return;
  correlationSequence++;
  correlationPort.postMessage(
    createCorrelationDataCommand(
      { type: "fireRebase", points },
      correlationSessionId,
      correlationSequence,
    ),
  );
}

function rebaseFireConsumers(
  points: ReturnType<typeof fireOwner.read>,
): void {
  rebaseFireRender(points);
  rebaseFireCorrelation(points);
}

const fireOwner = createFireSourceOwner({
  readCache: () => store.get(FIRE_SOURCE_POLICY.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(FIRE_SOURCE_POLICY.cacheKey, snapshot);
  },
  publish: publishSource,
  rebaseRender: rebaseFireConsumers,
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
      scenePublisher.connect(renderPort, renderSessionId);
      aircraftOwner.publishRebase();
      earthquakeOwner.rebase();
      rebaseFireRender(fireOwner.read());
      complete(requestId);
      return;
    }
    if (command.type === "connectCorrelation") {
      correlationPort?.close();
      correlationPort = command.port;
      correlationSessionId = command.correlationSessionId;
      correlationSequence = 0;
      correlationPort.start();
      correlationSequence++;
      correlationPort.postMessage(
        createCorrelationDataCommand(
          { type: "bind" },
          correlationSessionId,
          correlationSequence,
        ),
      );
      rebaseFireCorrelation(fireOwner.read());
      complete(requestId);
      return;
    }
    if (command.type === "init") {
      await store.open();
      post({
        type: "ready",
        protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
        requestId,
        entries: mainThreadCacheEntries(await store.getAll()),
      });
      void aircraftOwner.start();
      void earthquakeOwner.start();
      void fireOwner.start();
      return;
    }
    if (command.type === "refreshSource") {
      if (command.source === "aircraft") {
        await aircraftOwner.refresh();
      } else if (command.source === "earthquake") {
        await earthquakeOwner.refresh();
      } else if (command.source === "fire") {
        await fireOwner.refresh();
      } else {
        throw new Error(`The ${command.source} source is not active`);
      }
      complete(requestId);
      return;
    }
    if (command.type === "getSourceEntity") {
      if (command.source === "earthquake") {
        const snapshot = earthquakeOwner.snapshot();
        post({ type: "sourceEntity", protocolVersion: DATA_WORKER_PROTOCOL_VERSION, requestId, source: "earthquake", sourceVersion: snapshot.version, value: earthquakeOwner.find(command.id) });
      } else {
        const snapshot = fireOwner.snapshot();
        post({ type: "sourceEntity", protocolVersion: DATA_WORKER_PROTOCOL_VERSION, requestId, source: "fire", sourceVersion: snapshot.version, value: fireOwner.find(command.id) });
      }
      return;
    }
    if (command.type === "querySource") {
      if (command.source === "earthquake") {
        const snapshot = earthquakeOwner.snapshot();
        post({ type: "sourceQuery", protocolVersion: DATA_WORKER_PROTOCOL_VERSION, requestId, source: "earthquake", sourceVersion: snapshot.version, result: runEarthquakeUiQuery(earthquakeOwner.read(), command.query) });
      } else {
        const snapshot = fireOwner.snapshot();
        post({ type: "sourceQuery", protocolVersion: DATA_WORKER_PROTOCOL_VERSION, requestId, source: "fire", sourceVersion: snapshot.version, result: runFireUiQuery(fireOwner.read(), command.query) });
      }
      return;
    }
    if (command.type === "setSourceSearch") {
      const normalized = command.text?.trim() ?? "";
      if (command.source === "earthquake") {
        earthquakeSearchText = normalized.length > 0 ? normalized : null;
        publishEarthquakeSearch();
      } else {
        fireSearchText = normalized.length > 0 ? normalized : null;
        publishFireSearch();
      }
      complete(requestId);
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
