import { Domain } from "@shared/domain/identity";
import {
  EARTHQUAKE_SOURCE_POLICY,
  fetchEarthquakes,
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  createPackedPointSource,
  type PackedPointSource,
  type PackedPointSourceOptions,
} from "@/workers/data/packedPointSource";

export type EarthquakeSourceOwnerOptions = Omit<
  PackedPointSourceOptions<EarthquakePoint>,
  "parseEntity" | "fetchPoints"
> &
  Readonly<{ fetchPoints?: () => Promise<EarthquakePoint[]> }>;

export type EarthquakeSourceOwner = PackedPointSource<EarthquakePoint>;

export function createEarthquakeSourceOwner(
  options: EarthquakeSourceOwnerOptions,
): EarthquakeSourceOwner {
  return createPackedPointSource<EarthquakePoint>(
    {
      id: Domain.Earthquake,
      cacheKey: EARTHQUAKE_SOURCE_POLICY.cacheKey,
      pollIntervalMs: EARTHQUAKE_SOURCE_POLICY.pollIntervalMs,
      retryIntervalMs: EARTHQUAKE_SOURCE_POLICY.retryIntervalMs,
    },
    {
      ...options,
      parseEntity: parseEarthquakePoint,
      fetchPoints: options.fetchPoints ?? fetchEarthquakes,
    },
  );
}
