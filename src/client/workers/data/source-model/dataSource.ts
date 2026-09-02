import type {
  DatasetEntity,
  DatasetPatch,
} from "@/workers/data/datasetStore";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import {
  createPointSourceRuntime,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
  type PointSourceSchedule,
} from "@/workers/data/sourceRuntime";
import type { TimestampedPoint } from "@/workers/data/uiQuery";
import type { PointSourceDefinition } from "@shared/domain/pointSource";
import type { SourceStatus } from "@shared/domain/sourceStatus";
import type { RenderSourceId, SourceId } from "@shared/source";
import type { CacheKey } from "@shared/domain/cache";
import { geoPointsEqual } from "@shared/geo";
import { SourceCompleteness } from "@shared/source";
import {
  recordPosition,
  type PositionedRecord,
} from "@/workers/data/source-model/position";
import type { RemoteSource } from "@/workers/data/source-model/remoteSource";
import {
  TRAIL_POLICY,
  type TrackSource,
} from "@/lib/geo/trails/trailStore";

export enum SourceDomainKind {
  Geo = "geo",
  NonGeo = "non_geo",
}

export enum GeoCarrier {
  Position = "position",
  Polygon = "polygon",
  Path = "path",
}

export enum GeoMotion {
  Stationary = "stationary",
  Moving = "moving",
}

export enum EntityLifetime {
  Ephemeral = "ephemeral",
  Persistent = "persistent",
}

export type SourceRecord = DatasetEntity & TimestampedPoint;

const UNATTACHED_SOURCE_MESSAGE =
  "The data source was used before the worker attached it";

export type UnattachedSourceError = Error & Readonly<{ source: SourceId }>;

export function unattachedSourceError(source: SourceId): UnattachedSourceError {
  return Object.assign(new Error(UNATTACHED_SOURCE_MESSAGE), { source });
}

export type SourceHost<TEntity extends SourceRecord> = Readonly<{
  readCache: (key: CacheKey) => Promise<unknown>;
  deleteCache: (key: CacheKey) => Promise<void> | void;
  persistCache: (key: CacheKey, value: unknown) => void;
  publishStatus: (snapshot: DataWorkerSourceSnapshot) => void;
  publishPatch: (patch: DatasetPatch<TEntity>) => void;
}>;

export type SourcePatchObserver<TEntity extends SourceRecord> = Readonly<{
  observe: (patch: DatasetPatch<TEntity>) => void;
}>;

export type DataSourceRuntimeOptions = Readonly<{
  failureStatus?: (error: unknown) => SourceStatus;
  schedule?: PointSourceSchedule;
}>;

export abstract class DataSource<TEntity extends SourceRecord> {
  abstract readonly kind: SourceDomainKind;
  abstract readonly policy: PointSourceDefinition;

  protected abstract parseCache(value: unknown): readonly TEntity[] | null;
  protected abstract fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<TEntity>
  >;
  protected abstract hasChanged(previous: TEntity, next: TEntity): boolean;

  protected attachedHost: SourceHost<TEntity> | null = null;
  private readonly patchObservers: readonly SourcePatchObserver<TEntity>[];
  private readonly runtimeOptions: DataSourceRuntimeOptions;
  private runtime: PointSourceRuntime<TEntity> | null = null;

  constructor(
    patchObservers: readonly SourcePatchObserver<TEntity>[] = [],
    runtimeOptions: DataSourceRuntimeOptions = {},
  ) {
    this.patchObservers = patchObservers;
    this.runtimeOptions = runtimeOptions;
  }

  attach(host: SourceHost<TEntity>): void {
    this.attachedHost = host;
    const cacheMaxAgeMs = this.cacheMaxAgeMs();
    this.runtime = createPointSourceRuntime<TEntity>({
      id: this.policy.id,
      pollIntervalMs: this.policy.pollIntervalMs,
      ...(this.policy.retryIntervalMs === undefined
        ? {}
        : { retryIntervalMs: this.policy.retryIntervalMs }),
      hasChanged: (previous, next) => this.hasChanged(previous, next),
      ...(cacheMaxAgeMs === null ? {} : { cacheMaxAgeMs }),
      readCache: () => host.readCache(this.policy.cacheKey),
      deleteCache: () => host.deleteCache(this.policy.cacheKey),
      parseCache: (value) => this.parseCache(value),
      persistCache: (snapshot) => {
        host.persistCache(this.policy.cacheKey, snapshot);
      },
      fetchSnapshot: () => this.fetchSnapshot(),
      publishStatus: host.publishStatus,
      publishPatch: (patch) => {
        for (const observer of this.patchObservers) {
          observer.observe(patch);
        }
        host.publishPatch(patch);
      },
      ...(this.runtimeOptions.failureStatus
        ? { failureStatus: this.runtimeOptions.failureStatus }
        : {}),
      ...(this.runtimeOptions.schedule
        ? { schedule: this.runtimeOptions.schedule }
        : {}),
    });
  }

  hydrate(): Promise<void> {
    return this.requireRuntime().hydrate();
  }

  start(): Promise<void> {
    return this.requireRuntime().start();
  }

  refresh(): Promise<void> {
    return this.requireRuntime().refresh();
  }

  get(id: string): TEntity | null {
    return this.requireRuntime().get(id);
  }

  values(): readonly TEntity[] {
    return this.requireRuntime().values();
  }

  snapshot(): DataWorkerSourceSnapshot {
    return this.requireRuntime().snapshot();
  }

  /** Cap on cached-envelope age at hydration; null accepts any age. */
  protected cacheMaxAgeMs(): number | null {
    return null;
  }

  protected requireHost(): SourceHost<TEntity> {
    const host = this.attachedHost;
    if (!host) throw unattachedSourceError(this.policy.id);
    return host;
  }

  protected requireRuntime(): PointSourceRuntime<TEntity> {
    const runtime = this.runtime;
    if (!runtime) throw unattachedSourceError(this.policy.id);
    return runtime;
  }
}

export abstract class GeoDataSource<
  TEntity extends SourceRecord,
> extends DataSource<TEntity> {
  readonly kind = SourceDomainKind.Geo;

  abstract readonly carrier: GeoCarrier;
  abstract readonly motion: GeoMotion;
  abstract readonly lifetime: EntityLifetime;

  publishRebase(): void {
    const patch = this.requireRuntime().rebase();
    if (patch) this.requireHost().publishPatch(patch);
  }
}

export abstract class StationaryGeoDataSource<
  TEntity extends SourceRecord,
> extends GeoDataSource<TEntity> {
  readonly motion = GeoMotion.Stationary;
}
export type PointSourceOptions<TEntity extends SourceRecord> = Readonly<{
  fetchPoints?: () => Promise<readonly TEntity[]>;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<TEntity>>;
  now?: () => number;
  patchObservers?: readonly SourcePatchObserver<TEntity>[];
  schedule?: PointSourceSchedule;
}>;

export type PointSourceSpec<
  TEntity extends SourceRecord,
  TId extends RenderSourceId = RenderSourceId,
> = Readonly<{
  policy: PointSourceDefinition<TId>;
  carrier: GeoCarrier;
  parseCache: (value: unknown) => readonly TEntity[] | null;
  fetchSnapshot: () => Promise<PointSourceFetchSnapshot<TEntity>>;
  hasChanged: (previous: TEntity, next: TEntity) => boolean;
  failureStatus?: (error: unknown) => SourceStatus;
  patchObservers?: readonly SourcePatchObserver<TEntity>[];
  schedule?: PointSourceSchedule;
}>;

/** One geo source described by its spec instead of a subclass. */
abstract class SpecPointSource<
  TId extends RenderSourceId,
  TEntity extends SourceRecord,
> extends GeoDataSource<TEntity> {
  readonly policy: PointSourceDefinition<TId>;
  readonly carrier: GeoCarrier;
  readonly lifetime = EntityLifetime.Ephemeral;

  private readonly spec: PointSourceSpec<TEntity, TId>;

  constructor(spec: PointSourceSpec<TEntity, TId>) {
    super(spec.patchObservers ?? [], {
      ...(spec.failureStatus ? { failureStatus: spec.failureStatus } : {}),
      ...(spec.schedule ? { schedule: spec.schedule } : {}),
    });
    this.spec = spec;
    this.policy = spec.policy;
    this.carrier = spec.carrier;
  }

  protected parseCache(value: unknown): readonly TEntity[] | null {
    return this.spec.parseCache(value);
  }

  protected fetchSnapshot(): Promise<PointSourceFetchSnapshot<TEntity>> {
    return this.spec.fetchSnapshot();
  }

  protected hasChanged(previous: TEntity, next: TEntity): boolean {
    return this.spec.hasChanged(previous, next);
  }
}

export class StationaryPointSource<
  TId extends RenderSourceId,
  TEntity extends SourceRecord,
> extends SpecPointSource<TId, TEntity> {
  readonly motion = GeoMotion.Stationary;
}

export class MovingPointSource<
  TId extends TrackSource & RenderSourceId,
  TEntity extends SourceRecord,
> extends SpecPointSource<TId, TEntity> {
  readonly motion = GeoMotion.Moving;

  /** A mover's cache is dead once its trail would be; purge, then repoll. */
  protected override cacheMaxAgeMs(): number {
    return TRAIL_POLICY[this.policy.id].staleMs;
  }
}

/** A test double overrides the feed; production reads the feed. */
export function feedFetch<TEntity extends SourceRecord>(
  options: PointSourceOptions<TEntity>,
  feed: RemoteSource<TEntity>,
): () => Promise<PointSourceFetchSnapshot<TEntity>> {
  const now = options.now ?? Date.now;
  if (options.fetchSnapshot) return options.fetchSnapshot;
  const fetchPoints = options.fetchPoints;
  if (!fetchPoints) return () => feed.fetchSnapshot(now);
  return async () => ({
    completeness: SourceCompleteness.Complete,
    entities: await fetchPoints(),
    observedAt: now(),
  });
}

type ChangeableRecord<TData> = PositionedRecord &
  Readonly<{ timestamp?: string; data: TData }>;

export function recordChanged<TData>(
  dataEquals: (previous: TData, next: TData) => boolean,
): (
  previous: ChangeableRecord<TData>,
  next: ChangeableRecord<TData>,
) => boolean {
  return (previous, next) =>
    !geoPointsEqual(recordPosition(previous), recordPosition(next)) ||
    previous.timestamp !== next.timestamp ||
    !dataEquals(previous.data, next.data);
}
