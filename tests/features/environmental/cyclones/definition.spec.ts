import { describe, test, expect } from "bun:test";
import { cycloneFeature } from "@/features/environmental/cyclones/definition";
import type { CycloneData, CycloneFilter } from "@/features/environmental/cyclones/types";
import type { BasePoint } from "@/features/base/types";

// ── Sample storm helper ────────────────────────────────────────────

function makeStorm(
  saffirSimpson: 0 | 1 | 2 | 3 | 4 | 5,
  maxWindKt = 100,
): BasePoint & { data: CycloneData } {
  return {
    id: `CYAL05${saffirSimpson}2026`,
    type: "cyclones",
    lat: 25,
    lon: -75,
    timestamp: "2026-09-18T00:00:00Z",
    data: {
      stormId: `AL05${saffirSimpson}2026`,
      name: `STORM_TEST_${saffirSimpson === 0 ? "TS" : "C" + saffirSimpson}`,
      basin: "AL",
      classification: saffirSimpson === 0 ? "TS" : (`HU${saffirSimpson}` as CycloneData["classification"]),
      saffirSimpson,
      maxWindKt,
      advisoryNumber: "1",
      lastUpdate: "2026-09-18T00:00:00Z",
      forecast: [],
    },
  };
}

// ── Identity ───────────────────────────────────────────────────────

describe("cycloneFeature identity", () => {
  test("id matches the DataPoint discriminator", () => {
    expect(cycloneFeature.id).toBe("cyclones");
  });

  test("has a non-empty display label", () => {
    expect(cycloneFeature.label.length).toBeGreaterThan(0);
  });

  test("provides an icon component", () => {
    expect(cycloneFeature.icon).toBeDefined();
  });
});

// ── Default filter ─────────────────────────────────────────────────

describe("cycloneFeature.defaultFilter", () => {
  test("matches the documented shape", () => {
    const filter = cycloneFeature.defaultFilter as CycloneFilter;
    expect(filter.enabled).toBe(true);
    expect(filter.minCategory).toBe(0);
    expect(filter.showForecast).toBe(true);
    expect(filter.showCone).toBe(true);
  });
});

// ── matchesFilter — Saffir-Simpson minCategory gate ────────────────

describe("cycloneFeature.matchesFilter", () => {
  test("enabled: false rejects every storm", () => {
    const filter: CycloneFilter = {
      enabled: false,
      minCategory: 0,
      showForecast: true,
      showCone: true,
      showWindField: false,
      showModels: false,
      showWarnings: true,
    };
    expect(cycloneFeature.matchesFilter(makeStorm(5), filter)).toBe(false);
    expect(cycloneFeature.matchesFilter(makeStorm(0), filter)).toBe(false);
  });

  test("minCategory 0 accepts all storms (incl TD/TS)", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 0,
      showForecast: true,
      showCone: true,
      showWindField: false,
      showModels: false,
      showWarnings: true,
    };
    for (const cat of [0, 1, 2, 3, 4, 5] as const) {
      expect(cycloneFeature.matchesFilter(makeStorm(cat), filter)).toBe(true);
    }
  });

  test("minCategory 1 rejects TD/TS (saffirSimpson 0)", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 1,
      showForecast: true,
      showCone: true,
      showWindField: false,
      showModels: false,
      showWarnings: true,
    };
    expect(cycloneFeature.matchesFilter(makeStorm(0), filter)).toBe(false);
    expect(cycloneFeature.matchesFilter(makeStorm(1), filter)).toBe(true);
    expect(cycloneFeature.matchesFilter(makeStorm(5), filter)).toBe(true);
  });

  test("minCategory 3 (major hurricane filter) rejects HU1/HU2", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 3,
      showForecast: true,
      showCone: true,
      showWindField: false,
      showModels: false,
      showWarnings: true,
    };
    expect(cycloneFeature.matchesFilter(makeStorm(0), filter)).toBe(false);
    expect(cycloneFeature.matchesFilter(makeStorm(1), filter)).toBe(false);
    expect(cycloneFeature.matchesFilter(makeStorm(2), filter)).toBe(false);
    expect(cycloneFeature.matchesFilter(makeStorm(3), filter)).toBe(true);
    expect(cycloneFeature.matchesFilter(makeStorm(4), filter)).toBe(true);
    expect(cycloneFeature.matchesFilter(makeStorm(5), filter)).toBe(true);
  });

  test("minCategory 5 admits only top-of-scale storms", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 5,
      showForecast: true,
      showCone: true,
      showWindField: false,
      showModels: false,
      showWarnings: true,
    };
    for (const cat of [0, 1, 2, 3, 4] as const) {
      expect(cycloneFeature.matchesFilter(makeStorm(cat), filter)).toBe(false);
    }
    expect(cycloneFeature.matchesFilter(makeStorm(5), filter)).toBe(true);
  });
});

// ── getSearchText ──────────────────────────────────────────────────

describe("cycloneFeature.getSearchText", () => {
  test("includes name, stormId, classification, basin", () => {
    const text = cycloneFeature.getSearchText?.(makeStorm(5).data) ?? "";
    expect(text).toContain("STORM_TEST_C5");
    expect(text).toContain("AL05");
    expect(text).toContain("HU5");
    expect(text).toContain("AL");
  });
});
