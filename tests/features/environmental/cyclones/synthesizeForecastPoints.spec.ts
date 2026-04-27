import { describe, test, expect } from "bun:test";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneData, ForecastPoint } from "@/features/environmental/cyclones/types";
import { synthesizeForecastPoints } from "@/features/environmental/cyclones/data/synthesizeForecastPoints";

// ── Helpers ───────────────────────────────────────────────────────

function fp(
  fcstHour: number,
  overrides: Partial<ForecastPoint> = {},
): ForecastPoint {
  return {
    fcstHour,
    validTime: `2026-10-08T${String(fcstHour % 24).padStart(2, "0")}:00:00Z`,
    lat: 25 + fcstHour * 0.1,
    lon: -75 + fcstHour * 0.1,
    maxWindKt: 100 - fcstHour * 0.5,
    minPressureMb: 940 + fcstHour * 0.1,
    category: "HU3",
    errorRadiusNm: 30 + fcstHour * 1.5,
    ...overrides,
  };
}

function cyclone(
  stormId: string,
  forecast: ForecastPoint[],
  overrides: Partial<CycloneData> = {},
): DataPoint & { type: "cyclones"; data: CycloneData } {
  return {
    id: `CY${stormId}`,
    type: "cyclones",
    lat: 21.2,
    lon: -82.4,
    timestamp: "2026-10-08T18:00:00Z",
    data: {
      stormId,
      name: "ELENA",
      basin: "AL",
      classification: "HU5",
      saffirSimpson: 5,
      maxWindKt: 140,
      minPressureMb: 925,
      advisoryNumber: "12A",
      lastUpdate: "2026-10-08T18:00:00Z",
      forecast,
      ...overrides,
    },
  };
}

// ── Field mapping ─────────────────────────────────────────────────

describe("synthesizeForecastPoints — field mapping", () => {
  test("explodes a 7-point forecast into 7 synthetic DataPoints", () => {
    const c = cyclone("AL052026", [fp(12), fp(24), fp(36), fp(48), fp(72), fp(96), fp(120)]);
    const out = synthesizeForecastPoints([c]);
    expect(out.length).toBe(7);
    for (const p of out) {
      expect(p.type).toBe("cyclones-forecast");
    }
  });

  test("synthetic id is CYF{stormId}-H{fcstHour}", () => {
    const c = cyclone("AL052026", [fp(24)]);
    const out = synthesizeForecastPoints([c]);
    expect(out[0]!.id).toBe("CYFAL052026-H24");
  });

  test("lat/lon copied from forecast point, not parent storm position", () => {
    const c = cyclone("AL052026", [fp(48, { lat: 30.5, lon: -70.2 })]);
    const out = synthesizeForecastPoints([c]);
    expect(out[0]!.lat).toBe(30.5);
    expect(out[0]!.lon).toBe(-70.2);
  });

  test("timestamp uses forecast point's validTime", () => {
    const c = cyclone("AL052026", [fp(24, { validTime: "2026-10-09T18:00:00Z" })]);
    const out = synthesizeForecastPoints([c]);
    expect(out[0]!.timestamp).toBe("2026-10-09T18:00:00Z");
  });

  test("data carries parent metadata + forecast-point metrics", () => {
    const c = cyclone("AL052026", [
      fp(48, {
        maxWindKt: 110,
        minPressureMb: 945,
        category: "HU3",
        errorRadiusNm: 70,
      }),
    ]);
    const out = synthesizeForecastPoints([c]);
    const d = out[0]!.data as Record<string, unknown>;
    expect(d.parentStormId).toBe("AL052026");
    expect(d.parentName).toBe("ELENA");
    expect(d.parentBasin).toBe("AL");
    expect(d.fcstHour).toBe(48);
    expect(d.maxWindKt).toBe(110);
    expect(d.minPressureMb).toBe(945);
    expect(d.category).toBe("HU3");
    expect(d.errorRadiusNm).toBe(70);
  });

  test("saffirSimpson copied from parent storm (per spec — out-of-scope to recompute)", () => {
    const c = cyclone("AL052026", [fp(48)], { saffirSimpson: 5 });
    const out = synthesizeForecastPoints([c]);
    expect((out[0]!.data as Record<string, unknown>).saffirSimpson).toBe(5);
  });

  test("minPressureMb may be undefined (ForecastPoint allows it)", () => {
    const c = cyclone("AL052026", [fp(72, { minPressureMb: undefined })]);
    const out = synthesizeForecastPoints([c]);
    const d = out[0]!.data as { minPressureMb?: number };
    expect(d.minPressureMb).toBeUndefined();
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe("synthesizeForecastPoints — edge cases", () => {
  test("cyclone with empty forecast → 0 synthetic points", () => {
    const c = cyclone("AL052026", []);
    expect(synthesizeForecastPoints([c]).length).toBe(0);
  });

  test("cyclone with no forecast field at all → 0 synthetic points (graceful)", () => {
    const c = cyclone("AL052026", []);
    // Simulate missing field — feature consumers may pass partial data
    delete (c.data as { forecast?: unknown }).forecast;
    expect(synthesizeForecastPoints([c]).length).toBe(0);
  });

  test("multiple cyclones → flat array with all points from all storms", () => {
    const a = cyclone("AL052026", [fp(12), fp(24), fp(36)]);
    const b = cyclone("AL072026", [fp(12), fp(24)], { name: "FRANK" });
    const out = synthesizeForecastPoints([a, b]);
    expect(out.length).toBe(5);
    const elenaCount = out.filter(
      (p) => (p.data as { parentName: string }).parentName === "ELENA",
    ).length;
    const frankCount = out.filter(
      (p) => (p.data as { parentName: string }).parentName === "FRANK",
    ).length;
    expect(elenaCount).toBe(3);
    expect(frankCount).toBe(2);
  });

  test("ids unique across all synthesized points (different storms or hours)", () => {
    const a = cyclone("AL052026", [fp(12), fp(24)]);
    const b = cyclone("AL072026", [fp(12), fp(24)]);
    const out = synthesizeForecastPoints([a, b]);
    const ids = new Set(out.map((p) => p.id));
    expect(ids.size).toBe(out.length);
  });

  test("non-cyclone DataPoints in input are ignored (mixed input safe)", () => {
    const c = cyclone("AL052026", [fp(12), fp(24)]);
    // A bogus aircraft-shaped DataPoint to verify the type guard
    const noise = {
      id: "Aabc123",
      type: "aircraft",
      lat: 0,
      lon: 0,
      timestamp: "x",
      data: {} as never,
    } as unknown as DataPoint;
    const out = synthesizeForecastPoints([c, noise]);
    expect(out.length).toBe(2);
    for (const p of out) expect(p.type).toBe("cyclones-forecast");
  });

  test("empty input → empty output", () => {
    expect(synthesizeForecastPoints([])).toEqual([]);
  });
});
