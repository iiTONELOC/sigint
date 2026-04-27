import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  parseAdsbResponse,
  toAircraftData,
  fetchAircraftStates,
  AIRCRAFT_STATES_URL,
} from "@/features/tracking/aircraft/data/parseAdsbV2";

// ── Sample adsb.fi v3 record (verbatim shape from the live probe) ──

const SAMPLE_AIRCRAFT = {
  hex: "abe7c5",
  type: "adsb_icao",
  flight: "SWA2756 ", // intentional trailing whitespace
  r: "N8662F",
  t: "B738",
  desc: "BOEING 737-800",
  alt_baro: 17550,
  alt_geom: 17525,
  gs: 356.5,
  track: 115.77,
  baro_rate: -1088,
  squawk: "3162",
  emergency: "none",
  category: "A3",
  lat: 40.476334,
  lon: -105.227234,
};

const GROUND_AIRCRAFT = {
  hex: "aa7ced",
  flight: "RTY775  ",
  alt_baro: "ground",
  gs: 19.5,
  true_heading: 70.31,
  lat: 40.453848,
  lon: -105.007699,
};

// ── Field mapping ──────────────────────────────────────────────────

describe("toAircraftData — field mapping", () => {
  test("hex → icao24 (lowercase preserved)", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).icao24).toBe("abe7c5");
  });

  test("flight → callsign with trailing whitespace trimmed", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).callsign).toBe("SWA2756");
  });

  test("missing/empty flight falls back to Unknown", () => {
    const data = toAircraftData({ ...SAMPLE_AIRCRAFT, flight: undefined });
    expect(data.callsign).toBe("Unknown");
    expect(toAircraftData({ ...SAMPLE_AIRCRAFT, flight: "   " }).callsign).toBe(
      "Unknown",
    );
  });

  test("alt_baro number → altitude (feet, as-is)", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).altitude).toBe(17550);
  });

  test('alt_baro "ground" → altitude 0 + onGround true', () => {
    const data = toAircraftData(GROUND_AIRCRAFT);
    expect(data.altitude).toBe(0);
    expect(data.onGround).toBe(true);
  });

  test("airborne aircraft → onGround false", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).onGround).toBe(false);
  });

  test("gs → speed (knots) and derives speedMps", () => {
    const data = toAircraftData(SAMPLE_AIRCRAFT);
    expect(data.speed).toBe(356.5);
    expect(data.speedMps).toBeCloseTo(356.5 * 0.5144, 3);
  });

  test("track → heading; falls back to true_heading when track missing", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).heading).toBeCloseTo(115.77, 2);
    expect(toAircraftData(GROUND_AIRCRAFT).heading).toBeCloseTo(70.31, 2);
  });

  test("baro_rate (ft/min) → verticalRate (m/s) via /196.85", () => {
    const data = toAircraftData(SAMPLE_AIRCRAFT);
    expect(data.verticalRate).toBeCloseTo(-1088 / 196.85, 3);
  });

  test("squawk passes through", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).squawk).toBe("3162");
  });

  test("originCountry empty-string fallback (future ticket: derive from hex)", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).originCountry).toBe("");
  });

  test("acType is left as 'Unknown' for the local NDJSON DB to enrich", () => {
    expect(toAircraftData(SAMPLE_AIRCRAFT).acType).toBe("Unknown");
  });

  test("military flag is NOT set from raw adsb.fi data — left undefined", () => {
    // Confirmed: adsb.fi v3 does not expose dbFlags. Military is set
    // downstream by AircraftProvider.applyMetadata via the local
    // NDJSON DB (icao24 hex range + type-code heuristics + operator
    // keywords). Same path as today; no regression.
    expect(toAircraftData(SAMPLE_AIRCRAFT).military).toBeUndefined();
  });

  test("emergency field is intentionally dropped — squawk carries the signal", () => {
    const data = toAircraftData({ ...SAMPLE_AIRCRAFT, emergency: "general" });
    // Existing AircraftData has no `emergency` field; squawk codes
    // 7700/7600/7500 carry the emergency signal in the rest of the app.
    expect((data as Record<string, unknown>).emergency).toBeUndefined();
  });
});

// ── Top-level response shape ──────────────────────────────────────

describe("parseAdsbResponse", () => {
  test("walks { ac: [...] } → DataPoint[]", () => {
    const result = parseAdsbResponse({ ac: [SAMPLE_AIRCRAFT] });
    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("Aabe7c5");
    expect(result[0]!.type).toBe("aircraft");
    expect(result[0]!.lat).toBeCloseTo(40.476334, 5);
    expect(result[0]!.lon).toBeCloseTo(-105.227234, 5);
  });

  test("returns empty array on missing ac field", () => {
    expect(parseAdsbResponse({})).toEqual([]);
    expect(parseAdsbResponse({ ac: null })).toEqual([]);
    expect(parseAdsbResponse({ ac: "nope" })).toEqual([]);
  });

  test("returns empty array on non-object input", () => {
    expect(parseAdsbResponse(null)).toEqual([]);
    expect(parseAdsbResponse(undefined)).toEqual([]);
    expect(parseAdsbResponse("string")).toEqual([]);
    expect(parseAdsbResponse(42)).toEqual([]);
  });

  test("skips records missing hex / lat / lon", () => {
    const result = parseAdsbResponse({
      ac: [
        SAMPLE_AIRCRAFT,
        { ...SAMPLE_AIRCRAFT, hex: undefined },
        { ...SAMPLE_AIRCRAFT, lat: undefined },
        { ...SAMPLE_AIRCRAFT, lon: undefined },
      ],
    });
    expect(result.length).toBe(1);
  });

  test("ground aircraft preserved with onGround true", () => {
    const result = parseAdsbResponse({ ac: [GROUND_AIRCRAFT] });
    expect(result.length).toBe(1);
    expect((result[0]!.data as Record<string, unknown>).onGround).toBe(true);
  });

  test("DataPoint.id uses lowercase hex with A prefix (matches existing OpenSky id format)", () => {
    expect(parseAdsbResponse({ ac: [SAMPLE_AIRCRAFT] })[0]!.id).toBe(
      "Aabe7c5",
    );
  });

  test("DataPoint.timestamp is set to now (ISO string)", () => {
    const before = Date.now();
    const result = parseAdsbResponse({ ac: [SAMPLE_AIRCRAFT] });
    const ts = new Date(result[0]!.timestamp!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now() + 100);
  });
});

// ── fetchAircraftStates — fetch path ──────────────────────────────

describe("fetchAircraftStates", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockResponses: Map<
    string,
    { ok: boolean; status?: number; body: unknown }
  >;
  let lastCalledUrl: string;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
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
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("AIRCRAFT_STATES_URL is the same-origin server proxy path", () => {
    expect(AIRCRAFT_STATES_URL).toBe("/api/aircraft/states");
  });

  test("hits /api/aircraft/states, never adsb.fi directly", async () => {
    mockResponses.set("/api/aircraft/states", {
      ok: true,
      body: { ac: [SAMPLE_AIRCRAFT] },
    });
    await fetchAircraftStates();
    expect(lastCalledUrl).toContain("/api/aircraft/states");
    expect(lastCalledUrl).not.toContain("adsb.fi");
    expect(lastCalledUrl).not.toContain("opensky");
  });

  test("returns parsed DataPoint[] from server response", async () => {
    mockResponses.set("/api/aircraft/states", {
      ok: true,
      body: { ac: [SAMPLE_AIRCRAFT, GROUND_AIRCRAFT] },
    });
    const result = await fetchAircraftStates();
    expect(result.length).toBe(2);
  });

  test("throws on non-OK response", async () => {
    mockResponses.set("/api/aircraft/states", {
      ok: false,
      status: 503,
      body: {},
    });
    await expect(fetchAircraftStates()).rejects.toThrow();
  });

  test("returns [] when server cache is fresh but empty", async () => {
    mockResponses.set("/api/aircraft/states", {
      ok: true,
      body: { ac: [] },
    });
    const result = await fetchAircraftStates();
    expect(result).toEqual([]);
  });
});
