import { Domain } from "@shared/domain/identity";
import {
  AircraftSceneBinding,
  AircraftSource,
} from "@/workers/data/sources/aircraft";
import {
  ShipSceneBinding,
  ShipSource,
} from "@/workers/data/sources/ships";
import {
  EVENT_SOURCE_POLICY,
  EventSource,
} from "@/workers/data/sources/events";
import {
  EarthquakeSceneBinding,
  EarthquakeSource,
} from "@/workers/data/sources/earthquakes";
import {
  FireSceneBinding,
  FireSource,
} from "@/workers/data/sources/fires";
import {
  CycloneWarningSceneBinding,
  CycloneWarningSource,
} from "@/features/environmental/cyclones/warningSource";
import {
  WeatherAlertSource,
  WeatherSceneBinding,
} from "@/features/environmental/weather/source";
import {
  CycloneSource,
} from "@/workers/data/sources/cyclones";
import { ScenePublisher } from "@/workers/data/render-codecs/scenePublisher";
import { EventSceneBinding } from "@/workers/data/render-codecs/eventSceneBinding";
import { CycloneSceneBinding } from "@/workers/data/render-codecs/cycloneSceneBinding";
import {
  TRAIL_RECORDER_POLICY,
  createTrailRecorder,
} from "@/workers/data/trails/trailRecorder";
import { ObservedTrailBinding } from "@/workers/data/trails/observedTrailBinding";
import {
  SelectionInterestService,
} from "@/workers/data/selectionInterestService";
import {
  AIRCRAFT_DOSSIER_CACHE_POLICY,
  AircraftDossierService,
} from "@/workers/data/aircraftDossierService";
import { trailObservations } from "@/lib/geo/trails/observations";
import {
  QUERYABLE_SOURCE_IDS,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import {
  SourceCatalog,
  type CatalogRenderBinding,
} from "@/workers/data/sourceCatalog";
import { createDeferredWriteCoordinator } from "@/lib/cache/deferredWriteCoordinator";
import {
  DATA_CACHE_POLICY,
  createDataCacheStore,
} from "@/workers/data/cacheStore";
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
  CorrelationDataCommandType,
  createCorrelationDataCommand,
} from "@/workers/correlation/dataChannel";
import {
  parseSceneInterestCommand,
  SceneInterestCommandType,
  SceneProtocolState,
} from "@/workers/render/sceneProtocol";
import type {
  DatasetEntity,
  DatasetPatch,
} from "@/workers/data/datasetStore";

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
const sourceCatalog = new SourceCatalog();
const aircraftSceneBinding = new AircraftSceneBinding((patch) => {
  scenePublisher.publish(patch);
});
const shipSceneBinding = new ShipSceneBinding((patch) => {
  scenePublisher.publish(patch);
});
const eventSceneBinding = new EventSceneBinding((patch) => {
  scenePublisher.publish(patch);
});
const earthquakeSceneBinding = new EarthquakeSceneBinding((command) => {
  scenePublisher.publish(command);
});
const fireSceneBinding = new FireSceneBinding((command) => {
  scenePublisher.publish(command);
});
const weatherSceneBinding = new WeatherSceneBinding((command) => {
  scenePublisher.publish(command);
});
const cycloneWarningSceneBinding = new CycloneWarningSceneBinding(
  (command) => {
    scenePublisher.publish(command);
  },
);
const cycloneSceneBinding = new CycloneSceneBinding((command) => {
  scenePublisher.publish(command);
});
let renderPort: MessagePort | null = null;
let correlationPort: MessagePort | null = null;
let correlationSessionId: string | null = null;
let correlationSequence = 0;

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
  if (!sourceCatalog.has(source)) return;
  correlationSequence++;
  correlationPort.postMessage(
    createCorrelationDataCommand(
      {
        type: CorrelationDataCommandType.SourceRebase,
        source,
        points: sourceCatalog.values(source),
      },
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
const aircraftOwner = new AircraftSource({
  patchObservers: [
    new ObservedTrailBinding(
      Domain.Aircraft,
      trailRecorder,
      trailObservations,
    ),
  ],
});
const aircraftDossier = new AircraftDossierService({
  entities: aircraftOwner,
  readCache: () => store.get(AIRCRAFT_DOSSIER_CACHE_POLICY.key),
  persistCache: (snapshot) => {
    coordinator.setDeferred(
      AIRCRAFT_DOSSIER_CACHE_POLICY.key,
      snapshot,
    );
  },
});
const selectionInterest = new SelectionInterestService(
  trailRecorder,
  aircraftDossier,
  (overlay) => {
    scenePublisher.publish(overlay);
  },
);
trailRecorder.subscribe((source) => {
  selectionInterest.refresh(source);
});

type RenderRebasePublisher = Readonly<{
  publishRebase: () => void;
}>;

type RenderScenePublisher<TEntity extends DatasetEntity> = Readonly<{
  publish: (patch: DatasetPatch<TEntity>) => void;
  publishSearch: (
    entityIds: readonly string[],
    revision: number,
    active: boolean,
  ) => void;
}>;

type SourceRenderBinding<TEntity extends DatasetEntity> =
  CatalogRenderBinding &
  Readonly<{
    publishPatch: (patch: DatasetPatch<TEntity>) => void;
  }>;

function sourceRenderBinding<TEntity extends DatasetEntity>(
  source: QueryableSourceId,
  owner: RenderRebasePublisher,
  scene: RenderScenePublisher<TEntity>,
): SourceRenderBinding<TEntity> {
  return {
    publishPatch: (patch) => {
      scene.publish(patch);
      sourceCatalog.refreshRenderSearch(source);
    },
    publishRebase: () => {
      owner.publishRebase();
    },
    publishSearch: (entityIds, revision, active) => {
      scene.publishSearch(entityIds, revision, active);
    },
  };
}

const aircraftRender = sourceRenderBinding(
  Domain.Aircraft,
  aircraftOwner,
  aircraftSceneBinding,
);
aircraftOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, snapshot) => {
    coordinator.setDeferred(key, snapshot);
  },
  publishStatus: publishSource,
  publishPatch: aircraftRender.publishPatch,
});

const earthquakeOwner = new EarthquakeSource();
const earthquakeRender = sourceRenderBinding(
  Domain.Earthquake,
  earthquakeOwner,
  earthquakeSceneBinding,
);
earthquakeOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, snapshot) => {
    coordinator.setDeferred(key, snapshot);
  },
  publishStatus: publishSource,
  publishPatch: earthquakeRender.publishPatch,
});

const fireOwner = new FireSource();
const fireRender = sourceRenderBinding(
  Domain.Fire,
  fireOwner,
  fireSceneBinding,
);
fireOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, snapshot) => {
    coordinator.setDeferred(key, snapshot);
  },
  publishStatus: publishSource,
  publishPatch: fireRender.publishPatch,
});

const shipOwner = new ShipSource({
  patchObservers: [
    new ObservedTrailBinding(
      Domain.Ships,
      trailRecorder,
      trailObservations,
    ),
  ],
});
const shipRender = sourceRenderBinding(
  Domain.Ships,
  shipOwner,
  shipSceneBinding,
);
shipOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, snapshot) => {
    coordinator.setDeferred(key, snapshot);
  },
  publishStatus: publishSource,
  publishPatch: shipRender.publishPatch,
});

const eventOwner = new EventSource();
const eventRender = sourceRenderBinding(
  Domain.Events,
  eventOwner,
  eventSceneBinding,
);
eventOwner.attach({
  readCache: () => store.get(EVENT_SOURCE_POLICY.cacheKey),
  persistCache: (key, snapshot) => {
    coordinator.setDeferred(key, snapshot);
  },
  publishStatus: publishSource,
  publishPatch: eventRender.publishPatch,
});

const weatherOwner = new WeatherAlertSource();
const weatherRender = sourceRenderBinding(
  Domain.Weather,
  weatherOwner,
  weatherSceneBinding,
);
weatherOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, value) => {
    coordinator.setDeferred(key, value);
  },
  publishStatus: publishSource,
  publishPatch: weatherRender.publishPatch,
});

const cycloneOwner = new CycloneSource();
const cycloneRender = sourceRenderBinding(
  Domain.Cyclones,
  cycloneOwner,
  cycloneSceneBinding,
);
cycloneOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, snapshot) => {
    coordinator.setDeferred(key, snapshot);
  },
  publishStatus: publishSource,
  publishPatch: cycloneRender.publishPatch,
});

const cycloneWarningOwner = new CycloneWarningSource();
const cycloneWarningRender = sourceRenderBinding(
  Domain.CycloneWarnings,
  cycloneWarningOwner,
  cycloneWarningSceneBinding,
);
cycloneWarningOwner.attach({
  readCache: (key) => store.get(key),
  persistCache: (key, value) => {
    coordinator.setDeferred(key, value);
  },
  publishStatus: publishSource,
  publishPatch: cycloneWarningRender.publishPatch,
});

sourceCatalog.register(
  Domain.Aircraft,
  aircraftOwner,
  aircraftRender,
);
sourceCatalog.register(
  Domain.CycloneWarnings,
  cycloneWarningOwner,
  cycloneWarningRender,
);
sourceCatalog.register(
  Domain.Cyclones,
  cycloneOwner,
  cycloneRender,
  (id) => cycloneOwner.resolveEntity(id),
);
sourceCatalog.register(
  Domain.Earthquake,
  earthquakeOwner,
  earthquakeRender,
);
sourceCatalog.register(
  Domain.Events,
  eventOwner,
  eventRender,
);
sourceCatalog.register(
  Domain.Fire,
  fireOwner,
  fireRender,
);
sourceCatalog.register(
  Domain.Ships,
  shipOwner,
  shipRender,
);
sourceCatalog.register(
  Domain.Weather,
  weatherOwner,
  weatherRender,
);

type InactiveSourceError = Error & Readonly<{ source: string }>;

function inactiveSourceError(source: string): InactiveSourceError {
  return Object.assign(new Error(DataWorkerError.InactiveSource), {
    source,
  });
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
  await sourceCatalog.startAll();
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
  const interestState = new SceneProtocolState(
    command.renderSessionId,
  );
  sourceCatalog.resetRenderSearch();
  selectionInterest.connect();
  renderPort.onmessage = (event: MessageEvent<unknown>) => {
    const interest = parseSceneInterestCommand(event.data);
    if (!interest || !interestState.accept(interest)) return;
    if (interest.type === SceneInterestCommandType.Selection) {
      selectionInterest.update(interest.selection);
      return;
    }
    sourceCatalog.setRenderSearch(interest.search);
  };
  renderPort.start();
  scenePublisher.connect(renderPort, command.renderSessionId);
  sourceCatalog.publishRenderRebases();
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
      { type: CorrelationDataCommandType.Bind },
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
  if (!sourceCatalog.has(command.source)) {
    throw inactiveSourceError(command.source);
  }
  await sourceCatalog.refresh(command.source);
  complete(command.requestId);
}

function handleListSourceEntities(
  command: CommandOf<DataWorkerMessageType.ListSourceEntities>,
): void {
  if (!sourceCatalog.has(command.source)) {
    throw inactiveSourceError(command.source);
  }
  post({
    type: DataWorkerMessageType.Value,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    value: sourceCatalog.values(command.source),
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
  const event = sourceCatalog.entity(
    command.source,
    envelopeFor(command.requestId),
    command.id,
  );
  if (event) post(event);
}

function handleQuerySource(
  command: CommandOf<DataWorkerMessageType.QuerySource>,
): void {
  const event = sourceCatalog.query(
    command.source,
    envelopeFor(command.requestId),
    command.query,
  );
  if (event) post(event);
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

async function handleGetAircraftDossier(
  command: CommandOf<DataWorkerMessageType.GetAircraftDossier>,
): Promise<void> {
  post({
    type: DataWorkerMessageType.AircraftDossier,
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId: command.requestId,
    entityId: command.entityId,
    dossier: await aircraftDossier.get(command.entityId),
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
    case DataWorkerMessageType.GetTrail:
      return handleGetTrail(command);
    case DataWorkerMessageType.GetAircraftDossier:
      return handleGetAircraftDossier(command);
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
