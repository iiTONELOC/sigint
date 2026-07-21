import { EARTHQUAKE_SOURCE_POLICY } from "@/features/environmental/earthquake/data/source";
import type { DataWorkerCacheEntry } from "@/workers/data/protocol";

const WORKER_OWNED_CACHE_KEYS = new Set<string>([
  EARTHQUAKE_SOURCE_POLICY.cacheKey,
]);

export function mainThreadCacheEntries(
  entries: readonly DataWorkerCacheEntry[],
): readonly DataWorkerCacheEntry[] {
  return entries.filter((entry) => !WORKER_OWNED_CACHE_KEYS.has(entry.key));
}
