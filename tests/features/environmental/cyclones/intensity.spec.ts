import { describe, expect, it } from "bun:test";
import { CycloneBasin } from "@shared/cyclonesSeason";
import {
  analyzeIntensity,
  buildIntensitySeries,
  CycloneRapidIntensificationPolicy,
  CycloneTrend,
  detectRapidIntensification,
  peakForecastWindKt,
  pressureRateHpaPerH,
  pressureTrend,
  windTrend,
} from "@/features/environmental/cyclones/data/intensity";
import {
  Category,
  SaffirSimpson,
  type CycloneData,
  type ForecastPoint,
} from "@/features/environmental/cyclones/types";

function fp(fcstHour: number, maxWindKt: number): ForecastPoint {
  return {
    fcstHour,
    validTime: "",
    lat: 0,
    lon: 0,
    maxWindKt,
    category: Category.TropicalStorm,
    errorRadiusNm: 0,
  };
}

function storm(maxWindKt: number, forecast: ForecastPoint[]): CycloneData {
  return {
    stormId: "EP012026",
    name: "Amanda",
    basin: CycloneBasin.EasternPacific,
    classification: Category.TropicalStorm,
    saffirSimpson: SaffirSimpson.None,
    maxWindKt,
    advisoryNumber: "10",
    lastUpdate: "",
    forecast,
  };
}

describe("buildIntensitySeries", () => {
  it("prepends the current wind at hour 0 and sorts by lead time", () => {
    const s = buildIntensitySeries(storm(40, [fp(24, 60), fp(12, 50)]));
    expect(s).toEqual([
      { fcstHour: 0, maxWindKt: 40 },
      { fcstHour: 12, maxWindKt: 50 },
      { fcstHour: 24, maxWindKt: 60 },
    ]);
  });

  it("returns just the current sample when there is no forecast", () => {
    expect(buildIntensitySeries(storm(40, []))).toEqual([
      { fcstHour: 0, maxWindKt: 40 },
    ]);
  });
});

describe("detectRapidIntensification", () => {
  it("flags RI when wind gains >= 30 kt within 24 h", () => {
    // 40 -> 75 over 24 h = +35 kt
    const ri = detectRapidIntensification(
      buildIntensitySeries(storm(40, [fp(12, 55), fp(24, 75)])),
    );
    expect(ri.isRapid).toBe(true);
    expect(ri.maxGain24hKt).toBe(35);
    expect(ri.atFcstHour).toBe(24);
  });

  it("does not flag a gain spread over more than 24 h", () => {
    // +35 kt but across 48 h (no single 24 h window reaches +30)
    const ri = detectRapidIntensification(
      buildIntensitySeries(storm(40, [fp(24, 55), fp(48, 75)])),
    );
    expect(ri.isRapid).toBe(false);
    expect(ri.maxGain24hKt).toBeLessThan(
      CycloneRapidIntensificationPolicy.ThresholdKnots,
    );
  });

  it("uses the threshold boundary exactly (+30 kt counts)", () => {
    const ri = detectRapidIntensification(
      buildIntensitySeries(storm(40, [fp(24, 70)])),
    );
    expect(ri.maxGain24hKt).toBe(30);
    expect(ri.isRapid).toBe(true);
  });

  it("returns no RI for a weakening storm", () => {
    const ri = detectRapidIntensification(
      buildIntensitySeries(storm(90, [fp(12, 70), fp(24, 55)])),
    );
    expect(ri.isRapid).toBe(false);
    expect(ri.maxGain24hKt).toBe(0);
  });
});

describe("peakForecastWindKt", () => {
  it("returns the max wind across the whole series", () => {
    expect(
      peakForecastWindKt(buildIntensitySeries(storm(40, [fp(12, 95), fp(24, 80)]))),
    ).toBe(95);
  });
});

describe("analyzeIntensity", () => {
  it("returns both the series and the RI verdict", () => {
    const { series, ri } = analyzeIntensity(storm(35, [fp(12, 55), fp(24, 70)]));
    expect(series).toHaveLength(3);
    expect(ri.isRapid).toBe(true);
  });
});

describe("observed intensity trend", () => {
  it("uses the prior observation even when the forecast later weakens", () => {
    const value: CycloneData = {
      ...storm(40, [fp(12, 45), fp(24, 30)]),
      lastUpdate: "2026-07-20T06:00:00.000Z",
      pastTrack: [
        {
          lat: 28,
          lon: -86,
          validTime: "2026072000",
          vmaxKt: 30,
          minPressureMb: 1005,
        },
        {
          lat: 28.6,
          lon: -86,
          validTime: "2026072006",
          vmaxKt: 40,
          minPressureMb: 1000,
        },
      ],
      minPressureMb: 1000,
    };

    expect(windTrend(value)).toBe(CycloneTrend.Rising);
    expect(pressureTrend(value)).toBe(CycloneTrend.Falling);
    expect(pressureRateHpaPerH(value)).toBeCloseTo(-5 / 6, 6);
  });

  it("does not substitute the forecast when observed history is absent", () => {
    const value: CycloneData = {
      ...storm(40, [fp(12, 70)]),
      lastUpdate: "2026-07-20T06:00:00.000Z",
      minPressureMb: 1000,
    };

    expect(windTrend(value)).toBe(CycloneTrend.Unknown);
    expect(pressureTrend(value)).toBe(CycloneTrend.Unknown);
    expect(pressureRateHpaPerH(value)).toBeNull();
  });
});
