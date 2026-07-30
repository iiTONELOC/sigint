import { SourceCompleteness } from "@shared/source";

export type DatasetCompleteness =
  | SourceCompleteness.Complete
  | SourceCompleteness.Partial;

export type DatasetEntity = Readonly<{
  id: string;
}>;

export type DatasetSnapshot<TEntity extends DatasetEntity> = Readonly<{
  version: number;
  completeness: DatasetCompleteness;
  entities: readonly TEntity[];
}>;

export enum DatasetPatchKind {
  Rebase = "rebase",
  Patch = "patch",
}

export type DatasetPatch<TEntity extends DatasetEntity> = Readonly<{
  kind: DatasetPatchKind;
  version: number;
  upserts: readonly TEntity[];
  deletedIds: readonly string[];
}>;

export type DatasetQuery<TEntity extends DatasetEntity> = Readonly<{
  offset: number;
  limit: number;
  match: (entity: TEntity) => boolean;
  compare: (left: TEntity, right: TEntity) => number;
}>;

export type DatasetQueryResult<TEntity extends DatasetEntity> = Readonly<{
  version: number;
  total: number;
  items: readonly TEntity[];
}>;

export type DatasetStoreOptions<
  TEntity extends DatasetEntity = DatasetEntity,
> = Readonly<{
  maxQueryItems: number;
  maxQueryOffset?: number;
  batchSize?: number;
  yieldTask?: () => Promise<void>;
  hasChanged?: (previous: TEntity, next: TEntity) => boolean;
}>;

export type DatasetStore<TEntity extends DatasetEntity> = Readonly<{
  applySnapshot: (
    snapshot: DatasetSnapshot<TEntity>,
  ) => Promise<DatasetPatch<TEntity>>;
  get: (id: string) => TEntity | null;
  size: () => number;
  version: () => number;
  values: () => IterableIterator<TEntity>;
  query: (
    query: DatasetQuery<TEntity>,
  ) => Promise<DatasetQueryResult<TEntity>>;
}>;

enum DatasetStoreDefault {
  BatchSize = 4_096,
  MaxQueryOffset = 10_000,
}

enum DatasetStoreErrorKind {
  DuplicateId = "Duplicate dataset id",
  InvalidMaxQueryItems = "maxQueryItems must be a positive integer",
  NonIncreasingVersion = "Dataset versions must increase",
}

class DatasetStoreError extends Error {
  readonly kind: DatasetStoreErrorKind;
  readonly entityId: string | null;

  constructor(kind: DatasetStoreErrorKind, entityId: string | null = null) {
    super(kind);
    this.name = DatasetStoreError.name;
    this.kind = kind;
    this.entityId = entityId;
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function validateOptions(
  options: Readonly<{ maxQueryItems: number }>,
): void {
  if (!Number.isSafeInteger(options.maxQueryItems) || options.maxQueryItems < 1) {
    throw new DatasetStoreError(DatasetStoreErrorKind.InvalidMaxQueryItems);
  }
}

function validateSnapshotVersion(current: number, next: number): void {
  if (!Number.isSafeInteger(next) || next <= current) {
    throw new DatasetStoreError(DatasetStoreErrorKind.NonIncreasingVersion);
  }
}

function insertCandidate<TEntity>(
  selected: TEntity[],
  entity: TEntity,
  capacity: number,
  compare: (left: TEntity, right: TEntity) => number,
): void {
  if (capacity === 0) return;
  const index = selected.findIndex(
    (candidate) => compare(entity, candidate) < 0,
  );
  if (index < 0) {
    selected.push(entity);
  } else {
    selected.splice(index, 0, entity);
  }
  if (selected.length > capacity) selected.pop();
}

class InMemoryDatasetStore<TEntity extends DatasetEntity>
  implements DatasetStore<TEntity>
{
  private readonly batchSize: number;
  private readonly hasChanged: (
    previous: TEntity,
    next: TEntity,
  ) => boolean;
  private readonly maxQueryItems: number;
  private readonly maxQueryOffset: number;
  private readonly yieldTask: () => Promise<void>;
  private currentVersion = 0;
  private entities = new Map<string, TEntity>();

  constructor(options: DatasetStoreOptions<TEntity>) {
    validateOptions(options);
    this.batchSize = options.batchSize ?? DatasetStoreDefault.BatchSize;
    this.hasChanged =
      options.hasChanged ??
      ((previous: TEntity, next: TEntity) => previous !== next);
    this.maxQueryItems = options.maxQueryItems;
    this.maxQueryOffset =
      options.maxQueryOffset ?? DatasetStoreDefault.MaxQueryOffset;
    this.yieldTask = options.yieldTask ?? yieldToEventLoop;
  }

  async applySnapshot(
    snapshot: DatasetSnapshot<TEntity>,
  ): Promise<DatasetPatch<TEntity>> {
    validateSnapshotVersion(this.currentVersion, snapshot.version);
    const firstSnapshot = this.currentVersion === 0;
    let deletedIds: readonly string[] = [];
    let upserts: readonly TEntity[];

    if (snapshot.completeness === SourceCompleteness.Complete) {
      const delta = await this.applyComplete(snapshot);
      deletedIds = delta.deletedIds;
      upserts = delta.upserts;
    } else {
      upserts = await this.applyPartial(snapshot);
    }

    this.currentVersion = snapshot.version;
    return {
      kind: firstSnapshot ? DatasetPatchKind.Rebase : DatasetPatchKind.Patch,
      version: this.currentVersion,
      upserts,
      deletedIds,
    };
  }

  get(id: string): TEntity | null {
    return this.entities.get(id) ?? null;
  }

  size(): number {
    return this.entities.size;
  }

  version(): number {
    return this.currentVersion;
  }

  values(): IterableIterator<TEntity> {
    return this.entities.values();
  }

  async query(
    query: DatasetQuery<TEntity>,
  ): Promise<DatasetQueryResult<TEntity>> {
    const limit = Math.max(
      0,
      Math.min(Math.trunc(query.limit), this.maxQueryItems),
    );
    const offset = Math.max(
      0,
      Math.min(Math.trunc(query.offset), this.maxQueryOffset),
    );
    const capacity = offset + limit;
    const selected: TEntity[] = [];
    let processed = 0;
    let total = 0;

    for (const entity of this.entities.values()) {
      if (query.match(entity)) {
        total += 1;
        insertCandidate(selected, entity, capacity, query.compare);
      }
      processed += 1;
      await this.yieldAfterBatch(processed);
    }

    return {
      version: this.currentVersion,
      total,
      items: selected.slice(offset, offset + limit),
    };
  }

  private async applyComplete(
    snapshot: DatasetSnapshot<TEntity>,
  ): Promise<Readonly<{
    upserts: readonly TEntity[];
    deletedIds: readonly string[];
  }>> {
    const next = new Map<string, TEntity>();
    const upserts: TEntity[] = [];
    let processed = 0;

    for (const entity of snapshot.entities) {
      if (next.has(entity.id)) {
        throw new DatasetStoreError(
          DatasetStoreErrorKind.DuplicateId,
          entity.id,
        );
      }
      const previous = this.entities.get(entity.id);
      if (!previous || this.hasChanged(previous, entity)) {
        upserts.push(entity);
      }
      next.set(entity.id, entity);
      processed += 1;
      await this.yieldAfterBatch(processed);
    }

    const deletedIds: string[] = [];
    for (const id of this.entities.keys()) {
      if (!next.has(id)) deletedIds.push(id);
      processed += 1;
      await this.yieldAfterBatch(processed);
    }

    this.entities = next;
    return { upserts, deletedIds };
  }

  private async applyPartial(
    snapshot: DatasetSnapshot<TEntity>,
  ): Promise<readonly TEntity[]> {
    const ids = new Set<string>();
    const upserts: TEntity[] = [];
    let processed = 0;

    for (const entity of snapshot.entities) {
      if (ids.has(entity.id)) {
        throw new DatasetStoreError(
          DatasetStoreErrorKind.DuplicateId,
          entity.id,
        );
      }
      ids.add(entity.id);
      const previous = this.entities.get(entity.id);
      if (!previous || this.hasChanged(previous, entity)) {
        upserts.push(entity);
      }
      this.entities.set(entity.id, entity);
      processed += 1;
      await this.yieldAfterBatch(processed);
    }
    return upserts;
  }

  private async yieldAfterBatch(processed: number): Promise<void> {
    if (processed > 0 && processed % this.batchSize === 0) {
      await this.yieldTask();
    }
  }
}

export function createDatasetStore<TEntity extends DatasetEntity>(
  options: DatasetStoreOptions<TEntity>,
): DatasetStore<TEntity> {
  return new InMemoryDatasetStore(options);
}
