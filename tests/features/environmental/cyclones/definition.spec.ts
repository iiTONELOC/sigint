import { describe, test, expect } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { type PointType } from "@shared/domain/pointType";
import { CycloneBasin } from "@shared/cyclonesSeason";
import { CYCLONE_UI_QUERIES } from "@/features/environmental/cyclones/data/uiQueries";
import { cycloneFeature } from "@/features/environmental/cyclones/definition";
import type { CycloneFilter } from "@/context/DataContext";
import {
  Category,
  SaffirSimpson,
  cycloneCategoryForScale,
  type CycloneData,
} from "@shared/domain/cyclones";
import type { BasePoint } from "@/features/base/types";

// ── Sample storm helper ────────────────────────────────────────────

function makeStorm(
  saffirSimpson: SaffirSimpson,
  maxWindKt = 100,
): BasePoint & { type: Domain.Cyclones; data: CycloneData } {
  const classification =
    saffirSimpson === SaffirSimpson.None
      ? Category.TropicalStorm
      : cycloneCategoryForScale(saffirSimpson);
  return {
    id: `CYAL05${saffirSimpson}2026`,
    type: Domain.Cyclones,
    lat: 25,
    lon: -75,
    timestamp: "2026-09-18T00:00:00Z",
    data: {
      stormId: `AL05${saffirSimpson}2026`,
      name: `STORM_TEST_${classification}`,
      basin: CycloneBasin.Atlantic,
      classification,
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
    expect(cycloneFeature.id).toBe(Domain.Cyclones);
  });

  test("has a non-empty display label", () => {
    expect(cycloneFeature.label.length).toBeGreaterThan(0);
  });

  test("provides an icon component", () => {
    expect(cycloneFeature.icon).toBeDefined();
  });
});

// ── matchesFilter — Saffir-Simpson minCategory gate ────────────────

describe("CYCLONE_UI_QUERIES.descriptor.matchesFilter", () => {
  test("enabled: false rejects every storm", () => {
    const filter: CycloneFilter = {
      enabled: false,
      minCategory: 0,
    };
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(5), filter),
    ).toBe(false);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(0), filter),
    ).toBe(false);
  });

  test("minCategory 0 accepts all storms (incl TD/TS)", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 0,
    };
    for (const cat of [0, 1, 2, 3, 4, 5] as const) {
      expect(
        CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(cat), filter),
      ).toBe(true);
    }
  });

  test("minCategory 1 rejects TD/TS (saffirSimpson 0)", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 1,
    };
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(0), filter),
    ).toBe(false);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(1), filter),
    ).toBe(true);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(5), filter),
    ).toBe(true);
  });

  test("minCategory 3 (major hurricane filter) rejects HU1/HU2", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 3,
    };
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(0), filter),
    ).toBe(false);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(1), filter),
    ).toBe(false);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(2), filter),
    ).toBe(false);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(3), filter),
    ).toBe(true);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(4), filter),
    ).toBe(true);
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(5), filter),
    ).toBe(true);
  });

  test("minCategory 5 admits only top-of-scale storms", () => {
    const filter: CycloneFilter = {
      enabled: true,
      minCategory: 5,
    };
    for (const cat of [0, 1, 2, 3, 4] as const) {
      expect(
        CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(cat), filter),
      ).toBe(false);
    }
    expect(
      CYCLONE_UI_QUERIES.descriptor.matchesFilter(makeStorm(5), filter),
    ).toBe(true);
  });
});

// ── getSearchText ──────────────────────────────────────────────────

describe("cycloneFeature.getSearchText", () => {
  test("includes name, stormId, classification, basin", () => {
    const storm = makeStorm(SaffirSimpson.Cat5).data;
    const text = cycloneFeature.getSearchText?.(storm) ?? "";
    expect(text).toContain(storm.name);
    expect(text).toContain(storm.stormId);
    expect(text).toContain(storm.classification);
    expect(text).toContain(storm.basin);
  });
});
