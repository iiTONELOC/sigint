import { describe, expect, it } from "bun:test";
import {
  assessLandfall,
  createLandfallIndex,
} from "@/features/environmental/cyclones/data/landfall";
import type { ForecastPoint } from "@/features/environmental/cyclones/types";
import type { GeoMultiPolygon } from "@shared/geo";

const LAND: GeoMultiPolygon = [
  [
    [
      [-85, 25],
      [-80, 25],
      [-80, 30],
      [-85, 30],
      [-85, 25],
    ],
  ],
];

const ADVISORY_TIME = "2026-07-20T00:00:00.000Z";

function forecast(
  longitude: number,
  latitude: number,
  forecastHour: number,
): ForecastPoint {
  return {
    fcstHour: forecastHour,
    validTime: new Date(
      Date.parse(ADVISORY_TIME) + forecastHour * 60 * 60 * 1000,
    ).toISOString(),
    lat: latitude,
    lon: longitude,
    maxWindKt: 40,
    category: "TS",
    errorRadiusNm: 20,
  };
}

describe("assessLandfall", () => {
  const index = createLandfallIndex(LAND);

  it("does not report a water position as onshore", () => {
    const result = assessLandfall([-86, 28.6], ADVISORY_TIME, [], index);
    expect(result).toEqual({ kind: "none" });
  });

  it("reports a current land position as onshore", () => {
    const result = assessLandfall([-82, 27], ADVISORY_TIME, [], index);
    expect(result.kind).toBe("onshore");
  });

  it("finds the first water-to-land crossing even when the endpoint is water", () => {
    const result = assessLandfall(
      [-90, 27],
      ADVISORY_TIME,
      [forecast(-75, 27, 12)],
      index,
    );
    expect(result.kind).toBe("eta");
    if (result.kind !== "eta") return;
    expect(result.fcstHour).toBeCloseTo(4, 4);
    expect(result.position[0]).toBeCloseTo(-85, 4);
    expect(result.validTime).toBe("2026-07-20T04:00:00.000Z");
  });

  it("returns none when the forecast remains offshore", () => {
    const result = assessLandfall(
      [-90, 20],
      ADVISORY_TIME,
      [forecast(-75, 20, 12)],
      index,
    );
    expect(result).toEqual({ kind: "none" });
  });

  it("returns indeterminate without valid land geometry", () => {
    const result = assessLandfall(
      [-90, 20],
      ADVISORY_TIME,
      [forecast(-75, 20, 12)],
      createLandfallIndex([]),
    );
    expect(result).toEqual({ kind: "indeterminate" });
  });
});
