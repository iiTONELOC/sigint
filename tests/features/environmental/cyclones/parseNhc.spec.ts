import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  fetchCurrentStorms,
  classify,
  basinFromId,
} from "@/features/environmental/cyclones/data/parseNhc";

// ── Mock NHC payload ───────────────────────────────────────────────

const MOCK_STORM = {
  id: "al052026",
  binNumber: "AT5",
  name: "STORM_TEST_C5",
  classification: "HU",
  intensity: "145",
  pressure: "918",
  latitude: "21.2N",
  latitudeNumeric: 21.2,
  longitude: "82.4W",
  longitudeNumeric: -82.4,
  movementDir: 290,
  movementSpeed: 9,
  lastUpdate: "2026-10-08T21:00:00Z",
  forecastTrack: { advisoryNumber: "18B" },
  forecast: [
    {
      fcstHour: 12,
      validTime: "2026-10-09T09:00:00Z",
      latitude: 21.7,
      longitude: -83.6,
      maxWind: 140,
      minPressure: 920,
      development: "HU",
    },
    {
      fcstHour: 24,
      validTime: "2026-10-09T21:00:00Z",
      latitude: 22.4,
      longitude: -84.8,
      maxWind: 130,
      minPressure: 928,
      development: "HU",
    },
    {
      fcstHour: 72,
      validTime: "2026-10-11T21:00:00Z",
      latitude: 27.0,
      longitude: -87.2,
      maxWind: 95,
      minPressure: 965,
      development: "HU",
    },
    {
      fcstHour: 120,
      validTime: "2026-10-13T21:00:00Z",
      latitude: 33.5,
      longitude: -84.5,
      maxWind: 45,
      minPressure: 996,
      development: "TS",
    },
  ],
};

const MOCK_NHC = { activeStorms: [MOCK_STORM] };

// ── Fetch mock (mirrors tests/features/providers.spec.ts pattern) ──

let originalFetch: typeof globalThis.fetch;
let mockResponses: Map<
  string,
  { ok: boolean; status?: number; body: unknown }
>;
let lastCalledUrl: string;

function setupMock() {
  mockResponses = new Map();
  lastCalledUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    }
    lastCalledUrl = url;
    for (const [pattern, resp] of mockResponses) {
      if (url.includes(pattern)) {
        return {
          ok: resp.ok,
          status: resp.status ?? (resp.ok ? 200 : 503),
          json: async () => resp.body,
        } as unknown as Response;
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  }) as typeof globalThis.fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  setupMock();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Single fetch path (CORS-pivot contract) ────────────────────────

describe("fetchCurrentStorms — fetch path", () => {
  test("hits /api/cyclones/latest, never NHC directly (CORS pivot)", async () => {
    mockResponses.set("/api/cyclones/latest", {
      ok: true,
      body: { activeStorms: [] },
    });
    await fetchCurrentStorms();
    expect(lastCalledUrl).toContain("/api/cyclones/latest");
    expect(lastCalledUrl).not.toContain("nhc.noaa.gov");
  });
});

// ── Active storms parsing ──────────────────────────────────────────

describe("fetchCurrentStorms — parsing", () => {
  test("parses CurrentStorms.json with active storms into DataPoints", async () => {
    mockResponses.set("/api/cyclones/latest", { ok: true, body: MOCK_NHC });
    const result = await fetchCurrentStorms();
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("CYAL052026");
    expect(result[0]!.type).toBe("cyclones");
    expect(result[0]!.lat).toBe(21.2);
    expect(result[0]!.lon).toBe(-82.4);
    expect(result[0]!.timestamp).toBe("2026-10-08T21:00:00Z");
  });

  test("DataPoint shape includes classification and saffirSimpson", async () => {
    mockResponses.set("/api/cyclones/latest", { ok: true, body: MOCK_NHC });
    const result = await fetchCurrentStorms();
    const d = result[0]!.data as Record<string, unknown>;
    expect(d.stormId).toBe("AL052026");
    expect(d.name).toBe("STORM_TEST_C5");
    expect(d.classification).toBe("HU5");
    expect(d.saffirSimpson).toBe(5);
    expect(d.basin).toBe("AL");
    expect(d.maxWindKt).toBe(145);
    expect(d.minPressureMb).toBe(918);
    expect(d.movementDir).toBe(290);
    expect(d.movementSpeedKt).toBe(9);
    expect(d.advisoryNumber).toBe("18B");
  });

  test("returns empty array when activeStorms is missing from payload", async () => {
    mockResponses.set("/api/cyclones/latest", { ok: true, body: {} });
    const result = await fetchCurrentStorms();
    expect(result).toEqual([]);
  });

  test("returns empty array when activeStorms is empty", async () => {
    mockResponses.set("/api/cyclones/latest", {
      ok: true,
      body: { activeStorms: [] },
    });
    const result = await fetchCurrentStorms();
    expect(result).toEqual([]);
  });

  test("handles missing forecast field gracefully (data.forecast === [])", async () => {
    const stormNoForecast = { ...MOCK_STORM, forecast: undefined };
    mockResponses.set("/api/cyclones/latest", {
      ok: true,
      body: { activeStorms: [stormNoForecast] },
    });
    const result = await fetchCurrentStorms();
    expect(result.length).toBe(1);
    expect((result[0]!.data as Record<string, unknown>).forecast).toEqual([]);
  });

  test("throws on non-OK response", async () => {
    mockResponses.set("/api/cyclones/latest", {
      ok: false,
      status: 500,
      body: {},
    });
    await expect(fetchCurrentStorms()).rejects.toThrow();
  });

  test("skips records missing latitudeNumeric/longitudeNumeric", async () => {
    const bad = {
      ...MOCK_STORM,
      latitudeNumeric: undefined as unknown as number,
    };
    mockResponses.set("/api/cyclones/latest", {
      ok: true,
      body: { activeStorms: [bad, MOCK_STORM] },
    });
    const result = await fetchCurrentStorms();
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("CYAL052026");
  });

  test("skips records with non-numeric intensity", async () => {
    const bad = { ...MOCK_STORM, intensity: "" };
    mockResponses.set("/api/cyclones/latest", {
      ok: true,
      body: { activeStorms: [bad] },
    });
    const result = await fetchCurrentStorms();
    expect(result).toEqual([]);
  });
});

// ── classify() — Saffir-Simpson boundaries ─────────────────────────

describe("classify — wind speed boundaries", () => {
  test("33 kt → TD (just below TS)", () => {
    expect(classify("TD", 33)).toEqual({
      category: "TD",
      saffirSimpson: 0,
    });
  });
  test("34 kt → TS (boundary)", () => {
    expect(classify("TS", 34)).toEqual({
      category: "TS",
      saffirSimpson: 0,
    });
  });
  test("63 kt → TS (just below HU1)", () => {
    expect(classify("TS", 63).category).toBe("TS");
  });
  test("64 kt → HU1 (boundary)", () => {
    expect(classify("HU", 64)).toEqual({
      category: "HU1",
      saffirSimpson: 1,
    });
  });
  test("82 kt → HU1 (just below HU2)", () => {
    expect(classify("HU", 82).category).toBe("HU1");
  });
  test("83 kt → HU2 (boundary)", () => {
    expect(classify("HU", 83)).toEqual({
      category: "HU2",
      saffirSimpson: 2,
    });
  });
  test("95 kt → HU2 (just below HU3 / major)", () => {
    expect(classify("HU", 95).category).toBe("HU2");
  });
  test("96 kt → HU3 (boundary, major hurricane)", () => {
    expect(classify("HU", 96)).toEqual({
      category: "HU3",
      saffirSimpson: 3,
    });
  });
  test("112 kt → HU3 (just below HU4)", () => {
    expect(classify("HU", 112).category).toBe("HU3");
  });
  test("113 kt → HU4 (boundary)", () => {
    expect(classify("HU", 113)).toEqual({
      category: "HU4",
      saffirSimpson: 4,
    });
  });
  test("136 kt → HU4 (just below HU5)", () => {
    expect(classify("HU", 136).category).toBe("HU4");
  });
  test("137 kt → HU5 (boundary, top-of-scale)", () => {
    expect(classify("HU", 137)).toEqual({
      category: "HU5",
      saffirSimpson: 5,
    });
  });
});

describe("classify — special classifications", () => {
  test("subtropical storm at 45 kt → STS", () => {
    expect(classify("STS", 45)).toEqual({
      category: "STS",
      saffirSimpson: 0,
    });
  });
  test("subtropical depression at 30 kt → STD", () => {
    expect(classify("STD", 30)).toEqual({
      category: "STD",
      saffirSimpson: 0,
    });
  });
  test("post-tropical at any wind → PT (saffirSimpson 0)", () => {
    expect(classify("PT", 50)).toEqual({
      category: "PT",
      saffirSimpson: 0,
    });
    expect(classify("PT", 120)).toEqual({
      category: "PT",
      saffirSimpson: 0,
    });
  });
});

// ── basinFromId — basin prefix derivation ─────────────────────────

describe("basinFromId", () => {
  test("'al052026' → 'AL'", () => {
    expect(basinFromId("al052026")).toBe("AL");
  });
  test("'ep022026' → 'EP'", () => {
    expect(basinFromId("ep022026")).toBe("EP");
  });
  test("'cp012026' → 'CP'", () => {
    expect(basinFromId("cp012026")).toBe("CP");
  });
  test("upper-case input also maps correctly", () => {
    expect(basinFromId("AL052026")).toBe("AL");
  });
  test("any unknown prefix falls through to 'CP'", () => {
    expect(basinFromId("xx012026")).toBe("CP");
  });
});

// ── Forecast error radius assignment ──────────────────────────────

describe("toForecastPoint — NHC 5-yr error radius", () => {
  test("each fcstHour bucket gets the correct nm value", async () => {
    const stormWithAllHours = {
      ...MOCK_STORM,
      forecast: [12, 24, 36, 48, 72, 96, 120].map((h) => ({
        fcstHour: h,
        validTime: "2026-10-09T00:00:00Z",
        latitude: 0,
        longitude: 0,
        maxWind: 100,
        development: "HU",
      })),
    };
    mockResponses.set("/api/cyclones/latest", {
      ok: true,
      body: { activeStorms: [stormWithAllHours] },
    });
    const result = await fetchCurrentStorms();
    const fp = (result[0]!.data as { forecast: Array<{ errorRadiusNm: number }> })
      .forecast;
    expect(fp.map((p) => p.errorRadiusNm)).toEqual([
      26, 41, 55, 70, 100, 138, 178,
    ]);
  });

  test("unknown fcstHour falls through to 0 nm", async () => {
    const stormUnknownHour = {
      ...MOCK_STORM,
      forecast: [
        {
          fcstHour: 6,
          validTime: "2026-10-09T00:00:00Z",
          latitude: 0,
          longitude: 0,
          maxWind: 100,
          development: "HU",
        },
      ],
    };
    mockResponses.set("/api/cyclones/latest", {
      ok: true,
      body: { activeStorms: [stormUnknownHour] },
    });
    const result = await fetchCurrentStorms();
    const fp = (result[0]!.data as { forecast: Array<{ errorRadiusNm: number }> })
      .forecast;
    expect(fp[0]!.errorRadiusNm).toBe(0);
  });
});

// ── Fixture-driven end-to-end (test-only fixture system) ──────────

describe("fetchCurrentStorms — loads test fixtures via Bun.file().json()", () => {
  test("single-cat5.json yields one CYAL052026 cyclone DataPoint", async () => {
    const fixture = await Bun.file(
      "tests/fixtures/cyclones/single-cat5.json",
    ).json();
    mockResponses.set("/api/cyclones/latest", { ok: true, body: fixture });
    const result = await fetchCurrentStorms();
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("CYAL052026");
    const d = result[0]!.data as Record<string, unknown>;
    expect(d.saffirSimpson).toBe(5);
    expect(d.name).toBe("STORM_TEST_C5");
    expect(d.basin).toBe("AL");
  });

  test("multi-storm.json yields three DataPoints across AL + EP basins", async () => {
    const fixture = await Bun.file(
      "tests/fixtures/cyclones/multi-storm.json",
    ).json();
    mockResponses.set("/api/cyclones/latest", { ok: true, body: fixture });
    const result = await fetchCurrentStorms();
    expect(result.length).toBe(3);
    expect(result.map((p) => p.id).sort()).toEqual([
      "CYAL072026",
      "CYAL082026",
      "CYEP042026",
    ]);
    const basins = new Set(
      result.map(
        (p) => (p.data as Record<string, unknown>).basin as string,
      ),
    );
    expect(basins).toEqual(new Set(["AL", "EP"]));
  });

  test("empty-out-of-season.json yields zero DataPoints", async () => {
    const fixture = await Bun.file(
      "tests/fixtures/cyclones/empty-out-of-season.json",
    ).json();
    mockResponses.set("/api/cyclones/latest", { ok: true, body: fixture });
    const result = await fetchCurrentStorms();
    expect(result).toEqual([]);
  });

  test("subtropical-example.json classifies as STS, saffirSimpson 0", async () => {
    const fixture = await Bun.file(
      "tests/fixtures/cyclones/subtropical-example.json",
    ).json();
    mockResponses.set("/api/cyclones/latest", { ok: true, body: fixture });
    const result = await fetchCurrentStorms();
    expect(result.length).toBe(1);
    const d = result[0]!.data as Record<string, unknown>;
    expect(d.classification).toBe("STS");
    expect(d.saffirSimpson).toBe(0);
  });

  test("tropical-depression.json classifies as TD, saffirSimpson 0", async () => {
    const fixture = await Bun.file(
      "tests/fixtures/cyclones/tropical-depression.json",
    ).json();
    mockResponses.set("/api/cyclones/latest", { ok: true, body: fixture });
    const result = await fetchCurrentStorms();
    expect(result.length).toBe(1);
    const d = result[0]!.data as Record<string, unknown>;
    expect(d.classification).toBe("TD");
    expect(d.saffirSimpson).toBe(0);
  });
});
