export const DATA_CACHE_POLICY = {
  databaseName: "sigint-cache",
  databaseVersion: 1,
  storeName: "cache",
  compressionThresholdBytes: 16_384,
  minWriteIntervalMs: 5_000,
} as const;

export type DataCacheStore = Readonly<{
  open: () => Promise<void>;
  get: (key: string) => Promise<unknown | null>;
  getAll: () => Promise<readonly Readonly<{ key: string; value: unknown }>[]>;
  set: (
    key: string,
    value: unknown,
    isCurrent: () => boolean,
  ) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  estimate: (key: string) => Promise<number>;
}>;

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

const compressionAvailable =
  typeof CompressionStream !== "undefined" &&
  typeof DecompressionStream !== "undefined";

async function gzip(value: string): Promise<Uint8Array> {
  const stream = new Blob([value])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(value: Uint8Array): Promise<string> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  const stream = new Blob([copy.buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function encode(value: unknown): Promise<unknown> {
  if (!compressionAvailable) return value;
  try {
    const json = JSON.stringify(value);
    if (
      typeof json !== "string" ||
      json.length < DATA_CACHE_POLICY.compressionThresholdBytes
    ) {
      return value;
    }
    return await gzip(json);
  } catch {
    return value;
  }
}

async function decode(value: unknown): Promise<unknown | null> {
  if (!(value instanceof Uint8Array)) return value;
  try {
    const decoded: unknown = JSON.parse(await gunzip(value));
    return decoded;
  } catch {
    return null;
  }
}

export function createDataCacheStore(
  databaseFactory: IDBFactory,
): DataCacheStore {
  let database: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;

  const openDatabase = (): Promise<IDBDatabase> => {
    if (database) return Promise.resolve(database);
    if (opening) return opening;

    opening = new Promise((resolve, reject) => {
      const request = databaseFactory.open(
        DATA_CACHE_POLICY.databaseName,
        DATA_CACHE_POLICY.databaseVersion,
      );
      request.onupgradeneeded = () => {
        const next = request.result;
        if (!next.objectStoreNames.contains(DATA_CACHE_POLICY.storeName)) {
          next.createObjectStore(DATA_CACHE_POLICY.storeName);
        }
      };
      request.onsuccess = () => {
        database = request.result;
        resolve(request.result);
      };
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB open failed"));
    });
    return opening;
  };

  const getRaw = async (key: string): Promise<unknown | null> => {
    const current = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = current
        .transaction(DATA_CACHE_POLICY.storeName, "readonly")
        .objectStore(DATA_CACHE_POLICY.storeName)
        .get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB read failed"));
    });
  };

  return {
    async open(): Promise<void> {
      await openDatabase();
    },

    async get(key: string): Promise<unknown | null> {
      return decode(await getRaw(key));
    },

    async getAll(): Promise<
      readonly Readonly<{ key: string; value: unknown }>[]
    > {
      const current = await openDatabase();
      const rawEntries = await new Promise<
        readonly Readonly<{ key: string; value: unknown }>[]
      >((resolve, reject) => {
        const store = current
          .transaction(DATA_CACHE_POLICY.storeName, "readonly")
          .objectStore(DATA_CACHE_POLICY.storeName);
        const entries: Array<{ key: string; value: unknown }> = [];
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(entries);
            return;
          }
          if (typeof cursor.key === "string") {
            entries.push({ key: cursor.key, value: cursor.value });
          }
          cursor.continue();
        };
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB cursor failed"));
      });

      const entries: Array<{ key: string; value: unknown }> = [];
      for (const entry of rawEntries) {
        entries.push({
          key: entry.key,
          value: await decode(entry.value),
        });
      }
      return entries;
    },

    async set(
      key: string,
      value: unknown,
      isCurrent: () => boolean,
    ): Promise<void> {
      const stored = await encode(value);
      if (!isCurrent()) return;
      const current = await openDatabase();
      if (!isCurrent()) return;
      const transaction = current.transaction(
        DATA_CACHE_POLICY.storeName,
        "readwrite",
      );
      transaction
        .objectStore(DATA_CACHE_POLICY.storeName)
        .put(stored, key);
      await transactionComplete(transaction);
    },

    async delete(key: string): Promise<void> {
      const current = await openDatabase();
      const transaction = current.transaction(
        DATA_CACHE_POLICY.storeName,
        "readwrite",
      );
      transaction.objectStore(DATA_CACHE_POLICY.storeName).delete(key);
      await transactionComplete(transaction);
    },

    async clear(): Promise<void> {
      const current = await openDatabase();
      const transaction = current.transaction(
        DATA_CACHE_POLICY.storeName,
        "readwrite",
      );
      transaction.objectStore(DATA_CACHE_POLICY.storeName).clear();
      await transactionComplete(transaction);
    },

    async estimate(key: string): Promise<number> {
      const stored = await getRaw(key);
      if (stored === null) return 0;
      if (stored instanceof Uint8Array) return stored.byteLength;
      try {
        const json = JSON.stringify(stored);
        return typeof json === "string" ? json.length : 0;
      } catch {
        return 0;
      }
    },
  };
}
