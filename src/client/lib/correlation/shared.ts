// ── Correlation shared helpers ──────────────────────────────────────
// Pure utilities used across rule modules: country extraction, timestamp
// parsing, the 2 degree spatial grid, and the correlation policy numbers.

import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { GeoLimit, TurnDeg } from "@shared/geo";
import { MS_PER_HOUR } from "@shared/time";
import { EMPTY_TEXT } from "@shared/text";

// ── Correlation policy ─────────────────────────────────────────────

/** One baseline bucket per hour across a rolling week. */
export { HOURS_PER_WEEK as BASELINE_BUCKETS } from "@shared/time";

export enum CorrelationRadiusKm {
  Cluster = 100,
  CrossSource = 75,
  Military = 200,
}

enum CorrelationWindowHours {
  Cluster = 6,
  CrossSource = 12,
}

export const CLUSTER_TIME_WINDOW =
  CorrelationWindowHours.Cluster * MS_PER_HOUR;
export const CROSS_SOURCE_TIME_WINDOW =
  CorrelationWindowHours.CrossSource * MS_PER_HOUR;

// ── Country / timestamp helpers ────────────────────────────────────

export enum CorrelationRegion {
  Global = "Global",
  UnitedStates = "United States",
  Unknown = "Unknown",
}

enum CorrelationCountrySyntax {
  Separator = ",",
}

export function getCountry(item: DataPoint): string {
  switch (item.type) {
    case Domain.Events:
      return (
        item.data.sourceCountry ||
        item.data.locationName
          ?.split(CorrelationCountrySyntax.Separator)
          .pop()
          ?.trim() ||
        CorrelationRegion.Unknown
      );
    case Domain.Aircraft:
      return item.data.originCountry || CorrelationRegion.Unknown;
    case Domain.Quakes: {
      const location = item.data.location || EMPTY_TEXT;
      const parts = location.split(CorrelationCountrySyntax.Separator);
      return parts.length > 1 ? (parts.at(-1) ?? location).trim() : location;
    }
    case Domain.Weather:
      return CorrelationRegion.UnitedStates;
    case Domain.Fires:
      return CorrelationRegion.Global;
    default:
      return CorrelationRegion.Unknown;
  }
}

export function getTs(item: DataPoint): number {
  return item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
}

// ── 2 degree spatial grid (matches lib/spatialIndex.ts cell size) ──

export enum CorrelationGridDeg {
  Cell = 2,
}

export enum CorrelationQueryDeg {
  Standard = 2,
  Military = 2.5,
}

export const GRID_COLS = TurnDeg.Full / CorrelationGridDeg.Cell;
const GRID_ROWS = TurnDeg.Half / CorrelationGridDeg.Cell;

export function gridKey(lat: number, lon: number): number {
  const row = Math.max(
    0,
    Math.min(
      GRID_ROWS - 1,
      Math.trunc((lat + GeoLimit.MaxLatitude) / CorrelationGridDeg.Cell),
    ),
  );
  const col = Math.max(
    0,
    Math.min(
      GRID_COLS - 1,
      Math.trunc((lon + GeoLimit.MaxLongitude) / CorrelationGridDeg.Cell),
    ),
  );
  return row * GRID_COLS + col;
}

export function buildGrid(items: DataPoint[]): Map<number, DataPoint[]> {
  const grid = new Map<number, DataPoint[]>();
  for (const item of items) {
    const k = gridKey(recordLatitude(item), recordLongitude(item));
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
  const rMin = Math.max(
    0,
    Math.trunc((lat - radiusDeg + GeoLimit.MaxLatitude) / CorrelationGridDeg.Cell),
  );
  const rMax = Math.min(
    GRID_ROWS - 1,
    Math.trunc((lat + radiusDeg + GeoLimit.MaxLatitude) / CorrelationGridDeg.Cell),
  );
  const cMin = Math.trunc(
    (lon - radiusDeg + GeoLimit.MaxLongitude) / CorrelationGridDeg.Cell,
  );
  const cMax = Math.trunc(
    (lon + radiusDeg + GeoLimit.MaxLongitude) / CorrelationGridDeg.Cell,
  );
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
