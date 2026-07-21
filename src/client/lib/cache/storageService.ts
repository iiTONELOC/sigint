import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import {
  getDataWorkerClient,
  type DataWorkerClient,
} from "@/lib/cache/dataWorkerClient";

const memoryCache = new Map<string, unknown>();

let activeClient: DataWorkerClient | null = null;
let initialization: Promise<void> | null = null;

function ready(): Promise<void> {
  return initialization ?? Promise.resolve();
}

async function migrateLocalStorage(
  client: DataWorkerClient,
): Promise<void> {
  const keys = [CACHE_KEYS.aircraft, CACHE_KEYS.trails, CACHE_KEYS.land];
  for (const key of keys) {
    try {
      const json = localStorage.getItem(key);
      if (json === null) continue;
      const value = await client.importJson(key, json);
      memoryCache.set(key, value);
      localStorage.removeItem(key);
    } catch {}
  }
}

async function initialize(): Promise<void> {
  if (typeof window === "undefined") return;
  const client = getDataWorkerClient();
  if (!client) return;
  activeClient = client;

  try {
    const entries = await client.init();
    for (const entry of entries) {
      if (!memoryCache.has(entry.key)) {
        memoryCache.set(entry.key, entry.value);
      }
    }
    await migrateLocalStorage(client);
  } catch {
    activeClient = null;
  }
}

export function cacheInit(): Promise<void> {
  initialization ??= initialize();
  return initialization;
}

export function cacheGet<T = unknown>(key: string): Promise<T | null>;
export async function cacheGet(key: string): Promise<unknown | null> {
  const memoryValue = memoryCache.get(key);
  if (memoryValue !== undefined) return memoryValue;

  await ready();

  const initializedValue = memoryCache.get(key);
  if (initializedValue !== undefined) return initializedValue;
  if (!activeClient) return null;

  try {
    const stored = await activeClient.get(key);
    if (stored !== null) memoryCache.set(key, stored);
    return stored;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
): Promise<void> {
  memoryCache.set(key, value);
  await ready();
  await activeClient?.set(key, value).catch(() => undefined);
}

export function cacheSetDeferred(key: string, value: unknown): void {
  memoryCache.set(key, value);
  if (activeClient) {
    activeClient.setDeferred(key, value);
    return;
  }
  void ready().then(() => {
    if (memoryCache.get(key) === value) {
      activeClient?.setDeferred(key, value);
    }
  });
}

export async function cacheFlushPending(): Promise<void> {
  await ready();
  await activeClient?.flush().catch(() => undefined);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void cacheFlushPending();
  });
  globalThis.addEventListener("pagehide", () => void cacheFlushPending());
}

export async function cacheDelete(key: string): Promise<void> {
  memoryCache.delete(key);
  await ready();
  await activeClient?.delete(key).catch(() => undefined);
}

export async function cacheListKeys(): Promise<string[]> {
  await ready();
  return Array.from(memoryCache.keys()).sort();
}

export async function cacheEstimateSize(key: string): Promise<number> {
  await ready();
  if (!activeClient) return 0;
  return activeClient.estimate(key).catch(() => 0);
}

export async function cacheClearAll(): Promise<void> {
  memoryCache.clear();
  await ready();
  await activeClient?.clear().catch(() => undefined);
}
