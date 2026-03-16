// ── Spatial index ────────────────────────────────────────────────────
// Used ONLY by click/hover handlers to avoid O(n) full-data scan.
// NOT used in the render loop — drawPoints is untouched.
// Built once per data refresh in DataContext.

import type { DataPoint } from "@/features/base/dataPoints";

const CELL_DEG = 2;
const ROWS = 90;
const COLS = 180;

export type SpatialGrid = {
  cells: Map<number, DataPoint[]>;
  size: number;
};

function cellKey(lat: number, lon: number): number {
  const row = Math.max(0, Math.min(ROWS - 1, ((lat + 90) / CELL_DEG) | 0));
  const col = Math.max(0, Math.min(COLS - 1, ((lon + 180) / CELL_DEG) | 0));
  return row * COLS + col;
}

export function buildSpatialGrid(data: DataPoint[]): SpatialGrid {
  const cells = new Map<number, DataPoint[]>();
  for (let i = 0; i < data.length; i++) {
    const item = data[i]!;
    const key = cellKey(item.lat, item.lon);
    const cell = cells.get(key);
    if (cell) cell.push(item);
    else cells.set(key, [item]);
  }
  return { cells, size: data.length };
}

export function queryNearest(
  grid: SpatialGrid,
  lat: number,
  lon: number,
  radiusDeg: number,
): DataPoint[] {
  const rMin = Math.max(0, ((lat - radiusDeg + 90) / CELL_DEG) | 0);
  const rMax = Math.min(ROWS - 1, ((lat + radiusDeg + 90) / CELL_DEG) | 0);
  const cMin = ((lon - radiusDeg + 180) / CELL_DEG) | 0;
  const cMax = ((lon + radiusDeg + 180) / CELL_DEG) | 0;
  const result: DataPoint[] = [];

  for (let r = rMin; r <= rMax; r++) {
    const rowBase = r * COLS;
    // Handle antimeridian wrap
    if (cMin < 0 || cMax >= COLS || cMin > cMax) {
      const c0 = ((cMin % COLS) + COLS) % COLS;
      const c1 = ((cMax % COLS) + COLS) % COLS;
      // Two ranges: c0..COLS-1 and 0..c1
      for (let c = c0; c < COLS; c++) {
        const cell = grid.cells.get(rowBase + c);
        if (cell) for (let i = 0; i < cell.length; i++) result.push(cell[i]!);
      }
      for (let c = 0; c <= c1; c++) {
        const cell = grid.cells.get(rowBase + c);
        if (cell) for (let i = 0; i < cell.length; i++) result.push(cell[i]!);
      }
    } else {
      for (let c = Math.max(0, cMin); c <= Math.min(COLS - 1, cMax); c++) {
        const cell = grid.cells.get(rowBase + c);
        if (cell) for (let i = 0; i < cell.length; i++) result.push(cell[i]!);
      }
    }
  }
  return result;
}

// ── Inverse projection: screen → lat/lon ─────────────────────────────
// Returns approximate lat/lon for a screen point. Used to narrow
// the spatial grid query before projecting candidates.

export function screenToLatLonGlobe(
  mx: number,
  my: number,
  cx: number,
  cy: number,
  r: number,
  rotY: number,
  rotX: number,
): { lat: number; lon: number } | null {
  const nx = (mx - cx) / r;
  const ny = -(my - cy) / r;
  if (nx * nx + ny * ny > 1) return null;
  const nz = Math.sqrt(1 - nx * nx - ny * ny);
  const cosRx = Math.cos(rotX);
  const sinRx = Math.sin(rotX);
  const yWorld = ny * cosRx + nz * sinRx;
  const zWorld = -ny * sinRx + nz * cosRx;
  const phi = Math.acos(Math.max(-1, Math.min(1, yWorld)));
  const lat = 90 - (phi * 180) / Math.PI;
  const theta = Math.atan2(zWorld, -nx);
  let lon = ((theta - rotY) * 180) / Math.PI - 180;
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon };
}

export function screenToLatLonFlat(
  mx: number,
  my: number,
  flatCx: number,
  flatCy: number,
  mW: number,
  mH: number,
): { lat: number; lon: number } {
  return {
    lat: Math.max(-90, Math.min(90, -((my - flatCy) / (mH / 2)) * 90)),
    lon: Math.max(-180, Math.min(180, ((mx - flatCx) / (mW / 2)) * 180)),
  };
}
