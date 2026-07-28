import { EARTHQUAKE_SOURCE_POLICY } from "@/features/environmental/earthquake/data/source";
import { FIRE_SOURCE_POLICY } from "@/features/environmental/fires/data/source";
import {
  AIRCRAFT_SOURCE,
  createAircraftSourceRuntime,
} from "@/workers/data/sources/aircraft";
import {
  SHIP_SOURCE,
  createShipSourceRuntime,
} from "@/workers/data/sources/ships";
import {
  EVENT_SOURCE,
  createEventSourceRuntime,
} from "@/workers/data/sources/events";
import { runShipUiQuery } from "@/features/tracking/ships/data/uiQueries";
import { createScenePublisher } from "@/workers/data/render-codecs/scenePublisher";
import {
  TRAIL_RECORDER_POLICY,
  createTrailRecorder,
} from "@/workers/data/trails/trailRecorder";
import { trailObservations } from "@/lib/geo/trails/observations";
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

type CommandOf<TType extends DataWorkerCommand["type"]> = Extract<
  DataWorkerCommand,
  { type: TType }
>;

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

const trailRecorder = createTrailRecorder({
  readCache: () => store.get(TRAIL_RECORDER_POLICY.cacheKey),
  persistCache: (value) => {
    coordinator.setDeferred(TRAIL_RECORDER_POLICY.cacheKey, value);
  },
});

const aircraftOwner = createAircraftSourceRuntime({
  readCache: () => store.get(AIRCRAFT_SOURCE.cacheKey),
  persistCache: async (snapshot) => {
    coordinator.setDeferred(AIRCRAFT_SOURCE.cacheKey, snapshot);
  },
  publishStatus: publishSource,
  publishScene: (patch) => {
    scenePublisher.publish(patch);
  },
  observe: (points) => {
    trailRecorder.observe("aircraft", trailObservations(points));
  },
});

function postRenderData(
  body: Parameters<typeof createRenderDataCommand>[0],
  transfer: readonly Transferable[] = [],
): void {
  if (!renderPort || !renderSessionId) return;
  renderSequence++;
  renderPort.postMessage(
    createRenderDataCommand(body, renderSessionId, renderSequence),
    Array.from(transfer),
  );
}

function publishEarthquakeSearch(): void {
  postRenderData({
    type: "earthquakeSearch",
    matchingIds: earthquakeSearchText
      ? findEarthquakeSearchIds(earthquakeOwner.values(), earthquakeSearchText)
      : null,
  });
}

function publishFireSearch(): void {
  postRenderData({
    type: "fireSearch",
    matchingIds: fireSearchText
      ? findFireSearchIds(fireOwner.values(), fireSearchText)
      : null,
  });
}

function rebaseEarthquakeRender(
  points: ReturnType<typeof earthquakeOwner.values>,
): void {
  if (!renderPort || !renderSessionId) return;
  const packed = packEarthquakeRenderData(points);
  postRenderData({ type: "earthquakeRebase", ...packed }, [
    packed.positions.buffer,
    packed.unitVectors.buffer,
    packed.magnitudes.buffer,
    packed.timestamps.buffer,
  ]);
  publishEarthquakeSearch();
}

const earthquakeOwner = createEarthquakeSourceOwner({
  readCache: () => store.get(EARTHQUAKE_SOURCE_POLICY.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(EARTHQUAKE_SOURCE_POLICY.cacheKey, snapshot);
  },
  publishStatus: publishSource,
  publishRebase: rebaseEarthquakeRender,
});

function rebaseFireRender(
  points: ReturnType<typeof fireOwner.values>,
): void {
  if (!renderPort || !renderSessionId) return;
  const packed = packFireRenderData(points);
  postRenderData({ type: "fireRebase", ...packed }, [
    packed.positions.buffer,
    packed.unitVectors.buffer,
    packed.frp.buffer,
    packed.timestamps.buffer,
    packed.confidences.buffer,
  ]);
  publishFireSearch();
}

function rebaseFireCorrelation(
  points: ReturnType<typeof fireOwner.values>,
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
  points: ReturnType<typeof fireOwner.values>,
): void {
  rebaseFireRender(points);
  rebaseFireCorrelation(points);
}

const fireOwner = createFireSourceOwner({
  readCache: () => store.get(FIRE_SOURCE_POLICY.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(FIRE_SOURCE_POLICY.cacheKey, snapshot);
  },
  publishStatus: publishSource,
  publishRebase: rebaseFireConsumers,
});

const shipOwner = createShipSourceRuntime({
  readCache: () => store.get(SHIP_SOURCE.cacheKey),
  persistCache: async (snapshot) => {
    coordinator.setDeferred(SHIP_SOURCE.cacheKey, snapshot);
  },
  publishStatus: publishSource,
  publishScene: (patch) => {
    scenePublisher.publish(patch);
  },
  observe: (points) => {
    trailRecorder.observe("ships", trailObservations(points));
  },
});

const eventOwner = createEventSourceRuntime({
  readCache: () => store.get(EVENT_SOURCE.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(EVENT_SOURCE.cacheKey, snapshot);
  },
  publishStatus: publishSource,
});

const sourceOwners = {
  aircraft: aircraftOwner,
  earthquake: earthquakeOwner,
  events: eventOwner,
  fire: fireOwner,
  ships: shipOwner,
} as const;

type OwnedSourceId = keyof typeof sourceOwners;

const INACTIVE_SOURCE_MESSAGE = "The requested source is not active";

type InactiveSourceError = Error & Readonly<{ source: string }>;

function inactiveSourceError(source: string): InactiveSourceError {
  return Object.assign(new Error(INACTIVE_SOURCE_MESSAGE), { source });
}

function isOwnedSource(value: string): value is OwnedSourceId {
  return value in sourceOwners;
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

async function startOwners(): Promise<void> {
  // Before any source patch lands, so cached history is merged under the
  // live points rather than written over by the first poll.
  await trailRecorder.hydrate();
  await Promise.all(
    Object.values(sourceOwners).map(async (owner) => {
      await owner.hydrate();
      await owner.start();
    }),
  );
}

async function handleInit(command: CommandOf<"init">): Promise<void> {
  await store.open();
  post({
    type: "ready",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId: command.requestId,
    entries: mainThreadCacheEntries(await store.getAll()),
  });
  void startOwners();
}

function handleConnectRender(command: CommandOf<"connectRender">): void {
  renderPort?.close();
  renderPort = command.port;
  renderSessionId = command.renderSessionId;
  renderSequence = 0;
  renderPort.start();
  postRenderData({ type: "bind" });
  scenePublisher.connect(renderPort, renderSessionId);
  aircraftOwner.publishRebase();
  shipOwner.publishRebase();
  rebaseEarthquakeRender(earthquakeOwner.values());
  rebaseFireRender(fireOwner.values());
  complete(command.requestId);
}

function handleConnectCorrelation(
  command: CommandOf<"connectCorrelation">,
): void {
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
  rebaseFireCorrelation(fireOwner.values());
  complete(command.requestId);
}

async function handleRefreshSource(
  command: CommandOf<"refreshSource">,
): Promise<void> {
  if (!isOwnedSource(command.source)) {
    throw inactiveSourceError(command.source);
  }
  await sourceOwners[command.source].refresh();
  complete(command.requestId);
}

function handleListSourceEntities(
  command: CommandOf<"listSourceEntities">,
): void {
  if (!isOwnedSource(command.source)) {
    throw inactiveSourceError(command.source);
  }
  post({
    type: "value",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId: command.requestId,
    value: sourceOwners[command.source].values(),
  });
}

function handleGetSourceEntity(command: CommandOf<"getSourceEntity">): void {
  const requestId = command.requestId;
  const protocolVersion = DATA_WORKER_PROTOCOL_VERSION;
  if (command.source === "earthquake") {
    post({
      type: "sourceEntity",
      protocolVersion,
      requestId,
      source: "earthquake",
      sourceVersion: earthquakeOwner.snapshot().version,
      value: earthquakeOwner.get(command.id),
    });
    return;
  }
  if (command.source === "ships") {
    post({
      type: "sourceEntity",
      protocolVersion,
      requestId,
      source: "ships",
      sourceVersion: shipOwner.snapshot().version,
      value: shipOwner.get(command.id),
    });
    return;
  }
  post({
    type: "sourceEntity",
    protocolVersion,
    requestId,
    source: "fire",
    sourceVersion: fireOwner.snapshot().version,
    value: fireOwner.get(command.id),
  });
}

function handleQuerySource(command: CommandOf<"querySource">): void {
  const requestId = command.requestId;
  const protocolVersion = DATA_WORKER_PROTOCOL_VERSION;
  if (command.source === "earthquake") {
    post({
      type: "sourceQuery",
      protocolVersion,
      requestId,
      source: "earthquake",
      sourceVersion: earthquakeOwner.snapshot().version,
      result: runEarthquakeUiQuery(earthquakeOwner.values(), command.query),
    });
    return;
  }
  if (command.source === "ships") {
    post({
      type: "sourceQuery",
      protocolVersion,
      requestId,
      source: "ships",
      sourceVersion: shipOwner.snapshot().version,
      result: runShipUiQuery(shipOwner.values(), command.query),
    });
    return;
  }
  post({
    type: "sourceQuery",
    protocolVersion,
    requestId,
    source: "fire",
    sourceVersion: fireOwner.snapshot().version,
    result: runFireUiQuery(fireOwner.values(), command.query),
  });
}

function handleSetSourceSearch(
  command: CommandOf<"setSourceSearch">,
): void {
  const normalized = command.text?.trim() ?? "";
  const text = normalized.length > 0 ? normalized : null;
  if (command.source === "earthquake") {
    earthquakeSearchText = text;
    publishEarthquakeSearch();
  } else if (command.source === "fire") {
    fireSearchText = text;
    publishFireSearch();
  }
  complete(command.requestId);
}

function handleGetTrail(command: CommandOf<"getTrail">): void {
  post({
    type: "trail",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId: command.requestId,
    id: command.id,
    entry: trailRecorder.get(command.id),
  });
}

async function handleGet(command: CommandOf<"get">): Promise<void> {
  post({
    type: "value",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId: command.requestId,
    value: await store.get(command.key),
  });
}

async function handleImportJson(
  command: CommandOf<"importJson">,
): Promise<void> {
  const value: unknown = JSON.parse(command.json);
  await coordinator.set(command.key, value);
  post({
    type: "value",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId: command.requestId,
    value,
  });
}

async function handleEstimate(
  command: CommandOf<"estimate">,
): Promise<void> {
  post({
    type: "size",
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId: command.requestId,
    bytes: await store.estimate(command.key),
  });
}

async function dispatch(command: DataWorkerCommand): Promise<void> {
  switch (command.type) {
    case "init":
      return handleInit(command);
    case "connectRender":
      return handleConnectRender(command);
    case "connectCorrelation":
      return handleConnectCorrelation(command);
    case "refreshSource":
      return handleRefreshSource(command);
    case "listSourceEntities":
      return handleListSourceEntities(command);
    case "getSourceEntity":
      return handleGetSourceEntity(command);
    case "querySource":
      return handleQuerySource(command);
    case "setSourceSearch":
      return handleSetSourceSearch(command);
    case "getTrail":
      return handleGetTrail(command);
    case "get":
      return handleGet(command);
    case "importJson":
      return handleImportJson(command);
    case "set":
      await coordinator.set(command.key, command.value);
      return complete(command.requestId);
    case "setDeferred":
      coordinator.setDeferred(command.key, command.value);
      return complete(command.requestId);
    case "delete":
      await coordinator.delete(command.key, () => store.delete(command.key));
      return complete(command.requestId);
    case "clear":
      await coordinator.clear(store.clear);
      return complete(command.requestId);
    case "flush":
      await coordinator.flush();
      return complete(command.requestId);
    case "estimate":
      return handleEstimate(command);
  }
}

async function handleCommand(command: DataWorkerCommand): Promise<void> {
  try {
    await dispatch(command);
  } catch (error) {
    fail(command.requestId, error);
  }
}

globalThis.onmessage = (event: MessageEvent<unknown>) => {
  const command = parseDataWorkerCommand(event.data);
  if (!command) return;
  void handleCommand(command);
};
