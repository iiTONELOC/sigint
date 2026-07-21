export type DeferredWriteScheduler = (
  callback: () => void,
  delayMs: number,
) => () => void;

export type DeferredWriteCoordinatorOptions<T> = Readonly<{
  minWriteIntervalMs: number;
  now: () => number;
  ready: () => Promise<void>;
  schedule: DeferredWriteScheduler;
  write: (
    key: string,
    value: T,
    isCurrent: () => boolean,
  ) => Promise<void>;
}>;

export type DeferredWriteCoordinator<T> = Readonly<{
  set: (key: string, value: T) => Promise<void>;
  setDeferred: (key: string, value: T) => void;
  delete: (
    key: string,
    deleteStored: () => Promise<void>,
  ) => Promise<void>;
  clear: (clearStored: () => Promise<void>) => Promise<void>;
  flush: () => Promise<void>;
}>;

type WriteToken = Readonly<{
  key: string;
  generation: number;
  epoch: number;
  globalBarrier: Promise<void>;
  keyBarrier: Promise<void>;
}>;

type PendingWrite<T> = Readonly<{
  token: WriteToken;
  value: T;
}>;

const RESOLVED = Promise.resolve();

function settled(promise: Promise<void>): Promise<void> {
  return promise.then(
    () => undefined,
    () => undefined,
  );
}

async function settleAll(promises: readonly Promise<void>[]): Promise<void> {
  await Promise.all(promises.map(settled));
}

export function createDeferredWriteCoordinator<T>(
  options: DeferredWriteCoordinatorOptions<T>,
): DeferredWriteCoordinator<T> {
  let epoch = 0;
  let globalBarrier = RESOLVED;
  let cancelScheduled: (() => void) | null = null;
  let scheduledAt = Number.POSITIVE_INFINITY;

  const generations = new Map<string, number>();
  const pending = new Map<string, PendingWrite<T>>();
  const tails = new Map<string, Promise<void>>();
  const keyBarriers = new Map<string, Promise<void>>();
  const lastWriteAt = new Map<string, number>();

  const isCurrent = (token: WriteToken): boolean =>
    token.epoch === epoch &&
    token.generation === generations.get(token.key);

  const nextToken = (key: string): WriteToken => {
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    return {
      key,
      generation,
      epoch,
      globalBarrier,
      keyBarrier: keyBarriers.get(key) ?? RESOLVED,
    };
  };

  const cancelFlush = (): void => {
    cancelScheduled?.();
    cancelScheduled = null;
    scheduledAt = Number.POSITIVE_INFINITY;
  };

  const scheduleFlush = (delayMs = 0): void => {
    const dueAt = options.now() + delayMs;
    if (cancelScheduled && dueAt >= scheduledAt) return;
    cancelFlush();
    scheduledAt = dueAt;
    cancelScheduled = options.schedule(() => {
      cancelScheduled = null;
      scheduledAt = Number.POSITIVE_INFINITY;
      flushDue();
    }, delayMs);
  };

  const queueWrite = (entry: PendingWrite<T>): Promise<void> => {
    const { token, value } = entry;
    const previous = tails.get(token.key) ?? RESOLVED;
    const task = settled(previous).then(async () => {
      await Promise.all([token.globalBarrier, token.keyBarrier]);
      await options.ready();
      if (!isCurrent(token)) return;
      await options.write(token.key, value, () => isCurrent(token));
    });
    tails.set(token.key, task);

    const finish = (): void => {
      if (tails.get(token.key) === task) tails.delete(token.key);
      if (pending.has(token.key)) scheduleFlush();
    };
    task.then(finish, finish);
    return task;
  };

  const startPending = (
    key: string,
    entry: PendingWrite<T>,
    now: number,
  ): Promise<void> | null => {
    if (pending.get(key) !== entry) return null;
    pending.delete(key);
    lastWriteAt.set(key, now);
    return queueWrite(entry);
  };

  const flushDue = (): void => {
    const now = options.now();
    let nextDelay = Number.POSITIVE_INFINITY;
    for (const [key, entry] of pending) {
      const elapsed = now - (lastWriteAt.get(key) ?? 0);
      const wait = options.minWriteIntervalMs - elapsed;
      if (wait > 0) {
        nextDelay = Math.min(nextDelay, wait);
        continue;
      }
      startPending(key, entry, now);
    }
    if (nextDelay !== Number.POSITIVE_INFINITY) {
      scheduleFlush(nextDelay);
    }
  };

  const set = (key: string, value: T): Promise<void> => {
    pending.delete(key);
    const entry = { token: nextToken(key), value };
    return queueWrite(entry);
  };

  const setDeferred = (key: string, value: T): void => {
    pending.set(key, { token: nextToken(key), value });
    scheduleFlush();
  };

  const deleteKey = (
    key: string,
    deleteStored: () => Promise<void>,
  ): Promise<void> => {
    generations.set(key, (generations.get(key) ?? 0) + 1);
    pending.delete(key);
    lastWriteAt.delete(key);

    const blockers = [
      tails.get(key) ?? RESOLVED,
      keyBarriers.get(key) ?? RESOLVED,
      globalBarrier,
    ];
    const task = settleAll(blockers)
      .then(options.ready)
      .then(deleteStored);
    const barrier = settled(task);
    keyBarriers.set(key, barrier);

    const finish = (): void => {
      if (keyBarriers.get(key) === barrier) keyBarriers.delete(key);
    };
    task.then(finish, finish);
    return task;
  };

  const clear = (clearStored: () => Promise<void>): Promise<void> => {
    epoch += 1;
    pending.clear();
    lastWriteAt.clear();
    cancelFlush();

    const blockers = [
      globalBarrier,
      ...tails.values(),
      ...keyBarriers.values(),
    ];
    const task = settleAll(blockers)
      .then(options.ready)
      .then(clearStored);
    const barrier = settled(task);
    globalBarrier = barrier;

    const finish = (): void => {
      if (globalBarrier === barrier) globalBarrier = RESOLVED;
    };
    task.then(finish, finish);
    return task;
  };

  const flush = async (): Promise<void> => {
    cancelFlush();
    while (pending.size > 0 || tails.size > 0) {
      const now = options.now();
      for (const [key, entry] of [...pending]) {
        startPending(key, entry, now);
      }
      const active = [...tails.values()];
      if (active.length === 0) break;
      await settleAll(active);
    }
  };

  return {
    set,
    setDeferred,
    delete: deleteKey,
    clear,
    flush,
  };
}
