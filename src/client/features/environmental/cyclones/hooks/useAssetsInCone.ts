// ── useAssetsInCone ──────────────────────────────────────────────────
// Which tracked ships/aircraft currently sit inside a storm's official NHC
// forecast cone — "what's in the threat area". Fully non-blocking: the work is
// deferred to idle time (scheduleIdle), narrowed to the cone's bbox via the
// shared spatial grid (queryNearest) before the precise ray-cast test, and
// recomputed only when the asset set or the cone changes. Returns null until
// the first compute lands (or when the storm has no official cone yet).

import { useEffect, useState } from "react";
import { useData } from "@/context/DataContext";
import type { DataPoint } from "@/features/base/dataPoints";
import { pointInPolygon } from "@/lib/pointInPolygon";
import { queryNearest } from "@/lib/spatialIndex";
import { scheduleIdle } from "@/lib/idle";
import type { GeoJSONPolygon } from "../types";

export type ConeAssets = { ships: DataPoint[]; aircraft: DataPoint[] };

/** Centre + half-span (deg) of the cone's outer ring, so a grid box query
 *  covers the whole cone before the per-point ray-cast. */
function coneBox(
  cone: GeoJSONPolygon,
): { lat: number; lon: number; radiusDeg: number } | null {
  const ring = cone.coordinates?.[0];
  if (!ring || ring.length === 0) return null;
  let minLat = 90,
    maxLat = -90,
    minLon = 180,
    maxLon = -180;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const lat = (minLat + maxLat) / 2;
  const lon = (minLon + maxLon) / 2;
  return { lat, lon, radiusDeg: Math.max(maxLat - lat, maxLon - lon) };
}

export function useAssetsInCone(
  cone: GeoJSONPolygon | undefined,
  stormKey: string,
): ConeAssets | null {
  const { allData, spatialGrid } = useData();
  const [assets, setAssets] = useState<ConeAssets | null>(null);

  useEffect(() => {
    if (!cone) {
      setAssets(null);
      return;
    }
    const box = coneBox(cone);
    if (!box) {
      setAssets(null);
      return;
    }

    let cancelled = false;
    scheduleIdle(() => {
      if (cancelled) return;
      const candidates = queryNearest(
        spatialGrid,
        box.lat,
        box.lon,
        box.radiusDeg,
      );
      const ships: DataPoint[] = [];
      const aircraft: DataPoint[] = [];
      for (const c of candidates) {
        if (c.type !== "ships" && c.type !== "aircraft") continue;
        if (!pointInPolygon(c.lat, c.lon, cone)) continue;
        (c.type === "ships" ? ships : aircraft).push(c);
      }
      if (!cancelled) setAssets({ ships, aircraft });
    });

    return () => {
      cancelled = true;
    };
    // allData + spatialGrid change together each poll → assets re-evaluated as
    // tracks move in/out of the cone. stormKey (advisory) covers cone refresh.
  }, [cone, spatialGrid, allData, stormKey]);

  return assets;
}
