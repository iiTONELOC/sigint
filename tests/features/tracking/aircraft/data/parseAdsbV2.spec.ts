import { Domain } from "@shared/domain/identity";
import type { AircraftData } from "@shared/domain/aircraft";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { describe, test, expect } from "bun:test";
import { parseAdsbResponse } from "@/features/tracking/aircraft/data/codec";
import { feetPerMinuteToMetersPerSecond } from "@/measurements";

enum AircraftParserFixtureTime {
  ObservationOffset = 5_000,
  ReceivedAt = 1_700_000_000_000,
}

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

function aircraftData(aircraft: unknown): AircraftData | undefined {
  return parseAdsbResponse({ ac: [aircraft] })[0]?.data;
}

describe("parseAdsbResponse field mapping", () => {
  test("hex → icao24 (lowercase preserved)", () => {
    expect(aircraftData(SAMPLE_AIRCRAFT)?.icao24).toBe("abe7c5");
  });

  test("flight → callsign with trailing whitespace trimmed", () => {
    expect(aircraftData(SAMPLE_AIRCRAFT)?.callsign).toBe("SWA2756");
  });

  test("missing/empty flight falls back to Unknown", () => {
    const data = aircraftData({ ...SAMPLE_AIRCRAFT, flight: undefined });
    expect(data?.callsign).toBe("Unknown");
    expect(aircraftData({ ...SAMPLE_AIRCRAFT, flight: "   " })?.callsign).toBe(
      "Unknown",
    );
  });

  test("alt_baro number → altitude (feet, as-is)", () => {
    expect(aircraftData(SAMPLE_AIRCRAFT)?.altitude).toBe(17550);
  });

  test('alt_baro "ground" → altitude 0 + onGround true', () => {
    const data = aircraftData(GROUND_AIRCRAFT);
    expect(data?.altitude).toBe(0);
    expect(data?.onGround).toBe(true);
  });

  test("airborne aircraft → onGround false", () => {
    expect(aircraftData(SAMPLE_AIRCRAFT)?.onGround).toBe(false);
  });

  test("gs → speed in knots", () => {
    const data = aircraftData(SAMPLE_AIRCRAFT);
    expect(data?.speed).toBe(356.5);
  });

  test("track → heading; falls back to true_heading when track missing", () => {
    expect(aircraftData(SAMPLE_AIRCRAFT)?.heading).toBeCloseTo(115.77, 2);
    expect(aircraftData(GROUND_AIRCRAFT)?.heading).toBeCloseTo(70.31, 2);
  });

  test("converts vertical rate to meters per second", () => {
    const data = aircraftData(SAMPLE_AIRCRAFT);
    expect(data?.verticalRate).toBeCloseTo(
      feetPerMinuteToMetersPerSecond(SAMPLE_AIRCRAFT.baro_rate),
      3,
    );
  });

  test("squawk passes through", () => {
    expect(aircraftData(SAMPLE_AIRCRAFT)?.squawk).toBe("3162");
  });

  test("originCountry passes server-attached value through (post-Annex 10 enrichment)", () => {
    // The server fills originCountry via countryFromIcao24 in
    // src/server/api/aircraftEnrichment.ts before the cache write.
    // The parser's job is to faithfully thread the value through.
    const enriched = { ...SAMPLE_AIRCRAFT, originCountry: "United States" };
    expect(aircraftData(enriched)?.originCountry).toBe("United States");
  });

  test("originCountry empty-string fallback when source has no value", () => {
    // The sample has no country because the server did not enrich it.
    // (hex unmapped, or sweep ran before enrichment landed). Parser
    // returns "" so consumers fall back to "Unknown" as today.
    expect(aircraftData(SAMPLE_AIRCRAFT)?.originCountry).toBe("");
  });

  test("acType is left as 'Unknown' for the local NDJSON DB to enrich", () => {
    expect(aircraftData(SAMPLE_AIRCRAFT)?.acType).toBe("Unknown");
  });

  test("leaves the military flag undefined for raw data", () => {
    // adsb.fi v3 does not expose dbFlags. Server enrichment derives the
    // military flag from the local database and live identity fields.
    expect(aircraftData(SAMPLE_AIRCRAFT)?.military).toBeUndefined();
  });

  test("drops the upstream emergency field", () => {
    // The canonical Aircraft data owner omits this upstream-only field.
    const data = aircraftData({
      ...SAMPLE_AIRCRAFT,
      emergency: "general",
    });
    // Existing AircraftData has no `emergency` field; squawk codes
    // 7700/7600/7500 carry the emergency signal in the rest of the app.
    expect(
      (data as Record<string, unknown> | undefined)?.emergency,
    ).toBeUndefined();
  });
});

// ── Top-level response shape ──────────────────────────────────────

describe("parseAdsbResponse", () => {
  test("walks { ac: [...] } → DataPoint[]", () => {
    const result = parseAdsbResponse({ ac: [SAMPLE_AIRCRAFT] });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("Aabe7c5");
    expect(result[0]!.type).toBe(Domain.Aircraft);
    expect(recordLatitude(result[0]!)).toBeCloseTo(40.476334, 5);
    expect(recordLongitude(result[0]!)).toBeCloseTo(-105.227234, 5);
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
    expect(result).toHaveLength(1);
  });

  test("ground aircraft preserved with onGround true", () => {
    const point = parseAdsbResponse({ ac: [GROUND_AIRCRAFT] })[0];
    expect(point?.type).toBe(Domain.Aircraft);
    if (point?.type !== "aircraft") throw new Error("Expected aircraft");
    expect(point.data.onGround).toBe(true);
  });

  test("DataPoint.id uses lowercase hex with A prefix (matches existing OpenSky id format)", () => {
    expect(parseAdsbResponse({ ac: [SAMPLE_AIRCRAFT] })[0]!.id).toBe(
      "Aabe7c5",
    );
  });

  test("preserves the server observation timestamp", () => {
    const observedAt =
      AircraftParserFixtureTime.ReceivedAt -
      AircraftParserFixtureTime.ObservationOffset;
    const point = parseAdsbResponse(
      { ac: [{ ...SAMPLE_AIRCRAFT, observedAt }] },
      AircraftParserFixtureTime.ReceivedAt,
    )[0];

    expect(point?.timestamp).toBe(new Date(observedAt).toISOString());
  });

  test("derives observation time from position age for raw records", () => {
    const point = parseAdsbResponse(
      { ac: [{ ...SAMPLE_AIRCRAFT, seen_pos: 12.5 }] },
      AircraftParserFixtureTime.ReceivedAt,
    )[0];

    expect(point?.timestamp).toBe(
      new Date(
        AircraftParserFixtureTime.ReceivedAt - 12_500,
      ).toISOString(),
    );
  });

  test("uses receipt time only when observation metadata is absent", () => {
    const point = parseAdsbResponse(
      { ac: [SAMPLE_AIRCRAFT] },
      AircraftParserFixtureTime.ReceivedAt,
    )[0];

    expect(point?.timestamp).toBe(
      new Date(AircraftParserFixtureTime.ReceivedAt).toISOString(),
    );
  });
});
