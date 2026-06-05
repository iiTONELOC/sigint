import { describe, expect, it } from "bun:test";
import {
  analyzeIntensity,
  buildIntensitySeries,
  detectRapidIntensification,
  peakForecastWindKt,
  RI_THRESHOLD_KT,
} from "@/features/environmental/cyclones/data/intensity";
import type { CycloneData, ForecastPoint } from "@/features/environmental/cyclones/types";

function fp(fcstHour: number, maxWindKt: number): ForecastPoint {
  return {
    fcstHour,
    validTime: "",
    lat: 0,
    lon: 0,
    maxWindKt,
    category: "TS",
    errorRadiusNm: 0,
  };
}

function storm(maxWindKt: number, forecast: ForecastPoint[]): CycloneData {
  return {
    stormId: "EP012026",
    name: "Amanda",
    basin: "EP",
    classification: "TS",
    saffirSimpson: 0,
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
    expect(ri.maxGain24hKt).toBeLessThan(RI_THRESHOLD_KT);
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
    expect(series.length).toBe(3);
    expect(ri.isRapid).toBe(true);
  });
});
