import { EARTHQUAKE_SOURCE_POLICY } from "@/features/environmental/earthquake/data/source";
import { FIRE_SOURCE_POLICY } from "@/features/environmental/fires/data/source";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import type { DataWorkerCacheEntry } from "@/workers/data/protocol";

const WORKER_OWNED_CACHE_KEYS = new Set<string>([
  CACHE_KEYS.aircraft,
  EARTHQUAKE_SOURCE_POLICY.cacheKey,
  FIRE_SOURCE_POLICY.cacheKey,
]);

export function mainThreadCacheEntries(
  entries: readonly DataWorkerCacheEntry[],
): readonly DataWorkerCacheEntry[] {
  return entries.filter((entry) => !WORKER_OWNED_CACHE_KEYS.has(entry.key));
}
