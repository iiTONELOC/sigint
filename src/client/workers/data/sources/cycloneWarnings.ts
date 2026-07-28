import { Domain } from "@shared/domain/identity";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import {
  parseCycloneWarningCache,
  type CycloneWarningPoint,
} from "@/features/environmental/cyclones/data/warningCodec";
import { warningToDataPoint } from "@/features/environmental/cyclones/data/warningPoint";
import { fetchCycloneWarnings } from "@/features/environmental/cyclones/data/warnings";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";

export const CYCLONE_WARNING_SOURCE = getPointSourceDefinition(
  Domain.CycloneWarnings,
);

export type CycloneWarningSourceRuntime =
  PointSourceRuntime<CycloneWarningPoint> &
    Readonly<{ publishRebase: () => void }>;

export type CycloneWarningSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<CycloneWarningPoint>,
  ) => Promise<void> | void;
  fetchSnapshot?: () => Promise<
    PointSourceFetchSnapshot<CycloneWarningPoint>
  >;
  publishStatus: (status: DataWorkerSourceSnapshot) => void;
  publishPoints: (points: readonly CycloneWarningPoint[]) => void;
}>;

// NWS rejects cloud-provider addresses, so this fetch has to run in the
// browser. A worker is still the browser; a server proxy would be blocked.
async function fetchWarningSnapshot(): Promise<
  PointSourceFetchSnapshot<CycloneWarningPoint>
> {
  const warnings = await fetchCycloneWarnings();
  return {
    entities: warnings.map(
      (warning) => warningToDataPoint(warning) as CycloneWarningPoint,
    ),
    completeness: "complete",
    observedAt: Date.now(),
  };
}

function warningChanged(
  previous: CycloneWarningPoint,
  next: CycloneWarningPoint,
): boolean {
  return (
    previous.timestamp !== next.timestamp ||
    previous.data.expires !== next.data.expires ||
    previous.data.kind !== next.data.kind
  );
}

export function createCycloneWarningSourceRuntime(
  options: CycloneWarningSourceRuntimeOptions,
): CycloneWarningSourceRuntime {
  const runtime = createPointSourceRuntime<CycloneWarningPoint>({
    id: CYCLONE_WARNING_SOURCE.id,
    cacheKey: CYCLONE_WARNING_SOURCE.cacheKey,
    pollIntervalMs: CYCLONE_WARNING_SOURCE.pollIntervalMs,
    maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
    hasChanged: warningChanged,
    readCache: options.readCache,
    parseCache: parseCycloneWarningCache,
    persistCache: options.persistCache,
    fetchSnapshot: options.fetchSnapshot ?? fetchWarningSnapshot,
    publishStatus: options.publishStatus,
    publishPatch: () => {
      options.publishPoints(runtime.values());
    },
  });
  return {
    ...runtime,
    publishRebase(): void {
      options.publishPoints(runtime.values());
    },
  };
}
