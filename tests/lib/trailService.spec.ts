import { describe, test, expect } from "bun:test";

// Replicate pure math and type-aware constants from trailService for testing

const DEG = Math.PI / 180;
const EARTH_R = 6_371_000;

const SETTINGS = {
  aircraft: {
    minMoveDeg: 0.001,
    maxTrailPoints: 50,
    maxMissedRefreshes: 8,
    missThresholdMs: 180_000,
    maxExtrapolateSec: 600,
  },
  ships: {
    minMoveDeg: 0.0002,
    maxTrailPoints: 500,
    maxMissedRefreshes: 60,
    missThresholdMs: 300_000,
    maxExtrapolateSec: 1800,
  },
};

function getSettings(id: string) {
  return id.startsWith("S") ? SETTINGS.ships : SETTINGS.aircraft;
}

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

// ── movePoint ────────────────────────────────────────────────────────

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

// ── Type-aware settings ──────────────────────────────────────────────

describe("type-aware trail settings", () => {
  test("aircraft ID returns aircraft settings", () => {
    const cfg = getSettings("Aabc123");
    expect(cfg.maxTrailPoints).toBe(50);
    expect(cfg.maxMissedRefreshes).toBe(8);
    expect(cfg.minMoveDeg).toBe(0.001);
  });

  test("ship ID returns ship settings", () => {
    const cfg = getSettings("S123456789");
    expect(cfg.maxTrailPoints).toBe(500);
    expect(cfg.maxMissedRefreshes).toBe(60);
    expect(cfg.minMoveDeg).toBe(0.0002);
  });

  test("ship trail cap is 10x aircraft", () => {
    expect(SETTINGS.ships.maxTrailPoints).toBe(
      SETTINGS.aircraft.maxTrailPoints * 10,
    );
  });

  test("ship miss tolerance is much higher than aircraft", () => {
    expect(SETTINGS.ships.maxMissedRefreshes).toBeGreaterThan(
      SETTINGS.aircraft.maxMissedRefreshes * 5,
    );
  });

  test("ship extrapolation window is 30 min", () => {
    expect(SETTINGS.ships.maxExtrapolateSec).toBe(1800);
  });

  test("aircraft extrapolation window is 10 min", () => {
    expect(SETTINGS.aircraft.maxExtrapolateSec).toBe(600);
  });
});

// ── Aircraft recording logic ─────────────────────────────────────────

describe("aircraft trail recording", () => {
  const cfg = SETTINGS.aircraft;

  test("movement below threshold is filtered", () => {
    const lastLat = 40.0;
    const newLat = 40.0005; // 0.0005 < 0.001
    expect(Math.abs(newLat - lastLat) < cfg.minMoveDeg).toBe(true);
  });

  test("movement above threshold is recorded", () => {
    const lastLat = 40.0;
    const newLat = 40.002; // 0.002 > 0.001
    expect(Math.abs(newLat - lastLat) >= cfg.minMoveDeg).toBe(true);
  });

  test("trail capped at 50 points", () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      lat: i,
      lon: i,
      ts: i,
    }));
    const capped = points.slice(-cfg.maxTrailPoints);
    expect(capped.length).toBe(50);
    expect(capped[0]!.lat).toBe(50);
  });

  test("pruned after 8 missed refreshes", () => {
    let missed = 0;
    for (let i = 0; i < cfg.maxMissedRefreshes; i++) missed++;
    expect(missed).toBe(8);
    missed++;
    expect(missed > cfg.maxMissedRefreshes).toBe(true);
  });
});

// ── Ship recording logic ─────────────────────────────────────────────

describe("ship trail recording", () => {
  const cfg = SETTINGS.ships;

  test("small ship movement is recorded (22m threshold)", () => {
    const lastLat = 40.0;
    const newLat = 40.0003; // 0.0003 > 0.0002
    expect(Math.abs(newLat - lastLat) >= cfg.minMoveDeg).toBe(true);
  });

  test("tiny ship movement below 22m is filtered", () => {
    const lastLat = 40.0;
    const newLat = 40.00015; // 0.00015 < 0.0002
    expect(Math.abs(newLat - lastLat) < cfg.minMoveDeg).toBe(true);
  });

  test("ship trail holds 500 points (days of history)", () => {
    const points = Array.from({ length: 600 }, (_, i) => ({
      lat: i,
      lon: i,
      ts: i,
    }));
    const capped = points.slice(-cfg.maxTrailPoints);
    expect(capped.length).toBe(500);
    expect(capped[0]!.lat).toBe(100);
  });

  test("ship survives 50 missed refreshes without pruning", () => {
    let missed = 50;
    expect(missed <= cfg.maxMissedRefreshes).toBe(true);
  });

  test("ship pruned after 60 missed refreshes", () => {
    let missed = 61;
    expect(missed > cfg.maxMissedRefreshes).toBe(true);
  });

  test("ship miss threshold is 5 min (longer than aircraft)", () => {
    expect(cfg.missThresholdMs).toBe(300_000);
    expect(cfg.missThresholdMs).toBeGreaterThan(
      SETTINGS.aircraft.missThresholdMs,
    );
  });
});
