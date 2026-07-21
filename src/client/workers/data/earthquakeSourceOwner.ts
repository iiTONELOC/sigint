import {
  EARTHQUAKE_SOURCE_POLICY,
  fetchEarthquakes,
  parseEarthquakeCacheSnapshot,
  type EarthquakeCacheSnapshot,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  createPointSourceOwner,
  type PointSourceOwner,
  type PointSourceOwnerDependencies,
} from "@/workers/data/pointSourceOwner";

export type EarthquakeSourceOwnerDependencies = Omit<
  PointSourceOwnerDependencies<EarthquakePoint>,
  "parseCache" | "fetchPoints"
> &
  Readonly<{
    fetchPoints?: () => Promise<EarthquakePoint[]>;
    persistCache: (snapshot: EarthquakeCacheSnapshot) => void;
  }>;

export type EarthquakeSourceOwner = PointSourceOwner<EarthquakePoint>;

export function createEarthquakeSourceOwner(
  dependencies: EarthquakeSourceOwnerDependencies,
): EarthquakeSourceOwner {
  return createPointSourceOwner(
    {
      source: "earthquake",
      pollIntervalMs: EARTHQUAKE_SOURCE_POLICY.pollIntervalMs,
      retryIntervalMs: EARTHQUAKE_SOURCE_POLICY.retryIntervalMs,
      failureMessage: "USGS refresh failed",
    },
    {
      ...dependencies,
      parseCache: parseEarthquakeCacheSnapshot,
      fetchPoints: dependencies.fetchPoints ?? fetchEarthquakes,
    },
  );
}
