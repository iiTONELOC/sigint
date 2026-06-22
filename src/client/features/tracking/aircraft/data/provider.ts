import { type DataPoint } from "@/features/base/dataPoints";
import { BaseProvider } from "@/features/base/BaseProvider";
import { generateMockAircraft } from "@/data/mockData";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { fetchAircraftStates } from "./parseAdsbV2";

const DEFAULT_CACHE_DURATION = 30 * 60_000;
const DEFAULT_CACHE_KEY = CACHE_KEYS.aircraft;

export type AircraftProviderConfig = {
  cacheDurationMs?: number;
  cacheKey?: string;
};

/**
 * Aircraft is BaseProvider with two specializations: a mock-data fallback so a
 * cold-start network failure still paints a globe, and the enrich shim the
 * dossier still calls (server enriches before the wire, so it's a no-op).
 * Server `ac:[]` cold-start blanks are absorbed by BaseProvider's
 * allowEmptyResult=false soft-error path.
 */
export class AircraftProvider extends BaseProvider {
  constructor(config: AircraftProviderConfig = {}) {
    super({
      id: "aircraft",
      cacheKey: config.cacheKey ?? DEFAULT_CACHE_KEY,
      maxCacheAgeMs: config.cacheDurationMs ?? DEFAULT_CACHE_DURATION,
      fetchFn: fetchAircraftStates,
      errorFallbackFn: generateMockAircraft,
    });
  }

  /** No-op shim. Server-side enrichment runs once per sweep before the cache is
   *  even written, so an aircraft record already has acType / registration /
   *  military / etc. attached. DataContext still calls this on selection. */
  async enrichAircraftByIcao24(
    _icao24List: string[],
  ): Promise<DataPoint[] | null> {
    return null;
  }
}
