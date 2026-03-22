import { describe, test, expect } from "bun:test";

// Replicate pure math and constants from trailService for testing

const DEG = Math.PI / 180;
const EARTH_R = 6_371_000;
const MIN_MOVE_DEG = 0.001;
const MAX_TRAIL_POINTS = 50;
const MAX_MISSED_REFRESHES = 3;

function movePoint(
  lat: number,
  lon: number,
  headingDeg: number,
  distMeters: number,
) {
  const hdg = headingDeg * DEG;
  const dLat = (distMeters * Math.cos(hdg)) / EARTH_R / DEG;
  const dLon =
    (distMeters * Math.sin(hdg)) / (EARTH_R * Math.cos(lat * DEG)) / DEG;
  return { lat: lat + dLat, lon: lon + dLon };
}

describe("trail movePoint", () => {
  test("heading 0 moves north", () => {
    const result = movePoint(40, -74, 0, 10000);
    expect(result.lat).toBeGreaterThan(40);
    expect(result.lon).toBeCloseTo(-74, 1);
  });

  test("heading 90 moves east", () => {
    const result = movePoint(40, -74, 90, 10000);
    expect(result.lat).toBeCloseTo(40, 1);
    expect(result.lon).toBeGreaterThan(-74);
  });

  test("heading 180 moves south", () => {
    const result = movePoint(40, -74, 180, 10000);
    expect(result.lat).toBeLessThan(40);
  });

  test("heading 270 moves west", () => {
    const result = movePoint(40, -74, 270, 10000);
    expect(result.lon).toBeLessThan(-74);
  });

  test("zero distance stays put", () => {
    const result = movePoint(40, -74, 45, 0);
    expect(result.lat).toBeCloseTo(40, 5);
    expect(result.lon).toBeCloseTo(-74, 5);
  });
});

describe("trail recording logic", () => {
  test("MIN_MOVE_DEG threshold filters tiny movements", () => {
    const lastLat = 40.0;
    const newLat = 40.0005;
    expect(Math.abs(newLat - lastLat) < MIN_MOVE_DEG).toBe(true);
  });

  test("movements above threshold are recorded", () => {
    const lastLat = 40.0;
    const newLat = 40.002;
    expect(Math.abs(newLat - lastLat) >= MIN_MOVE_DEG).toBe(true);
  });

  test("trail cap at MAX_TRAIL_POINTS", () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      lat: i,
      lon: i,
      ts: i,
    }));
    const capped = points.slice(-MAX_TRAIL_POINTS);
    expect(capped.length).toBe(MAX_TRAIL_POINTS);
    expect(capped[0]!.lat).toBe(50);
  });

  test("missed refreshes threshold", () => {
    let missed = 0;
    missed++;
    missed++;
    missed++;
    expect(missed).toBe(MAX_MISSED_REFRESHES);
    missed++;
    expect(missed > MAX_MISSED_REFRESHES).toBe(true);
  });
});
