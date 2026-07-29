import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import {
  EntityLifetime,
  GeoCarrier,
  StationaryGeoDataSource,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { Domain } from "@shared/domain/identity";
import { geoPointsEqual } from "@shared/geo";
import { SourceCompletenessPolicy } from "@shared/domain/sourcePolicy";
import { parseCycloneWarningCache } from "./data/warningCodec";
import type { CycloneWarningPoint } from "./types";
import { fetchCycloneWarningSnapshot } from "./data/warnings";
import { CYCLONE_WARNING_UI_QUERIES } from "./data/warningUiQueries";

export const CYCLONE_WARNING_SOURCE_POLICY: SourcePolicy = {
  id: Domain.CycloneWarnings,
  cacheKey: CACHE_KEYS.cycloneWarnings,
  pollIntervalMs: POLL_INTERVALS.cycloneWarnings,
  completeness: SourceCompletenessPolicy.Complete,
  emptyResultIsComplete: true,
};

export class CycloneWarningSource extends StationaryGeoDataSource<CycloneWarningPoint> {
  readonly policy = CYCLONE_WARNING_SOURCE_POLICY;
  readonly carrier = GeoCarrier.Polygon;
  readonly lifetime = EntityLifetime.Ephemeral;
  readonly pointType = Domain.CyclonesWarning;
  readonly queries = CYCLONE_WARNING_UI_QUERIES;

  protected parseCache(
    value: unknown,
  ): readonly CycloneWarningPoint[] | null {
    return parseCycloneWarningCache(value);
  }

  protected fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<CycloneWarningPoint>
  > {
    return fetchCycloneWarningSnapshot();
  }

  protected hasChanged(
    previous: CycloneWarningPoint,
    next: CycloneWarningPoint,
  ): boolean {
    return (
      !geoPointsEqual(previous.position, next.position) ||
      previous.timestamp !== next.timestamp ||
      previous.data.kind !== next.data.kind ||
      previous.data.expires !== next.data.expires ||
      previous.data.headline !== next.data.headline
    );
  }
}
