import { describe, test, expect } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { type PointType } from "@shared/domain/pointType";
import { CycloneBasin } from "@shared/cyclonesSeason";
import {
  Category,
  MIN_CATEGORY_CHOICES,
  SaffirSimpson,
  type ForecastPoint,
  type CycloneData,
  type CycloneFilter,
} from "@/features/environmental/cyclones/types";
import type { DataPoint } from "@/features/base/dataPoints";

// Type-only files have no runtime, but we exercise them by constructing
// sample values. If the source types or the dataPoints union don't
// include cyclones, this file fails to compile at test load.

describe("cyclones types", () => {
  test("Category enumerates the 10 NHC classification codes", () => {
    const categories = Object.values(Category);
    expect(categories).toHaveLength(10);
    expect(new Set(categories).size).toBe(10);
  });

  test("ForecastPoint accepts the documented field set", () => {
    const p: ForecastPoint = {
      fcstHour: 24,
      validTime: "2026-09-19T00:00:00Z",
      lat: 25,
      lon: -75,
      maxWindKt: 110,
      minPressureMb: 950,
      category: Category.Hurricane3,
      errorRadiusNm: 41,
    };
    expect(p.fcstHour).toBe(24);
    expect(p.category).toBe(Category.Hurricane3);
    expect(p.errorRadiusNm).toBe(41);
  });

  test("ForecastPoint allows minPressureMb to be omitted", () => {
    const p: ForecastPoint = {
      fcstHour: 12,
      validTime: "2026-09-19T00:00:00Z",
      lat: 24,
      lon: -75,
      maxWindKt: 95,
      category: Category.Hurricane2,
      errorRadiusNm: 26,
    };
    expect(p.minPressureMb).toBeUndefined();
  });

  test("CycloneData constructs with required + optional fields", () => {
    const d: CycloneData = {
      stormId: "AL052026",
      name: "STORM_TEST_C5",
      basin: CycloneBasin.Atlantic,
      classification: Category.Hurricane5,
      saffirSimpson: SaffirSimpson.Cat5,
      maxWindKt: 145,
      minPressureMb: 918,
      movementDir: 290,
      movementSpeedKt: 9,
      advisoryNumber: "18B",
      lastUpdate: "2026-10-08T21:00:00Z",
      forecast: [],
    };
    expect(d.basin).toBe(CycloneBasin.Atlantic);
    expect(d.saffirSimpson).toBe(SaffirSimpson.Cat5);
    expect(d.classification).toBe(Category.Hurricane5);
  });

  test("CycloneData allows movement and pressure fields to be omitted", () => {
    const d: CycloneData = {
      stormId: "AL012026",
      name: "STORM_TEST_TD",
      basin: CycloneBasin.Atlantic,
      classification: Category.TropicalDepression,
      saffirSimpson: SaffirSimpson.None,
      maxWindKt: 30,
      advisoryNumber: "1",
      lastUpdate: "2026-08-12T15:00:00Z",
      forecast: [],
    };
    expect(d.movementDir).toBeUndefined();
    expect(d.movementSpeedKt).toBeUndefined();
    expect(d.minPressureMb).toBeUndefined();
  });

  test("CycloneFilter has the documented shape", () => {
    const f: CycloneFilter = {
      enabled: true,
      minCategory: SaffirSimpson.None,
      showForecast: true,
      showCone: true,
      showWindField: false,
      showModels: false,
      showWarnings: true,
    };
    expect(f.enabled).toBe(true);
    expect(f.minCategory).toBe(SaffirSimpson.None);
    expect(f.showForecast).toBe(true);
    expect(f.showCone).toBe(true);
  });

  test("the storm filter offers only the four Saffir-Simpson floors", () => {
    expect(MIN_CATEGORY_CHOICES).toEqual([
      SaffirSimpson.None,
      SaffirSimpson.Cat1,
      SaffirSimpson.Cat3,
      SaffirSimpson.Cat5,
    ]);
  });

  test("DataPoint discriminates the cyclones type via the union", () => {
    const item: DataPoint = {
      id: "CYAL052026",
      type: Domain.Cyclones,
      lat: 21.2,
      lon: -82.4,
      timestamp: "2026-10-08T21:00:00Z",
      data: {
        stormId: "AL052026",
        name: "STORM_TEST_C5",
        basin: CycloneBasin.Atlantic,
        classification: Category.Hurricane5,
        saffirSimpson: SaffirSimpson.Cat5,
        maxWindKt: 145,
        minPressureMb: 918,
        movementDir: 290,
        movementSpeedKt: 9,
        advisoryNumber: "18B",
        lastUpdate: "2026-10-08T21:00:00Z",
        forecast: [],
      },
    };
    expect(item.type).toBe(Domain.Cyclones);
    if (item.type === Domain.Cyclones) {
      expect(item.data.name).toBe("STORM_TEST_C5");
      expect(item.data.saffirSimpson).toBe(SaffirSimpson.Cat5);
    }
  });
});
