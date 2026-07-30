import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { EARTHQUAKE_SOURCE } from "@/workers/data/sources/earthquakes";
import { FIRE_SOURCE } from "@/workers/data/sources/fires";
import { WEATHER_SOURCE_POLICY } from "@/features/environmental/weather/source";
import {
  CYCLONE_WARNING_SOURCE_POLICY,
} from "@/features/environmental/cyclones/warningSource";
import type { DataWorkerCacheEntry } from "@/workers/data/protocol";

const WORKER_OWNED_CACHE_KEYS = new Set<string>([
  CACHE_KEYS.aircraft,
  CACHE_KEYS.dossier,
  EARTHQUAKE_SOURCE.cacheKey,
  FIRE_SOURCE.cacheKey,
  WEATHER_SOURCE_POLICY.cacheKey,
  CYCLONE_WARNING_SOURCE_POLICY.cacheKey,
]);

export function mainThreadCacheEntries(
  entries: readonly DataWorkerCacheEntry[],
): readonly DataWorkerCacheEntry[] {
  return entries.filter((entry) => !WORKER_OWNED_CACHE_KEYS.has(entry.key));
}
