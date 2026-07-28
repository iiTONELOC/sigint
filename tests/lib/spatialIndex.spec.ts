import { describe, test, expect } from "bun:test";
import {
  screenToLatLonGlobe,
  screenToLatLonFlat,
} from "@/lib/geo/spatialIndex";

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
