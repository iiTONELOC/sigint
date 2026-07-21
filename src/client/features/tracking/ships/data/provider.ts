import { BaseProvider } from "@/features/base/BaseProvider";
import { fetchShipSnapshot } from "@/features/tracking/ships/data/fetch";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";

export const shipProvider = new BaseProvider({
  id: "ais-ships",
  cacheKey: CACHE_KEYS.ships,
  maxCacheAgeMs: 30 * 60_000,
  fetchFn: async () =>
    Array.from((await fetchShipSnapshot()).entities),
});
