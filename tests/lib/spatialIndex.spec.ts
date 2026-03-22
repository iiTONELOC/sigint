import { describe, test, expect } from "bun:test";
import {
  buildSpatialGrid,
  queryNearest,
  screenToLatLonGlobe,
  screenToLatLonFlat,
} from "@/lib/spatialIndex";
import type { DataPoint } from "@/features/base/dataPoints";

function makePoint(id: string, lat: number, lon: number): DataPoint {
  return { id, type: "events", lat, lon, data: {} } as any;
}

describe("buildSpatialGrid", () => {
  test("empty data produces empty grid", () => {
    const grid = buildSpatialGrid([]);
    expect(grid.size).toBe(0);
    expect(grid.cells.size).toBe(0);
  });

  test("points are indexed", () => {
    const data = [makePoint("a", 40, -74), makePoint("b", 41, -73)];
    const grid = buildSpatialGrid(data);
    expect(grid.size).toBe(2);
    expect(grid.cells.size).toBeGreaterThan(0);
  });

  test("nearby points share a cell", () => {
    const data = [makePoint("a", 40.0, -74.0), makePoint("b", 40.5, -74.5)];
    const grid = buildSpatialGrid(data);
    const results = queryNearest(grid, 40.0, -74.0, 2);
    expect(results.length).toBe(2);
  });
});

describe("queryNearest", () => {
  test("returns points within radius", () => {
    const data = [makePoint("near", 40.0, -74.0), makePoint("far", 10.0, 10.0)];
    const grid = buildSpatialGrid(data);
    const results = queryNearest(grid, 40.0, -74.0, 3);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("near");
    expect(ids).not.toContain("far");
  });

  test("returns empty for no nearby points", () => {
    const data = [makePoint("a", 80.0, 170.0)];
    const grid = buildSpatialGrid(data);
    const results = queryNearest(grid, -80.0, -170.0, 2);
    expect(results.length).toBe(0);
  });

  test("handles antimeridian wrap", () => {
    const data = [makePoint("a", 0, 179), makePoint("b", 0, -179)];
    const grid = buildSpatialGrid(data);
    const results = queryNearest(grid, 0, 179, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  test("handles poles", () => {
    const data = [makePoint("north", 89, 0), makePoint("south", -89, 0)];
    const grid = buildSpatialGrid(data);
    const nearNorth = queryNearest(grid, 89, 0, 3);
    expect(nearNorth.some((p) => p.id === "north")).toBe(true);
    expect(nearNorth.some((p) => p.id === "south")).toBe(false);
  });
});

describe("screenToLatLonGlobe", () => {
  test("center of globe returns valid lat/lon", () => {
    const result = screenToLatLonGlobe(400, 300, 400, 300, 250, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(0, 0);
  });

  test("outside globe returns null", () => {
    const result = screenToLatLonGlobe(0, 0, 400, 300, 250, 0, 0);
    expect(result).toBeNull();
  });
});

describe("screenToLatLonFlat", () => {
  test("center returns 0,0", () => {
    const result = screenToLatLonFlat(400, 300, 400, 300, 800, 600);
    expect(result.lat).toBeCloseTo(0, 0);
    expect(result.lon).toBeCloseTo(0, 0);
  });

  test("clamps to valid range", () => {
    const result = screenToLatLonFlat(10000, 10000, 400, 300, 800, 600);
    expect(result.lat).toBeGreaterThanOrEqual(-90);
    expect(result.lat).toBeLessThanOrEqual(90);
    expect(result.lon).toBeGreaterThanOrEqual(-180);
    expect(result.lon).toBeLessThanOrEqual(180);
  });
});
