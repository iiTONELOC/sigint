import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";
import {
  FIRE_SOURCE_POLICY,
  fetchFires,
  isFireFetchError,
  parseFirePoint,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import {
  createPackedPointSource,
  type PackedPointSource,
  type PackedPointSourceOptions,
} from "@/workers/data/packedPointSource";

export const SERVICE_UNAVAILABLE_STATUS = 503;

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
      id: Domain.Fire,
      cacheKey: FIRE_SOURCE_POLICY.cacheKey,
      pollIntervalMs: FIRE_SOURCE_POLICY.pollIntervalMs,
      retryIntervalMs: FIRE_SOURCE_POLICY.retryIntervalMs,
    },
    {
      ...options,
      parseEntity: parseFirePoint,
      fetchPoints: options.fetchPoints ?? fetchFires,
      failureStatus: (error) =>
        isFireFetchError(error) &&
        error.httpStatus === SERVICE_UNAVAILABLE_STATUS
          ? SourceStatus.Unavailable
          : SourceStatus.Error,
    },
  );
}
