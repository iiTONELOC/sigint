// ── IndexedDB-backed cache service ───────────────────────────────────
// Replaces all localStorage usage in the app.
//
// Usage:
//   await cacheInit();              // call once at boot before anything reads
//   cacheGet<T>("key")              // sync read from memory
//   cacheSet("key", value)          // async write to IndexedDB + memory
//   cacheDelete("key")              // async delete from IndexedDB + memory
//
// All reads are synchronous from an in-memory Map (populated at init).
// All writes go to both memory (immediate) and IndexedDB (fire-and-forget).

const DB_NAME = "sigint-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";

let db: IDBDatabase | null = null;
const memoryCache = new Map<string, unknown>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(): Promise<Array<{ key: string; value: unknown }>> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const results: Array<{ key: string; value: unknown }> = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push({ key: cursor.key as string, value: cursor.value });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Migrate from localStorage ────────────────────────────────────────
// On first run, move existing localStorage data to IndexedDB so users
// don't lose their cached aircraft/trail/land data.

async function migrateFromLocalStorage(): Promise<void> {
  const keys = [
    "sigint.opensky.aircraft-cache.v1",
    "sigint.trails.v1",
    "sigint.land.hd.v1",
  ];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const parsed = JSON.parse(raw);
      await idbSet(key, parsed);
      memoryCache.set(key, parsed);
      localStorage.removeItem(key);
    } catch {}
  }
}

// ── Staleness cleanup ────────────────────────────────────────────────

const TRAILS_CACHE_KEY = "sigint.trails.v1";
const MAX_TRAIL_POINTS = 50; // ~3.3 hours at 4-min intervals
const TRAIL_MAX_AGE = 24 * 60 * 60_000; // 24 hours

async function pruneTrailData(): Promise<void> {
  const trails = memoryCache.get(TRAILS_CACHE_KEY) as
    | Record<string, { points?: unknown[]; lastSeen?: number }>
    | null
    | undefined;
  if (trails && typeof trails === "object") {
    let changed = false;
    const now = Date.now();
    for (const id of Object.keys(trails)) {
      const entry = trails[id];
      if (!entry) continue;

      // Remove entries older than 24 hours
      if (
        typeof entry.lastSeen === "number" &&
        now - entry.lastSeen > TRAIL_MAX_AGE
      ) {
        delete trails[id];
        changed = true;
        continue;
      }

      // Cap points per entity
      if (
        entry.points &&
        Array.isArray(entry.points) &&
        entry.points.length > MAX_TRAIL_POINTS
      ) {
        entry.points = entry.points.slice(-MAX_TRAIL_POINTS);
        changed = true;
      }
    }
    if (changed) {
      memoryCache.set(TRAILS_CACHE_KEY, trails);
      idbSet(TRAILS_CACHE_KEY, trails).catch(() => {});
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Initialize the cache service. Must be called once before any reads.
 * Loads all IndexedDB entries into memory for sync access.
 */
export async function cacheInit(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    db = await openDB();
  } catch {
    return;
  }

  // Migrate any existing localStorage data first
  await migrateFromLocalStorage();

  // Load all entries into memory
  try {
    const entries = await idbGetAll();
    for (const { key, value } of entries) {
      memoryCache.set(key, value);
    }
  } catch {}

  // Clean up stale data
  await pruneTrailData();
}

/**
 * Sync read from in-memory cache. Returns null if key doesn't exist.
 */
export function cacheGet<T = unknown>(key: string): T | null {
  const value = memoryCache.get(key);
  return (value as T) ?? null;
}

/**
 * Write to memory (immediate) and IndexedDB (async, fire-and-forget).
 */
export function cacheSet(key: string, value: unknown): void {
  memoryCache.set(key, value);
  idbSet(key, value).catch(() => {});
}

/**
 * Delete from memory (immediate) and IndexedDB (async, fire-and-forget).
 */
export function cacheDelete(key: string): void {
  memoryCache.delete(key);
  idbDelete(key).catch(() => {});
}
