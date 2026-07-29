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

export type DatasetPatch<TEntity extends DatasetEntity> = Readonly<{
  kind: "rebase" | "patch";
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

const DEFAULT_BATCH_SIZE = 4_096;
const DEFAULT_MAX_QUERY_OFFSET = 10_000;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function validateOptions(
  options: Readonly<{ maxQueryItems: number }>,
): void {
  if (!Number.isSafeInteger(options.maxQueryItems) || options.maxQueryItems < 1) {
    throw new Error("maxQueryItems must be a positive integer");
  }
}

function validateSnapshotVersion(current: number, next: number): void {
  if (!Number.isSafeInteger(next) || next <= current) {
    throw new Error("Dataset versions must increase");
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

export function createDatasetStore<TEntity extends DatasetEntity>(
  options: DatasetStoreOptions<TEntity>,
): DatasetStore<TEntity> {
  validateOptions(options);

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxQueryOffset =
    options.maxQueryOffset ?? DEFAULT_MAX_QUERY_OFFSET;
  const yieldTask = options.yieldTask ?? yieldToEventLoop;
  const hasChanged =
    options.hasChanged ??
    ((previous: TEntity, next: TEntity) => previous !== next);
  let entities = new Map<string, TEntity>();
  let currentVersion = 0;

  const yieldAfterBatch = async (processed: number): Promise<void> => {
    if (processed > 0 && processed % batchSize === 0) {
      await yieldTask();
    }
  };

  const applyComplete = async (
    snapshot: DatasetSnapshot<TEntity>,
  ): Promise<Readonly<{
    upserts: readonly TEntity[];
    deletedIds: readonly string[];
  }>> => {
    const next = new Map<string, TEntity>();
    const upserts: TEntity[] = [];
    let processed = 0;

    for (const entity of snapshot.entities) {
      if (next.has(entity.id)) {
        throw new Error(`Duplicate dataset id: ${entity.id}`);
      }
      const previous = entities.get(entity.id);
      if (!previous || hasChanged(previous, entity)) {
        upserts.push(entity);
      }
      next.set(entity.id, entity);
      processed += 1;
      await yieldAfterBatch(processed);
    }

    const deletedIds: string[] = [];
    for (const id of entities.keys()) {
      if (!next.has(id)) deletedIds.push(id);
      processed += 1;
      await yieldAfterBatch(processed);
    }

    entities = next;
    return { upserts, deletedIds };
  };

  const applyPartial = async (
    snapshot: DatasetSnapshot<TEntity>,
  ): Promise<readonly TEntity[]> => {
    const ids = new Set<string>();
    const upserts: TEntity[] = [];
    let processed = 0;

    for (const entity of snapshot.entities) {
      if (ids.has(entity.id)) {
        throw new Error(`Duplicate dataset id: ${entity.id}`);
      }
      ids.add(entity.id);
      const previous = entities.get(entity.id);
      if (!previous || hasChanged(previous, entity)) {
        upserts.push(entity);
      }
      entities.set(entity.id, entity);
      processed += 1;
      await yieldAfterBatch(processed);
    }
    return upserts;
  };

  return {
    async applySnapshot(
      snapshot: DatasetSnapshot<TEntity>,
    ): Promise<DatasetPatch<TEntity>> {
      validateSnapshotVersion(currentVersion, snapshot.version);
      const firstSnapshot = currentVersion === 0;
      let deletedIds: readonly string[] = [];
      let upserts: readonly TEntity[];

      if (snapshot.completeness === SourceCompleteness.Complete) {
        const result = await applyComplete(snapshot);
        deletedIds = result.deletedIds;
        upserts = result.upserts;
      } else {
        upserts = await applyPartial(snapshot);
      }

      currentVersion = snapshot.version;
      return {
        kind: firstSnapshot ? "rebase" : "patch",
        version: currentVersion,
        upserts,
        deletedIds,
      };
    },

    get(id: string): TEntity | null {
      return entities.get(id) ?? null;
    },

    size(): number {
      return entities.size;
    },

    version(): number {
      return currentVersion;
    },

    values(): IterableIterator<TEntity> {
      return entities.values();
    },

    async query(
      query: DatasetQuery<TEntity>,
    ): Promise<DatasetQueryResult<TEntity>> {
      const limit = Math.max(
        0,
        Math.min(Math.trunc(query.limit), options.maxQueryItems),
      );
      const offset = Math.max(
        0,
        Math.min(Math.trunc(query.offset), maxQueryOffset),
      );
      const capacity = offset + limit;
      const selected: TEntity[] = [];
      let total = 0;
      let processed = 0;

      for (const entity of entities.values()) {
        if (query.match(entity)) {
          total += 1;
          insertCandidate(selected, entity, capacity, query.compare);
        }
        processed += 1;
        await yieldAfterBatch(processed);
      }

      return {
        version: currentVersion,
        total,
        items: selected.slice(offset, offset + limit),
      };
    },
  };
}
