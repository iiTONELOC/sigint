// ── IndexedDB-backed cache service ───────────────────────────────────
// Replaces all localStorage usage in the app.
//
// Usage:
//   await cacheInit();              // call once at boot before anything reads
//   await cacheSet("key", value)    // async write to IndexedDB + memory
//   await cacheDelete("key")        // async delete from IndexedDB + memory
//
// All reads await dbReady so they never return null just because
// IndexedDB hasn't opened yet. The dbReady promise resolves once
// cacheInit finishes (or immediately if init was already done/skipped).

import { CACHE_KEYS } from "@/lib/cacheKeys";

const DB_NAME = "sigint-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";

let db: IDBDatabase | null = null;
const memoryCache = new Map<string, unknown>();

// ── dbReady gate ─────────────────────────────────────────────────────
// Resolves when cacheInit() completes (success or failure).
// If cacheInit was never called (e.g. test env), public functions
// skip the gate and use the in-memory cache directly.
let _resolveReady: () => void;
let _initCalled = false;
const _dbReadyPromise: Promise<void> = new Promise((resolve) => {
  _resolveReady = resolve;
});

/** Await only if cacheInit has been called; otherwise proceed immediately. */
function dbReady(): Promise<void> {
  return _initCalled ? _dbReadyPromise : Promise.resolve();
}

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
  const keys = [CACHE_KEYS.aircraft, CACHE_KEYS.trails, CACHE_KEYS.land];

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

const TRAILS_CACHE_KEY = CACHE_KEYS.trails;
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
 * Initialize the cache service. Must be called once at boot.
 * Loads all IndexedDB entries into memory, then resolves dbReady
 * so all subsequent reads/writes proceed.
 */
export async function cacheInit(): Promise<void> {
  _initCalled = true;

  if (typeof window === "undefined") {
    _resolveReady();
    return;
  }

  try {
    db = await openDB();
  } catch {
    _resolveReady();
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

  // Purge poisoned data caches — if a provider's cache has { data: [] }
  // from a previous empty upstream response, nuke it so hydration falls
  // through and the next poll fetches fresh data from the server.
  // MUST run before _resolveReady so providers don't hydrate poisoned entries.
  const dataCacheKeys = [
    CACHE_KEYS.aircraft,
    CACHE_KEYS.earthquake,
    CACHE_KEYS.events,
    CACHE_KEYS.ships,
    CACHE_KEYS.fires,
    CACHE_KEYS.weather,
    CACHE_KEYS.news,
  ];
  for (const key of dataCacheKeys) {
    const entry = memoryCache.get(key) as
      | { data?: unknown[]; timestamp?: number }
      | null
      | undefined;
    if (
      entry &&
      typeof entry === "object" &&
      Array.isArray(entry.data) &&
      entry.data.length === 0
    ) {
      memoryCache.delete(key);
      idbDelete(key).catch(() => {});
    }
  }

  // Signal that the database is ready — readers unblock NOW.
  _resolveReady();

  // Clean up stale data (non-blocking — readers already unblocked)
  await pruneTrailData();
}

/**
 * Async read — checks memory first (instant, no await). Only gates
 * on dbReady for the IDB fallback so providers aren't blocked during init.
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  // Fast path — memory hit returns immediately, no waiting on init
  const mem = memoryCache.get(key);
  if (mem !== undefined) return mem as T;

  // Slow path — wait for init to finish, then try IDB
  await dbReady();

  // Re-check memory — cacheInit may have populated it while we waited
  const mem2 = memoryCache.get(key);
  if (mem2 !== undefined) return mem2 as T;

  const idb = await idbGet(key);
  if (idb !== undefined && idb !== null) {
    memoryCache.set(key, idb);
    return idb as T;
  }
  return null;
}

/**
 * Write to memory (immediate) + IndexedDB (after dbReady).
 * Memory write is instant so subsequent cacheGet hits immediately.
 */
export async function cacheSet(key: string, value: unknown): Promise<void> {
  memoryCache.set(key, value);
  await dbReady();
  idbSet(key, value).catch(() => {});
}

/**
 * Delete from memory (immediate) + IndexedDB (awaited).
 */
export async function cacheDelete(key: string): Promise<void> {
  memoryCache.delete(key);
  await dbReady();
  await idbDelete(key);
}

/**
 * List all cache keys currently in memory.
 * Awaits dbReady so the full set is available.
 */
export async function cacheListKeys(): Promise<string[]> {
  await dbReady();
  return Array.from(memoryCache.keys()).sort();
}

/**
 * Estimate the byte size of a cached value (JSON serialization length).
 * Awaits dbReady so the value is available.
 */
export async function cacheEstimateSize(key: string): Promise<number> {
  await dbReady();
  const value = memoryCache.get(key);
  if (value == null) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * Clear all cache entries from memory and IndexedDB.
 * Awaits all IDB deletes so callers can safely reload after.
 */
export async function cacheClearAll(): Promise<void> {
  const keys = Array.from(memoryCache.keys());
  for (const key of keys) {
    memoryCache.delete(key);
  }
  await dbReady();
  await Promise.all(keys.map((key) => idbDelete(key)));
}
