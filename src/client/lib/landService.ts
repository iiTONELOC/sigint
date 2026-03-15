const CACHE_KEY = "sigint.land.hd.v1";
const HD_URL = "/data/ne_50m_land.json";

let landData: number[][][] | null = null;
let fetchInFlight = false;

// ── GeoJSON parsing ──────────────────────────────────────────────────

function parseGeoJSON(geojson: any): number[][][] {
  const polygons: number[][][] = [];
  for (const feature of geojson.features) {
    const { type, coordinates } = feature.geometry;
    const rings: number[][][] =
      type === "Polygon"
        ? coordinates
        : type === "MultiPolygon"
          ? coordinates.flat()
          : [];
    for (const ring of rings) {
      // GeoJSON is [lon, lat] — we store [lat, lon]
      const converted = ring
        .filter((coords): coords is [number, number] => Array.isArray(coords) && coords.length === 2 && typeof coords[0] === "number" && typeof coords[1] === "number")
        .map(([lon, lat]) => [
          Math.round(lat * 100) / 100,
          Math.round(lon * 100) / 100,
        ]);
      if (converted.length >= 3) {
        polygons.push(converted);
      }
    }
  }
  return polygons;
}

// ── Cache ────────────────────────────────────────────────────────────

function readCache(): number[][][] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

function writeCache(data: number[][][]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Returns land data synchronously.
 * Returns cached data if available, empty array if still loading.
 */
export function getLand(): number[][][] {
  if (landData) return landData;

  const cached = readCache();
  if (cached) {
    landData = cached;
    return landData;
  }

  return [];
}

/**
 * Fetches land data if not already available. Checks localStorage first,
 * then network. Calls `onReady` when data becomes available.
 */
export function enrichLand(onReady: (land: number[][][]) => void): void {
  if (landData) return;

  const cached = readCache();
  if (cached) {
    landData = cached;
    onReady(landData);
    return;
  }

  if (fetchInFlight) return;
  fetchInFlight = true;

  fetch(HD_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    })
    .then((geojson) => {
      landData = parseGeoJSON(geojson);
      writeCache(landData);
      onReady(landData);
    })
    .catch((err) => {
      console.error("Failed to load land data:", err);
    })
    .finally(() => {
      fetchInFlight = false;
    });
}
