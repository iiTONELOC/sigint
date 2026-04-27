import { BaseProvider } from "@/features/base/BaseProvider";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import { fetchCurrentStorms } from "./parseNhc";

/**
 * Singleton cyclone provider.
 *
 * - 25-minute staleness, tighter than the 30-minute poll, satisfies the
 *   constraints.md cache invariant (maxCacheAgeMs ≤ pollInterval).
 * - allowEmptyResult: true — out of hurricane season, NHC legitimately
 *   returns activeStorms: []. That IS the truth, not a soft error. The
 *   server-side cyclonesCache.ts applies the same semantic.
 */
export const cycloneProvider = new BaseProvider({
  id: "nhc-cyclones",
  cacheKey: CACHE_KEYS.cyclones,
  maxCacheAgeMs: 25 * 60_000,
  fetchFn: fetchCurrentStorms,
  allowEmptyResult: true,
});
