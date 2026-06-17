// Ray-cast point-in-polygon for GeoJSON [lon, lat] rings. Used to hit-test a
// click against cyclone watch/warning polygons (which are a separate layer,
// not DataPoints, so they're not in the spatial grid). Outer ring only — holes
// are ignored, matching how the worker renders them.

type Ring = [number, number][]; // [lon, lat]

function ringContains(lat: number, lon: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const loni = ring[i]![0],
      lati = ring[i]![1];
    const lonj = ring[j]![0],
      latj = ring[j]![1];
    if (lati > lat !== latj > lat) {
      const lonCross = ((lonj - loni) * (lat - lati)) / (latj - lati) + loni;
      if (lon < lonCross) inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(
  lat: number,
  lon: number,
  geometry: unknown,
): boolean {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g !== "object") return false;
  if (g.type === "Polygon") {
    const rings = g.coordinates as Ring[];
    return (
      Array.isArray(rings) && rings.length > 0 && ringContains(lat, lon, rings[0]!)
    );
  }
  if (g.type === "MultiPolygon") {
    const polys = g.coordinates as Ring[][];
    if (!Array.isArray(polys)) return false;
    return polys.some((p) => p.length > 0 && ringContains(lat, lon, p[0]!));
  }
  return false;
}

/** Average of the first outer ring's vertices — good enough to anchor a marker
 *  / LOCATE target for an area polygon. */
export function geometryCentroid(
  geometry: unknown,
): { lat: number; lon: number } | null {
  const g = geometry as { type?: string; coordinates?: any } | null;
  let ring: Ring | null = null;
  if (g?.type === "Polygon") ring = g.coordinates?.[0] ?? null;
  else if (g?.type === "MultiPolygon") ring = g.coordinates?.[0]?.[0] ?? null;
  if (!ring || ring.length === 0) return null;
  let sumLon = 0,
    sumLat = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
  }
  return { lat: sumLat / ring.length, lon: sumLon / ring.length };
}
