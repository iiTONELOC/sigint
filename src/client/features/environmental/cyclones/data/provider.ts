import { BaseProvider } from "@/features/base/BaseProvider";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import { fetchCurrentStorms } from "./parseNhc";

// Plain BaseProvider over one fetch of /api/cyclones/latest, like the other
// feeds. The server enriches forecast + cone before the cache write, so this
// stays a pure mapper with no per-storm fan-out (the old fan-out blocked the
// cold-start boot batch). allowEmptyResult: out of season [] is the truth.
export const cycloneProvider = new BaseProvider({
  id: "nhc-cyclones",
  cacheKey: CACHE_KEYS.cyclones,
  maxCacheAgeMs: 25 * 60_000,
  fetchFn: fetchCurrentStorms,
  allowEmptyResult: true,
});
