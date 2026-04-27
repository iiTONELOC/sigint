// ── Correlation shared helpers ──────────────────────────────────────
// Pure utilities used across rule modules: distance math, country
// extraction, timestamp parsing, 2° spatial grid, and the post-scoring
// alert dedup pass.

import type { DataPoint } from "@/features/base/dataPoints";

// ── Time + geo constants ───────────────────────────────────────────

export const HOUR = 3600_000;
export const DAY = 86400_000;
export const BASELINE_BUCKETS = 168; // 7 days × 24 hours
export const CLUSTER_RADIUS_KM = 100;
export const CLUSTER_TIME_WINDOW = 6 * HOUR;
export const CROSS_SOURCE_RADIUS_KM = 75;
export const CROSS_SOURCE_TIME_WINDOW = 12 * HOUR;

export const DEG = Math.PI / 180;
export const EARTH_R = 6371; // km

// ── Distance ───────────────────────────────────────────────────────

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Country / timestamp helpers ────────────────────────────────────

export function getCountry(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  if (item.type === "events")
    return (
      (d.sourceCountry as string) ||
      (d.locationName as string)?.split(",").pop()?.trim() ||
      "Unknown"
    );
  if (item.type === "aircraft") return (d.originCountry as string) || "Unknown";
  if (item.type === "quakes") {
    const loc = (d.location as string) || "";
    const parts = loc.split(",");
    return parts.length > 1 ? parts[parts.length - 1]!.trim() : loc;
  }
  if (item.type === "weather") return "United States";
  if (item.type === "fires") return "Global";
  return "Unknown";
}

export function getTs(item: DataPoint): number {
  return item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
}

// ── 2° spatial grid (matches lib/spatialIndex.ts cell size) ────────

export const GRID_CELL_DEG = 2;
export const GRID_COLS = 180;
export const QUERY_RADIUS_DEG = 2;
export const MIL_QUERY_RADIUS_DEG = 2.5;

export function gridKey(lat: number, lon: number): number {
  const row = Math.max(0, Math.min(89, ((lat + 90) / GRID_CELL_DEG) | 0));
  const col = Math.max(0, Math.min(179, ((lon + 180) / GRID_CELL_DEG) | 0));
  return row * GRID_COLS + col;
}

export function buildGrid(items: DataPoint[]): Map<number, DataPoint[]> {
  const grid = new Map<number, DataPoint[]>();
  for (const item of items) {
    const k = gridKey(item.lat, item.lon);
    const cell = grid.get(k);
    if (cell) cell.push(item);
    else grid.set(k, [item]);
  }
  return grid;
}

/** Query items within radiusDeg using grid cells. radiusKm < 200 assumed. */
export function gridQuery(
  grid: Map<number, DataPoint[]>,
  lat: number,
  lon: number,
  radiusDeg: number,
): DataPoint[] {
  const rMin = Math.max(0, ((lat - radiusDeg + 90) / GRID_CELL_DEG) | 0);
  const rMax = Math.min(89, ((lat + radiusDeg + 90) / GRID_CELL_DEG) | 0);
  const cMin = ((lon - radiusDeg + 180) / GRID_CELL_DEG) | 0;
  const cMax = ((lon + radiusDeg + 180) / GRID_CELL_DEG) | 0;
  const result: DataPoint[] = [];
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const cc = ((c % GRID_COLS) + GRID_COLS) % GRID_COLS;
      const cell = grid.get(r * GRID_COLS + cc);
      if (cell) {
        for (const item of cell) result.push(item);
      }
    }
  }
  return result;
}
