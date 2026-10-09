import { Domain } from "@shared/domain/identity";
import { useMemo } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { pointInPolygon } from "@/lib/geo/pointInPolygon";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import type { PointUiQuery } from "@/workers/data/uiQuery";
import type { GeoJsonPolygon } from "@shared/geo";
import type { CycloneWarningPoint } from "@shared/domain/cyclones";

export type ConeAssets = Readonly<{
  ships: readonly DataPoint[];
  aircraft: readonly DataPoint[];
  warnings: readonly CycloneWarningPoint[];
}>;

type ConeBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

const EMPTY_BOUNDS: ConeBounds = {
  minLat: 90,
  maxLat: -90,
  minLon: 180,
  maxLon: -180,
};

// The worker pages candidates by bounding box so React only ray-casts a bounded page.
function coneBboxQuery(cone: GeoJsonPolygon | undefined): PointUiQuery | null {
  const ring = cone?.coordinates?.[0];
  if (!ring || ring.length === 0) return null;

  let { minLat, maxLat, minLon, maxLon } = EMPTY_BOUNDS;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return {
    kind: "bbox",
    minLat,
    maxLat,
    minLon,
    maxLon,
    limit: POINT_UI_QUERY_POLICY.bboxCandidateLimit,
  };
}

function insideCone<TPoint extends DataPoint>(
  candidates: readonly TPoint[],
  cone: GeoJsonPolygon,
): readonly TPoint[] {
  return candidates.filter((point) =>
    pointInPolygon(recordLatitude(point), recordLongitude(point), cone),
  );
}

export function useAssetsInCone(
  cone: GeoJsonPolygon | undefined,
  stormKey: string,
): ConeAssets | null {
  // stormKey (advisory number) changes with the cone, so a refreshed advisory
  // re-runs the query even when the ring object is reused.
  const query = useMemo(() => coneBboxQuery(cone), [cone, stormKey]);
  const aircraft = useSourceQuery(Domain.Aircraft, query);
  const ships = useSourceQuery(Domain.Ships, query);
  const warnings = useSourceQuery(Domain.CycloneWarnings, query);

  return useMemo(() => {
    if (!cone || !aircraft || !ships) return null;
    return {
      aircraft: insideCone(aircraft.items, cone),
      ships: insideCone(ships.items, cone),
      warnings: warnings ? insideCone(warnings.items, cone) : [],
    };
  }, [cone, aircraft, ships, warnings]);
}
