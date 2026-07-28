import {
  FIRE_SOURCE_POLICY,
  fetchFires,
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  createPackedPointSource,
  type PackedPointSource,
  type PackedPointSourceOptions,
} from "@/workers/data/packedPointSource";

const UNAVAILABLE_UPSTREAM_STATUS = "503";

export type FireSourceOwnerOptions = Omit<
  PackedPointSourceOptions<FirePoint>,
  "parseEntity" | "fetchPoints" | "failureStatus"
> &
  Readonly<{ fetchPoints?: () => Promise<FirePoint[]> }>;

export type FireSourceOwner = PackedPointSource<FirePoint>;

export function createFireSourceOwner(
  options: FireSourceOwnerOptions,
): FireSourceOwner {
  return createPackedPointSource<FirePoint>(
    {
      id: "fire",
      cacheKey: FIRE_SOURCE_POLICY.cacheKey,
      pollIntervalMs: FIRE_SOURCE_POLICY.pollIntervalMs,
      retryIntervalMs: FIRE_SOURCE_POLICY.retryIntervalMs,
    },
    {
      ...options,
      parseEntity: parseFirePoint,
      fetchPoints: options.fetchPoints ?? fetchFires,
      failureStatus: (error) =>
        error instanceof Error &&
        error.message.includes(UNAVAILABLE_UPSTREAM_STATUS)
          ? "unavailable"
          : "error",
    },
  );
}
