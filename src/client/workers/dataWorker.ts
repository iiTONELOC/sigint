import { EARTHQUAKE_SOURCE_POLICY } from "@/features/environmental/earthquake/data/source";
import { Domain } from "@shared/domain/identity";
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
  EVENT_SOURCE_POLICY,
  EventSource,
} from "@/workers/data/sources/events";
import {
  cycloneWarningSource,
  GEO_SOURCES,
  weatherAlertSource,
} from "@/workers/data/source-model/registry";
import {
  CYCLONE_SOURCE,
  createCycloneSourceRuntime,
} from "@/workers/data/sources/cyclones";
import { ScenePublisher } from "@/workers/data/render-codecs/scenePublisher";
import { EventSceneBinding } from "@/workers/data/render-codecs/eventSceneBinding";
import {
  TRAIL_RECORDER_POLICY,
  createTrailRecorder,
} from "@/workers/data/trails/trailRecorder";
import { trailObservations } from "@/lib/geo/trails/observations";
import {
  createSourceAnswers,
  findQueryableSearchIds,
  QUERYABLE_SOURCE_IDS,
} from "@/workers/data/queryableSources";
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
  DataWorkerMessageType,
  DataWorkerProtocolVersion,
  parseDataWorkerCommand,
  type DataWorkerCommand,
  type DataWorkerEnvelope,
  type DataWorkerEvent,
  type DataWorkerSourceSnapshot,
} from "@/workers/data/protocol";
import {
  createRenderDataCommand,
  RenderDataCommandType,
  type LegacyPointSourceId,
} from "@/workers/render/dataChannel";
import type { DataPoint } from "@/features/base/dataPoints";
import { createCorrelationDataCommand } from "@/workers/correlation/dataChannel";

type CommandOf<TType extends DataWorkerMessageType> = Extract<
  DataWorkerCommand,
  { type: TType }
>;

enum DataWorkerError {
  InactiveSource = "The requested source is not active",
  OperationFailed = "DataWorker operation failed",
}

const store = createDataCacheStore(indexedDB);
const scenePublisher = new ScenePublisher();
const eventSceneBinding = new EventSceneBinding((patch) => {
  scenePublisher.publish(patch);
});
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
    type: DataWorkerMessageType.SourceSnapshot,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: null,
    snapshot,
  });
  rebaseCorrelation(snapshot.source);
}

/**
 * Every source rebases to the correlation worker on its own status publish, so
 * correlation input never travels through React. The port guard also keeps
 * this inert while the owners are still being constructed.
 */
function rebaseCorrelation(source: string): void {
  if (!correlationPort || !correlationSessionId) return;
  if (!isOwnedSource(source)) return;
  correlationSequence++;
  correlationPort.postMessage(
    createCorrelationDataCommand(
      { type: "sourceRebase", source, points: sourceOwners[source].values() },
      correlationSessionId,
      correlationSequence,
    ),
  );
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
    type: RenderDataCommandType.EarthquakeSearch,
    matchingIds: earthquakeSearchText
      ? findQueryableSearchIds(
          Domain.Earthquake,
          earthquakeOwner.values(),
          earthquakeSearchText,
        )
      : null,
  });
}

function publishFireSearch(): void {
  postRenderData({
    type: RenderDataCommandType.FireSearch,
    matchingIds: fireSearchText
      ? findQueryableSearchIds(Domain.Fire, fireOwner.values(), fireSearchText)
      : null,
  });
}

function rebaseEarthquakeRender(
  points: ReturnType<typeof earthquakeOwner.values>,
): void {
  if (!renderPort || !renderSessionId) return;
  const packed = packEarthquakeRenderData(points);
  postRenderData({
    type: RenderDataCommandType.EarthquakeRebase,
    ...packed,
  }, [
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
  postRenderData({
    type: RenderDataCommandType.FireRebase,
    ...packed,
  }, [
    packed.positions.buffer,
    packed.unitVectors.buffer,
    packed.frp.buffer,
    packed.timestamps.buffer,
    packed.confidences.buffer,
  ]);
  publishFireSearch();
}

const fireOwner = createFireSourceOwner({
  readCache: () => store.get(FIRE_SOURCE_POLICY.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(FIRE_SOURCE_POLICY.cacheKey, snapshot);
  },
  publishStatus: publishSource,
  publishRebase: rebaseFireRender,
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

const eventOwner = new EventSource();
eventOwner.attach({
  readCache: () => store.get(EVENT_SOURCE_POLICY.cacheKey),
  persistCache: (key, snapshot) => {
    coordinator.setDeferred(key, snapshot);
  },
  publishStatus: publishSource,
  publishPatch: (patch) => {
    eventSceneBinding.publish(patch);
  },
});

/**
 * Weather and cyclones still carry geometry on the legacy object path.
 */
function rebasePoints(
  source: LegacyPointSourceId,
  points: readonly DataPoint[],
): void {
  postRenderData({
    type: RenderDataCommandType.PointsRebase,
    source,
    points,
  });
}

const weatherOwner = weatherAlertSource;
weatherOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, value) => {
    coordinator.setDeferred(key, value);
  },
  publishStatus: publishSource,
  publishPatch: () => {
    rebasePoints(Domain.Weather, weatherOwner.values());
  },
});

const cycloneOwner = createCycloneSourceRuntime({
  readCache: () => store.get(CYCLONE_SOURCE.cacheKey),
  persistCache: (snapshot) => {
    coordinator.setDeferred(CYCLONE_SOURCE.cacheKey, snapshot);
  },
  publishStatus: publishSource,
  publishPoints: (points) => {
    rebasePoints(CYCLONE_SOURCE.id, points);
  },
});

const cycloneWarningOwner = cycloneWarningSource;
cycloneWarningOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, value) => {
    coordinator.setDeferred(key, value);
  },
  publishStatus: publishSource,
  publishPatch: () => {
    rebasePoints(
      Domain.CycloneWarnings,
      cycloneWarningOwner.values(),
    );
  },
});

const sourceOwners = {
  [Domain.Aircraft]: aircraftOwner,
  [Domain.CycloneWarnings]: cycloneWarningOwner,
  [Domain.Cyclones]: cycloneOwner,
  [Domain.Earthquake]: earthquakeOwner,
  [Domain.Events]: eventOwner,
  [Domain.Fire]: fireOwner,
  [Domain.Ships]: shipOwner,
  [Domain.Weather]: weatherOwner,
};

// One line per source; each binds its codec to its owner where both types
// are concrete, which is what keeps the handlers branch-free.
const sourceAnswers = {
  [Domain.Aircraft]: createSourceAnswers(Domain.Aircraft, aircraftOwner),
  [Domain.Cyclones]: createSourceAnswers(Domain.Cyclones, cycloneOwner),
  [Domain.CycloneWarnings]: createSourceAnswers(
    Domain.CycloneWarnings,
    cycloneWarningOwner,
  ),
  [Domain.Earthquake]: createSourceAnswers(
    Domain.Earthquake,
    earthquakeOwner,
  ),
  [Domain.Events]: createSourceAnswers(Domain.Events, eventOwner),
  [Domain.Fire]: createSourceAnswers(Domain.Fire, fireOwner),
  [Domain.Ships]: createSourceAnswers(Domain.Ships, shipOwner),
  [Domain.Weather]: createSourceAnswers(Domain.Weather, weatherOwner),
};

type OwnedSourceId = keyof typeof sourceOwners;

type InactiveSourceError = Error & Readonly<{ source: string }>;

function inactiveSourceError(source: string): InactiveSourceError {
  return Object.assign(new Error(DataWorkerError.InactiveSource), {
    source,
  });
}

function isOwnedSource(value: string): value is OwnedSourceId {
  return value in sourceOwners;
}

function complete(requestId: number | null): void {
  if (requestId === null) return;
  post({
    type: DataWorkerMessageType.Complete,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId,
  });
}

function fail(requestId: number | null, error: unknown): void {
  if (requestId === null) return;
  post({
    type: DataWorkerMessageType.Error,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId,
    message:
      error instanceof Error
        ? error.message
        : DataWorkerError.OperationFailed,
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

async function handleInit(
  command: CommandOf<DataWorkerMessageType.Init>,
): Promise<void> {
  await store.open();
  post({
    type: DataWorkerMessageType.Ready,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    entries: mainThreadCacheEntries(await store.getAll()),
  });
  void startOwners();
}

function handleConnectRender(
  command: CommandOf<DataWorkerMessageType.ConnectRender>,
): void {
  renderPort?.close();
  renderPort = command.port;
  renderSessionId = command.renderSessionId;
  renderSequence = 0;
  renderPort.start();
  postRenderData({ type: RenderDataCommandType.Bind });
  scenePublisher.connect(renderPort, renderSessionId);
  aircraftOwner.publishRebase();
  shipOwner.publishRebase();
  eventOwner.publishRebase();
  cycloneOwner.publishRebase();
  for (const source of GEO_SOURCES) source.publishRebase();
  rebaseEarthquakeRender(earthquakeOwner.values());
  rebaseFireRender(fireOwner.values());
  complete(command.requestId);
}

function handleConnectCorrelation(
  command: CommandOf<DataWorkerMessageType.ConnectCorrelation>,
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
  // Seed the whole record set: the correlation worker connects long after the
  // sources have started publishing, so it would otherwise stay empty until
  // each one next polls.
  for (const source of QUERYABLE_SOURCE_IDS) rebaseCorrelation(source);
  complete(command.requestId);
}

async function handleRefreshSource(
  command: CommandOf<DataWorkerMessageType.RefreshSource>,
): Promise<void> {
  if (!isOwnedSource(command.source)) {
    throw inactiveSourceError(command.source);
  }
  await sourceOwners[command.source].refresh();
  complete(command.requestId);
}

function handleListSourceEntities(
  command: CommandOf<DataWorkerMessageType.ListSourceEntities>,
): void {
  if (!isOwnedSource(command.source)) {
    throw inactiveSourceError(command.source);
  }
  post({
    type: DataWorkerMessageType.Value,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    value: sourceOwners[command.source].values(),
  });
}

function envelopeFor(requestId: number | null): DataWorkerEnvelope {
  return {
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId,
  };
}

/**
 * Every queryable source answers through its own bound codec, so these
 * handlers carry no per-source branching.
 */
function handleGetSourceEntity(
  command: CommandOf<DataWorkerMessageType.GetSourceEntity>,
): void {
  const event = sourceAnswers[command.source].entity(
    envelopeFor(command.requestId),
    command.id,
  );
  if (event) post(event);
}

function handleQuerySource(
  command: CommandOf<DataWorkerMessageType.QuerySource>,
): void {
  const event = sourceAnswers[command.source].query(
    envelopeFor(command.requestId),
    command.query,
  );
  if (event) post(event);
}

function handleSetSourceSearch(
  command: CommandOf<DataWorkerMessageType.SetSourceSearch>,
): void {
  const normalized = command.text?.trim() ?? "";
  const text = normalized.length > 0 ? normalized : null;
  if (command.source === Domain.Earthquake) {
    earthquakeSearchText = text;
    publishEarthquakeSearch();
  } else if (command.source === Domain.Fire) {
    fireSearchText = text;
    publishFireSearch();
  }
  complete(command.requestId);
}

function handleGetTrail(
  command: CommandOf<DataWorkerMessageType.GetTrail>,
): void {
  post({
    type: DataWorkerMessageType.Trail,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    id: command.id,
    entry: trailRecorder.get(command.id),
  });
}

async function handleGet(
  command: CommandOf<DataWorkerMessageType.Get>,
): Promise<void> {
  post({
    type: DataWorkerMessageType.Value,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    value: await store.get(command.key),
  });
}

async function handleImportJson(
  command: CommandOf<DataWorkerMessageType.ImportJson>,
): Promise<void> {
  const value: unknown = JSON.parse(command.json);
  await coordinator.set(command.key, value);
  post({
    type: DataWorkerMessageType.Value,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    value,
  });
}

async function handleEstimate(
  command: CommandOf<DataWorkerMessageType.Estimate>,
): Promise<void> {
  post({
    type: DataWorkerMessageType.Size,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    bytes: await store.estimate(command.key),
  });
}

async function dispatch(command: DataWorkerCommand): Promise<void> {
  switch (command.type) {
    case DataWorkerMessageType.Init:
      return handleInit(command);
    case DataWorkerMessageType.ConnectRender:
      return handleConnectRender(command);
    case DataWorkerMessageType.ConnectCorrelation:
      return handleConnectCorrelation(command);
    case DataWorkerMessageType.RefreshSource:
      return handleRefreshSource(command);
    case DataWorkerMessageType.ListSourceEntities:
      return handleListSourceEntities(command);
    case DataWorkerMessageType.GetSourceEntity:
      return handleGetSourceEntity(command);
    case DataWorkerMessageType.QuerySource:
      return handleQuerySource(command);
    case DataWorkerMessageType.SetSourceSearch:
      return handleSetSourceSearch(command);
    case DataWorkerMessageType.GetTrail:
      return handleGetTrail(command);
    case DataWorkerMessageType.Get:
      return handleGet(command);
    case DataWorkerMessageType.ImportJson:
      return handleImportJson(command);
    case DataWorkerMessageType.Set:
      await coordinator.set(command.key, command.value);
      return complete(command.requestId);
    case DataWorkerMessageType.SetDeferred:
      coordinator.setDeferred(command.key, command.value);
      return complete(command.requestId);
    case DataWorkerMessageType.Delete:
      await coordinator.delete(command.key, () => store.delete(command.key));
      return complete(command.requestId);
    case DataWorkerMessageType.Clear:
      await coordinator.clear(store.clear);
      return complete(command.requestId);
    case DataWorkerMessageType.Flush:
      await coordinator.flush();
      return complete(command.requestId);
    case DataWorkerMessageType.Estimate:
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
