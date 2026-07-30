import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  parseAdsbResponse,
  parseAircraftFetchResult,
  toAircraftData,
  fetchAircraftStates,
  AIRCRAFT_STATES_URL,
} from "@/features/tracking/aircraft/data/parseAdsbV2";
import type { SourceState } from "@shared/source";

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

const AIRCRAFT_SOURCE_STATE: SourceState = {
  source: "aircraft",
  phase: "ready",
  freshness: "fresh",
  completeness: "complete",
  sequence: 1,
  observedAt: 1_700_000_000_000,
  receivedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_900_000,
  successfulScopes: 108,
  failedScopes: 0,
  totalScopes: 108,
  error: null,
};

function aircraftEnvelope(ac: unknown[]): unknown {
  return { ac, source: AIRCRAFT_SOURCE_STATE };
}

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

  test("originCountry passes server-attached value through (post-Annex 10 enrichment)", () => {
    // The server fills originCountry via countryFromIcao24 in
    // src/server/api/aircraftEnrichment.ts before the cache write.
    // The parser's job is to faithfully thread the value through.
    const enriched = { ...SAMPLE_AIRCRAFT, originCountry: "United States" };
    expect(toAircraftData(enriched).originCountry).toBe("United States");
  });

  test("originCountry empty-string fallback when source has no value", () => {
    // SAMPLE_AIRCRAFT carries no originCountry — server didn't enrich
    // (hex unmapped, or sweep ran before enrichment landed). Parser
    // returns "" so consumers fall back to "Unknown" as today.
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
    // `emergency` isn't part of AdsbAircraft; pass it via a cast to prove the
    // mapper drops unknown upstream fields.
    const data = toAircraftData({
      ...SAMPLE_AIRCRAFT,
      emergency: "general",
    } as Parameters<typeof toAircraftData>[0]);
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
    const point = parseAdsbResponse({ ac: [GROUND_AIRCRAFT] })[0];
    expect(point?.type).toBe("aircraft");
    if (point?.type !== "aircraft") throw new Error("Expected aircraft");
    expect(point.data.onGround).toBe(true);
  });

  test("DataPoint.id uses lowercase hex with A prefix (matches existing OpenSky id format)", () => {
    expect(parseAdsbResponse({ ac: [SAMPLE_AIRCRAFT] })[0]!.id).toBe(
      "Aabe7c5",
    );
  });

  test("preserves the server observation timestamp", () => {
    const receivedAt = 1_700_000_000_000;
    const observedAt = receivedAt - 5_000;
    const point = parseAdsbResponse(
      { ac: [{ ...SAMPLE_AIRCRAFT, observedAt }] },
      receivedAt,
    )[0];

    expect(point?.timestamp).toBe(new Date(observedAt).toISOString());
  });

  test("derives observation time from position age for raw records", () => {
    const receivedAt = 1_700_000_000_000;
    const point = parseAdsbResponse(
      { ac: [{ ...SAMPLE_AIRCRAFT, seen_pos: 12.5 }] },
      receivedAt,
    )[0];

    expect(point?.timestamp).toBe(
      new Date(receivedAt - 12_500).toISOString(),
    );
  });

  test("uses receipt time only when observation metadata is absent", () => {
    const receivedAt = 1_700_000_000_000;
    const point = parseAdsbResponse(
      { ac: [SAMPLE_AIRCRAFT] },
      receivedAt,
    )[0];

    expect(point?.timestamp).toBe(new Date(receivedAt).toISOString());
  });
});

// ── fetchAircraftStates — fetch path ──────────────────────────────
describe("parseAircraftFetchResult", () => {
  test("returns data and the validated aircraft source state", () => {
    const result = parseAircraftFetchResult(
      aircraftEnvelope([SAMPLE_AIRCRAFT]),
      1_700_000_000_000,
    );

    expect(result?.data).toHaveLength(1);
    expect(result?.source).toEqual(AIRCRAFT_SOURCE_STATE);
  });

  test("rejects responses that erase source completeness", () => {
    expect(parseAircraftFetchResult({ ac: [] })).toBeNull();
    expect(
      parseAircraftFetchResult({
        ac: [],
        source: { ...AIRCRAFT_SOURCE_STATE, completeness: "invalid" },
      }),
    ).toBeNull();
    expect(
      parseAircraftFetchResult({
        ac: "invalid",
        source: AIRCRAFT_SOURCE_STATE,
      }),
    ).toBeNull();
  });
});


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
      body: aircraftEnvelope([SAMPLE_AIRCRAFT]),
    });
    await fetchAircraftStates();
    expect(lastCalledUrl).toContain("/api/aircraft/states");
    expect(lastCalledUrl).not.toContain("adsb.fi");
    expect(lastCalledUrl).not.toContain("opensky");
  });

  test("returns parsed DataPoint[] from server response", async () => {
    mockResponses.set("/api/aircraft/states", {
      ok: true,
      body: aircraftEnvelope([SAMPLE_AIRCRAFT, GROUND_AIRCRAFT]),
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
      body: aircraftEnvelope([]),
    });
    const result = await fetchAircraftStates();
    expect(result).toEqual([]);
  });
});
