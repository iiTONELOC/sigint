import { Domain } from "@shared/domain/identity";
import type { DataWorkerCacheEntry } from "@/workers/data/protocol";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { CYCLONE_DOSSIER_CACHE_PREFIX } from "@shared/domain/cyclones";

const WORKER_OWNED_CACHE_KEYS = new Set<string>([
  getPointSourceDefinition(Domain.Aircraft).cacheKey,
  getPointSourceDefinition(Domain.Earthquake).cacheKey,
  getPointSourceDefinition(Domain.Fire).cacheKey,
  getPointSourceDefinition(Domain.Weather).cacheKey,
  getPointSourceDefinition(Domain.CycloneWarnings).cacheKey,
]);

export function mainThreadCacheEntries(
  entries: readonly DataWorkerCacheEntry[],
): readonly DataWorkerCacheEntry[] {
  return entries.filter((entry) =>
    !WORKER_OWNED_CACHE_KEYS.has(entry.key) &&
    !entry.key.startsWith(CYCLONE_DOSSIER_CACHE_PREFIX)
  );
}
