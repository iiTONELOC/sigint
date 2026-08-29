import { Domain } from "@shared/domain/identity";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  aircraftSceneBinding,
  AircraftSource,
} from "@/workers/data/sources/aircraft";
import {
  shipSceneBinding,
  ShipSource,
} from "@/workers/data/sources/ships";
import {
  eventSceneBinding,
  EventSource,
} from "@/workers/data/sources/events";
import {
  earthquakeSceneBinding,
  EarthquakeSource,
} from "@/workers/data/sources/earthquakes";
import { fetchWaveform } from "@/features/environmental/earthquake/data/waveform";
import { fetchTsunamiAlerts } from "@/features/environmental/earthquake/data/tsunamiAlerts";
import { authenticatedFetch } from "@/lib/net/authService";
import {
  parseCycloneDossierCacheEntry,
  parseCycloneDossierResult,
} from "@/features/environmental/cyclones/data/codec";
import {
  CYCLONE_DOSSIER_CACHE_PREFIX,
  CycloneRoute,
  parseCycloneStormId,
  type CycloneDossierBundle,
  type CycloneDossierResult,
} from "@shared/domain/cyclones";
import {
  fireSceneBinding,
  FireSource,
} from "@/workers/data/sources/fires";
import {
  CycloneWarningSceneBinding,
  CycloneWarningSource,
} from "@/features/environmental/cyclones/warningSource";
import {
  WeatherAlertSource,
  weatherSceneBinding,
} from "@/features/environmental/weather/source";
import { CycloneSource } from "@/workers/data/sources/cyclones";
import { ScenePublisher } from "@/workers/data/render-codecs/scenePublisher";
import { CycloneSceneBinding } from "@/workers/data/render-codecs/cycloneSceneBinding";
import {
  TRAIL_RECORDER_POLICY,
  createTrailRecorder,
} from "@/workers/data/trails/trailRecorder";
import { ObservedTrailBinding } from "@/workers/data/trails/observedTrailBinding";
import { SelectionInterestService } from "@/workers/data/selectionInterestService";
import {
  AircraftDossierService,
} from "@/workers/data/aircraftDossierService";
import { trailObservations } from "@/lib/geo/trails/observations";
import {
  QUERYABLE_SOURCE_IDS,
  type QueryableSourceEntities,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";
import {
  SourceCatalog,
  type CatalogRenderBinding,
  type CatalogSource,
} from "@/workers/data/sourceCatalog";
import type {
  SourceHost,
} from "@/workers/data/source-model/dataSource";
import { createDeferredWriteCoordinator } from "@/lib/cache/deferredWriteCoordinator";
import {
  DATA_CACHE_POLICY,
  createDataCacheStore,
} from "@/workers/data/cacheStore";
import { mainThreadCacheEntries } from "@/workers/data/cacheOwnership";
import {
  DATA_WORKER_PROTOCOL_VERSION,
  DataWorkerMessageType,
  createDataWorkerMessage,
  parseDataWorkerCommand,
  type DataWorkerCommand,
  type DataWorkerEnvelope,
  type DataWorkerEventBody,
  type DataWorkerSourceSnapshot,
} from "@/workers/data/protocol";
import {
  CorrelationDataCommandType,
  createCorrelationDataCommand,
} from "@/workers/correlation/dataChannel";
import {
  parseSceneInterestCommand,
  SceneInterestCommandType,
  SessionSequenceState,
  type ScenePublishCommandBody,
} from "@/workers/render/sceneProtocol";
import type {
  DatasetEntity,
  DatasetPatch,
} from "@/workers/data/datasetStore";

type CommandOf<TType extends DataWorkerMessageType> = Extract<
  DataWorkerCommand,
  { type: TType }
>;

const DATA_WORKER_OPERATION_FAILED = "DataWorker operation failed";
const CYCLONE_DOSSIER_CACHE_FRESHNESS_MS = 3_600_000;

const store = createDataCacheStore(indexedDB);
const scenePublisher = new ScenePublisher();
const sourceCatalog = new SourceCatalog();

function publishScene(command: ScenePublishCommandBody): void {
  scenePublisher.publish(command);
}

const eventScene = eventSceneBinding(publishScene);
const earthquakeScene = earthquakeSceneBinding(publishScene);
const fireScene = fireSceneBinding(publishScene);
const weatherScene = weatherSceneBinding(publishScene);
const cycloneWarningSceneBinding = new CycloneWarningSceneBinding(publishScene);
const cycloneSceneBinding = new CycloneSceneBinding(publishScene);
let renderPort: MessagePort | null = null;
let correlationPort: MessagePort | null = null;
let correlationSessionId: string | null = null;
let correlationSequence = 0;
let earthquakeWaveformController: AbortController | null = null;
const pendingCycloneDossiers = new Map<string, Promise<CycloneDossierResult>>();

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

function respond<T extends DataWorkerEventBody>(
  requestId: number | null,
  body: T,
): void {
  globalThis.postMessage(createDataWorkerMessage(body, requestId));
}

function publishSource(snapshot: DataWorkerSourceSnapshot): void {
  respond(null, {
    type: DataWorkerMessageType.SourceSnapshot,
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
const aircraftScene = aircraftSceneBinding(
  trailRecorder,
  publishScene,
);
const shipScene = shipSceneBinding(
  trailRecorder,
  publishScene,
);
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
});
const selectionInterest = new SelectionInterestService(
  trailRecorder,
  aircraftDossier,
  publishScene,
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

type RegisteredSource<TId extends QueryableSourceId> =
  CatalogSource<QueryableSourceEntities[TId]> &
  RenderRebasePublisher &
  Readonly<{
    attach: (host: SourceHost<QueryableSourceEntities[TId]>) => void;
    policy: Readonly<{ id: TId }>;
  }>;

function registerSource<TId extends QueryableSourceId>(
  owner: RegisteredSource<TId>,
  scene: RenderScenePublisher<QueryableSourceEntities[TId]>,
  resolveEntity?: (id: string) => DataPoint | null,
): void {
  const source = owner.policy.id;
  const render = sourceRenderBinding(source, owner, scene);
  owner.attach({
    readCache: (key) => store.get(key),
    persistCache: (key, value) => {
      coordinator.setDeferred(key, value);
    },
    publishStatus: publishSource,
    publishPatch: render.publishPatch,
  });
  sourceCatalog.register(source, owner, render, resolveEntity);
}

const earthquakeOwner = new EarthquakeSource();
const fireOwner = new FireSource();
const shipOwner = new ShipSource({
  patchObservers: [
    new ObservedTrailBinding(
      Domain.Ships,
      trailRecorder,
      trailObservations,
    ),
  ],
});
const eventOwner = new EventSource();
const weatherOwner = new WeatherAlertSource();
const cycloneOwner = new CycloneSource();
const cycloneWarningOwner = new CycloneWarningSource();

registerSource(aircraftOwner, aircraftScene);
registerSource(
  cycloneWarningOwner,
  cycloneWarningSceneBinding,
);
registerSource(
  cycloneOwner,
  cycloneSceneBinding,
  (id) => cycloneOwner.resolveEntity(id),
);
registerSource(earthquakeOwner, earthquakeScene);
registerSource(eventOwner, eventScene);
registerSource(fireOwner, fireScene);
registerSource(shipOwner, shipScene);
registerSource(weatherOwner, weatherScene);

function complete(requestId: number | null): void {
  if (requestId === null) return;
  respond(requestId, {
    type: DataWorkerMessageType.Complete,
  });
}

function fail(requestId: number | null, error: unknown): void {
  if (requestId === null) return;
  respond(requestId, {
    type: DataWorkerMessageType.Error,
    message:
      error instanceof Error
        ? error.message
        : DATA_WORKER_OPERATION_FAILED,
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
  respond(command.requestId, {
    type: DataWorkerMessageType.Ready,
    entries: mainThreadCacheEntries(await store.getAll()),
  });
  void startOwners();
}

function handleConnectRender(
  command: CommandOf<DataWorkerMessageType.ConnectRender>,
): void {
  renderPort?.close();
  renderPort = command.port;
  const interestState = new SessionSequenceState(
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

function envelopeFor(requestId: number | null): DataWorkerEnvelope {
  return {
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
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
  if (event) globalThis.postMessage(event);
}

function handleQuerySource(
  command: CommandOf<DataWorkerMessageType.QuerySource>,
): void {
  const event = sourceCatalog.query(
    command.source,
    envelopeFor(command.requestId),
    command.query,
  );
  if (event) globalThis.postMessage(event);
}

function handleGetTrail(
  command: CommandOf<DataWorkerMessageType.GetTrail>,
): void {
  respond(command.requestId, {
    type: DataWorkerMessageType.Trail,
    id: command.id,
    entry: trailRecorder.get(command.id),
  });
}

async function handleGetAircraftDossier(
  command: CommandOf<DataWorkerMessageType.GetAircraftDossier>,
): Promise<void> {
  respond(command.requestId, {
    type: DataWorkerMessageType.AircraftDossier,
    entityId: command.entityId,
    dossier: await aircraftDossier.get(command.entityId),
  });
}

async function fetchCycloneDossier(
  stormId: string,
): Promise<CycloneDossierResult> {
  const response = await authenticatedFetch(
    `${CycloneRoute.Dossier}/${encodeURIComponent(stormId)}`,
  );
  const result = response.ok
    ? parseCycloneDossierResult(await response.json())
    : null;
  if (!result) throw new Error(DATA_WORKER_OPERATION_FAILED);
  return result;
}

async function cycloneDossierForEntity(
  entityId: string,
): Promise<CycloneDossierBundle | null> {
  const stormId = parseCycloneStormId(cycloneOwner.get(entityId)?.data.stormId);
  if (!stormId) return null;
  const key = `${CYCLONE_DOSSIER_CACHE_PREFIX}${stormId}`;
  const cached = parseCycloneDossierCacheEntry(await store.get(key));
  if (cached && Date.now() - cached.fetchedAt < CYCLONE_DOSSIER_CACHE_FRESHNESS_MS) {
    return cached.bundle;
  }
  try {
    const request = pendingCycloneDossiers.get(stormId) ??
      fetchCycloneDossier(stormId).finally(() => {
        pendingCycloneDossiers.delete(stormId);
      });
    pendingCycloneDossiers.set(stormId, request);
    const { dossier, fetchedAt } = await request;
    if (dossier) await coordinator.set(key, { bundle: dossier, fetchedAt });
    return dossier ?? cached?.bundle ?? null;
  } catch {
    return cached?.bundle ?? null;
  }
}

async function handleGetEarthquakeWaveform(
  command: CommandOf<DataWorkerMessageType.GetEarthquakeWaveform>,
): Promise<void> {
  earthquakeWaveformController?.abort();
  const controller = new AbortController();
  earthquakeWaveformController = controller;
  try {
    const request = command.request;
    const result = await fetchWaveform(
      request.latitude,
      request.longitude,
      request.originTimeIso,
      { signal: controller.signal },
    );
    respond(command.requestId, {
      type: DataWorkerMessageType.EarthquakeWaveform,
      result,
    });
  } finally {
    if (earthquakeWaveformController === controller) {
      earthquakeWaveformController = null;
    }
  }
}

function handleCancelEarthquakeWaveform(): void {
  earthquakeWaveformController?.abort();
  earthquakeWaveformController = null;
}

async function handleGetTsunamiAlerts(
  command: CommandOf<DataWorkerMessageType.GetTsunamiAlerts>,
): Promise<void> {
  respond(command.requestId, {
    type: DataWorkerMessageType.TsunamiAlerts,
    alerts: await fetchTsunamiAlerts(),
  });
}

async function handleGet(
  command: CommandOf<DataWorkerMessageType.Get>,
): Promise<void> {
  respond(command.requestId, {
    type: DataWorkerMessageType.Value,
    value: await store.get(command.key),
  });
}

async function handleImportJson(
  command: CommandOf<DataWorkerMessageType.ImportJson>,
): Promise<void> {
  const value: unknown = JSON.parse(command.json);
  await coordinator.set(command.key, value);
  respond(command.requestId, {
    type: DataWorkerMessageType.Value,
    value,
  });
}

async function handleEstimate(
  command: CommandOf<DataWorkerMessageType.Estimate>,
): Promise<void> {
  respond(command.requestId, {
    type: DataWorkerMessageType.Size,
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
    case DataWorkerMessageType.GetSourceEntity:
      return handleGetSourceEntity(command);
    case DataWorkerMessageType.QuerySource:
      return handleQuerySource(command);
    case DataWorkerMessageType.GetTrail:
      return handleGetTrail(command);
    case DataWorkerMessageType.GetAircraftDossier:
      return handleGetAircraftDossier(command);
    case DataWorkerMessageType.GetCycloneDossier:
      return respond(command.requestId, {
        type: DataWorkerMessageType.CycloneDossier,
        dossier: await cycloneDossierForEntity(command.entityId),
      });
    case DataWorkerMessageType.GetEarthquakeWaveform:
      return handleGetEarthquakeWaveform(command);
    case DataWorkerMessageType.CancelEarthquakeWaveform:
      return handleCancelEarthquakeWaveform();
    case DataWorkerMessageType.GetTsunamiAlerts:
      return handleGetTsunamiAlerts(command);
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
