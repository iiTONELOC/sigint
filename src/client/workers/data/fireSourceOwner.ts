import {
  FIRE_SOURCE_POLICY,
  fetchFires,
  parseFireCacheSnapshot,
  type FireCacheSnapshot,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  createPointSourceOwner,
  type PointSourceOwner,
  type PointSourceOwnerDependencies,
} from "@/workers/data/pointSourceOwner";

export type FireSourceOwnerDependencies = Omit<
  PointSourceOwnerDependencies<FirePoint>,
  "parseCache" | "fetchPoints" | "failureStatus"
> &
  Readonly<{
    fetchPoints?: () => Promise<FirePoint[]>;
    persistCache: (snapshot: FireCacheSnapshot) => void;
  }>;

export type FireSourceOwner = PointSourceOwner<FirePoint>;

export function createFireSourceOwner(
  dependencies: FireSourceOwnerDependencies,
): FireSourceOwner {
  return createPointSourceOwner(
    {
      source: "fire",
      pollIntervalMs: FIRE_SOURCE_POLICY.pollIntervalMs,
      retryIntervalMs: FIRE_SOURCE_POLICY.retryIntervalMs,
      failureMessage: "FIRMS refresh failed",
    },
    {
      ...dependencies,
      parseCache: parseFireCacheSnapshot,
      fetchPoints: dependencies.fetchPoints ?? fetchFires,
      failureStatus: (error) =>
        error instanceof Error && error.message.includes("503")
          ? "unavailable"
          : "error",
    },
  );
}
