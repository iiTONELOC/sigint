import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
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
import type { PointUiQueries, TimestampedPoint } from "@/workers/data/uiQuery";
import type { PointType } from "@shared/domain/pointType";
import type { SourceCompletenessPolicy } from "@shared/domain/sourcePolicy";
import type { SourceStatus } from "@shared/domain/sourceStatus";
import type { SourceId } from "@shared/source";
import type { CacheKey } from "@/lib/cache/cacheKeys";

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

export type SourcePolicy = Readonly<{
  id: SourceId;
  cacheKey: CacheKey;
  pollIntervalMs: number;
  retryIntervalMs?: number;
  completeness: SourceCompletenessPolicy;
  emptyResultIsComplete: boolean;
}>;

export type SourceRecord = DatasetEntity & TimestampedPoint;

const UNATTACHED_SOURCE_MESSAGE =
  "The data source was used before the worker attached it";

export type UnattachedSourceError = Error & Readonly<{ source: SourceId }>;

export function unattachedSourceError(source: SourceId): UnattachedSourceError {
  return Object.assign(new Error(UNATTACHED_SOURCE_MESSAGE), { source });
}

export type SourceHost<TEntity extends SourceRecord> = Readonly<{
  readCache: (key: CacheKey) => Promise<unknown>;
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
  abstract readonly policy: SourcePolicy;
  abstract readonly queries: PointUiQueries<TEntity>;

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
    this.runtime = createPointSourceRuntime<TEntity>({
      id: this.policy.id,
      cacheKey: this.policy.cacheKey,
      pollIntervalMs: this.policy.pollIntervalMs,
      ...(this.policy.retryIntervalMs === undefined
        ? {}
        : { retryIntervalMs: this.policy.retryIntervalMs }),
      maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
      hasChanged: (previous, next) => this.hasChanged(previous, next),
      readCache: () => host.readCache(this.policy.cacheKey),
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
  abstract readonly pointType: PointType;

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
