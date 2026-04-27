import { describe, test, expect, mock } from "bun:test";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneData } from "@/features/environmental/cyclones/types";

mock.module("@/lib/storageService", () => ({
  cacheGet: async () => null,
  cacheSet: async () => {},
  cacheInit: async () => {},
}));

const { detectCycloneRules } = await import("@/lib/correlation/cyclones");

// ── Test data factories ────────────────────────────────────────────

let _idCounter = 0;

function makeCyclone(overrides: Partial<CycloneData> & {
  lat?: number;
  lon?: number;
} = {}): DataPoint {
  const data: CycloneData = {
    stormId: overrides.stormId ?? `AL05${++_idCounter}2026`,
    name: overrides.name ?? "STORM_TEST_X",
    basin: overrides.basin ?? "AL",
    classification: overrides.classification ?? "HU3",
    saffirSimpson: overrides.saffirSimpson ?? 3,
    maxWindKt: overrides.maxWindKt ?? 105,
    minPressureMb: overrides.minPressureMb ?? 957,
    movementDir: overrides.movementDir,
    movementSpeedKt: overrides.movementSpeedKt ?? 11,
    advisoryNumber: overrides.advisoryNumber ?? "12A",
    lastUpdate: overrides.lastUpdate ?? new Date().toISOString(),
    forecast: overrides.forecast ?? [],
  };
  return {
    id: `CY${data.stormId}`,
    type: "cyclones",
    lat: overrides.lat ?? 25,
    lon: overrides.lon ?? -75,
    timestamp: data.lastUpdate,
    data,
  } as DataPoint;
}

function makeAircraft(overrides: Record<string, unknown> = {}): DataPoint {
  return {
    id: `ac-${++_idCounter}`,
    type: "aircraft",
    lat: (overrides.lat as number) ?? 25,
    lon: (overrides.lon as number) ?? -75,
    timestamp: new Date().toISOString(),
    data: {
      callsign: overrides.callsign ?? "UAL123",
      icao24: overrides.icao24 ?? "abc123",
      military: overrides.military ?? false,
      acType: overrides.acType ?? "B738",
      ...(overrides.data as Record<string, unknown> ?? {}),
    },
  } as DataPoint;
}

function makeShip(lat: number, lon: number): DataPoint {
  return {
    id: `ship-${++_idCounter}`,
    type: "ships",
    lat,
    lon,
    timestamp: new Date().toISOString(),
    data: { name: `SHIP-${_idCounter}` },
  } as DataPoint;
}

function makeEvent(lat: number, lon: number): DataPoint {
  return {
    id: `evt-${++_idCounter}`,
    type: "events",
    lat,
    lon,
    timestamp: new Date().toISOString(),
    data: { severity: 4, sourceCountry: "Bahamas" },
  } as DataPoint;
}

// Move ~110 km along a bearing from origin (lat, lon).
// Convenience helper for placing entities precisely.
function offset(
  lat: number,
  lon: number,
  km: number,
  bearingDeg: number,
): { lat: number; lon: number } {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const d = km / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

// ── Hurricane Hunter rule ──────────────────────────────────────────

describe("detectCycloneRules — Hurricane Hunter", () => {
  test("fires when military aircraft is within 300km of TS+ cyclone", () => {
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      saffirSimpson: 3,
      maxWindKt: 105,
      name: "STORM_TEST_C3",
    });
    const acPos = offset(25, -75, 200, 90);
    const ac = makeAircraft({
      lat: acPos.lat,
      lon: acPos.lon,
      military: true,
      callsign: "MIL01",
    });
    const products = detectCycloneRules([cyc, ac]);
    expect(products.length).toBeGreaterThan(0);
    expect(products[0]!.title).toContain("Hurricane Hunter");
    expect(products[0]!.title).toContain("STORM_TEST_C3");
  });

  test("does not fire below the 34kt TS threshold", () => {
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      saffirSimpson: 0,
      maxWindKt: 33,
      classification: "TD",
    });
    const acPos = offset(25, -75, 100, 90);
    const ac = makeAircraft({
      lat: acPos.lat,
      lon: acPos.lon,
      military: true,
    });
    expect(detectCycloneRules([cyc, ac])).toEqual([]);
  });

  test("recognizes NOAA tail numbers even when military: false", () => {
    const cyc = makeCyclone({ lat: 25, lon: -75, maxWindKt: 105 });
    const acPos = offset(25, -75, 200, 90);
    const ac = makeAircraft({
      lat: acPos.lat,
      lon: acPos.lon,
      military: false,
      callsign: "NOAA42",
    });
    const products = detectCycloneRules([cyc, ac]);
    const hh = products.find((p) => p.title.includes("Hurricane Hunter"));
    expect(hh).toBeDefined();
  });

  test("recognizes 53rd WRS callsigns (TEAL71-76) when military: false", () => {
    const cyc = makeCyclone({ lat: 25, lon: -75, maxWindKt: 105 });
    const acPos = offset(25, -75, 200, 90);
    const ac = makeAircraft({
      lat: acPos.lat,
      lon: acPos.lon,
      military: false,
      callsign: "TEAL71",
    });
    const products = detectCycloneRules([cyc, ac]);
    expect(
      products.find((p) => p.title.includes("Hurricane Hunter")),
    ).toBeDefined();
  });

  test("does not fire beyond 300km", () => {
    const cyc = makeCyclone({ lat: 25, lon: -75, maxWindKt: 105 });
    const acPos = offset(25, -75, 350, 90);
    const ac = makeAircraft({
      lat: acPos.lat,
      lon: acPos.lon,
      military: true,
    });
    const products = detectCycloneRules([cyc, ac]);
    expect(
      products.find((p) => p.title.includes("Hurricane Hunter")),
    ).toBeUndefined();
  });
});

// ── Ships Sheltering rule ──────────────────────────────────────────

describe("detectCycloneRules — Ships Sheltering", () => {
  test("fires with 5+ ships in lee quadrant of a moving cyclone", () => {
    // Cyclone moving NW (315°) — lee quadrant is opposite (SE, 135°)
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      maxWindKt: 100,
      movementDir: 315,
      name: "STORM_TEST_LEE",
    });
    const ships: DataPoint[] = [];
    for (let i = 0; i < 5; i++) {
      const p = offset(25, -75, 100, 135 + i * 5); // SE, slight spread
      ships.push(makeShip(p.lat, p.lon));
    }
    const products = detectCycloneRules([cyc, ...ships]);
    const shelter = products.find((p) => p.title.includes("sheltering"));
    expect(shelter).toBeDefined();
    expect(shelter?.title).toContain("STORM_TEST_LEE");
  });

  test("does not fire with <5 ships in lee", () => {
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      maxWindKt: 100,
      movementDir: 315,
    });
    const ships: DataPoint[] = [];
    for (let i = 0; i < 4; i++) {
      const p = offset(25, -75, 100, 135 + i * 5);
      ships.push(makeShip(p.lat, p.lon));
    }
    const products = detectCycloneRules([cyc, ...ships]);
    expect(
      products.find((p) => p.title.includes("sheltering")),
    ).toBeUndefined();
  });

  test("does not fire when ships are windward of the storm", () => {
    // Cyclone moving NW (315°). Windward is the motion direction (NW, 315°).
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      maxWindKt: 100,
      movementDir: 315,
    });
    const ships: DataPoint[] = [];
    for (let i = 0; i < 6; i++) {
      const p = offset(25, -75, 100, 315 + i * 5); // NW
      ships.push(makeShip(p.lat, p.lon));
    }
    const products = detectCycloneRules([cyc, ...ships]);
    expect(
      products.find((p) => p.title.includes("sheltering")),
    ).toBeUndefined();
  });

  test("does not fire when cyclone has no movementDir (stationary)", () => {
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      maxWindKt: 100,
      movementDir: undefined,
    });
    const ships: DataPoint[] = [];
    for (let i = 0; i < 6; i++) {
      const p = offset(25, -75, 100, 135 + i * 5);
      ships.push(makeShip(p.lat, p.lon));
    }
    const products = detectCycloneRules([cyc, ...ships]);
    expect(
      products.find((p) => p.title.includes("sheltering")),
    ).toBeUndefined();
  });
});

// ── Cyclone-Path Events rule ───────────────────────────────────────

describe("detectCycloneRules — Cyclone-Path Events", () => {
  test("fires for GDELT event within 250km of forecast point ≤72h", () => {
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      maxWindKt: 100,
      name: "STORM_TEST_PATH",
      forecast: [
        {
          fcstHour: 24,
          validTime: new Date().toISOString(),
          lat: 26,
          lon: -76,
          maxWindKt: 105,
          category: "HU3",
          errorRadiusNm: 41,
        },
      ],
    });
    const evtPos = offset(26, -76, 200, 0);
    const evt = makeEvent(evtPos.lat, evtPos.lon);
    const products = detectCycloneRules([cyc, evt]);
    const path = products.find((p) => p.title.includes("Path activity"));
    expect(path).toBeDefined();
    expect(path?.title).toContain("STORM_TEST_PATH");
  });

  test("ignores events near forecast points beyond fcstHour=72", () => {
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      maxWindKt: 100,
      forecast: [
        {
          fcstHour: 96,
          validTime: new Date().toISOString(),
          lat: 30,
          lon: -85,
          maxWindKt: 70,
          category: "HU1",
          errorRadiusNm: 138,
        },
      ],
    });
    const evtPos = offset(30, -85, 100, 0);
    const evt = makeEvent(evtPos.lat, evtPos.lon);
    const products = detectCycloneRules([cyc, evt]);
    expect(
      products.find((p) => p.title.includes("Path activity")),
    ).toBeUndefined();
  });

  test("dedups events that fall under multiple forecast points", () => {
    // Place an event that is within 250km of BOTH fcstHour=24 and fcstHour=48.
    const cyc = makeCyclone({
      lat: 25,
      lon: -75,
      maxWindKt: 100,
      forecast: [
        {
          fcstHour: 24,
          validTime: new Date().toISOString(),
          lat: 26,
          lon: -76,
          maxWindKt: 105,
          category: "HU3",
          errorRadiusNm: 41,
        },
        {
          fcstHour: 48,
          validTime: new Date().toISOString(),
          lat: 26.5,
          lon: -76.5,
          maxWindKt: 100,
          category: "HU3",
          errorRadiusNm: 70,
        },
      ],
    });
    const evt = makeEvent(26.2, -76.2);
    const products = detectCycloneRules([cyc, evt]);
    const path = products.find((p) => p.title.includes("Path activity"));
    expect(path).toBeDefined();
    // Sources include the cyclone + the event ONCE (dedup by id).
    const eventSources = path!.sources.filter((s) => s.type === "events");
    expect(eventSources.length).toBe(1);
  });
});
