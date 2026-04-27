import { describe, test, expect } from "bun:test";
import {
  AIRCRAFT_TILES,
  ADSB_BASE_URL,
  POLL_INTERVAL_MS,
  RATE_LIMIT_DELAY_MS,
  TILE_RADIUS_NM,
  dedupByHex,
  normalizeAdsbPayload,
  resolveAircraftFixtureOverride,
  getAircraftCache,
} from "../../../src/server/api/aircraftCache";

// ── Tile coverage ──────────────────────────────────────────────────

describe("AIRCRAFT_TILES", () => {
  test("ships exactly 113 tiles (dense grid per spec)", () => {
    expect(AIRCRAFT_TILES.length).toBe(113);
  });

  test("every tile has a valid (lat, lon) pair", () => {
    for (const [lat, lon] of AIRCRAFT_TILES) {
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });

  test("global coverage spans both hemispheres", () => {
    const lats = AIRCRAFT_TILES.map(([lat]) => lat);
    const lons = AIRCRAFT_TILES.map(([, lon]) => lon);
    expect(Math.max(...lats)).toBeGreaterThan(50); // northern (Alaska, Scandinavia)
    expect(Math.min(...lats)).toBeLessThan(-30); // southern (NZ, Argentina)
    expect(Math.max(...lons)).toBeGreaterThan(150); // far-east (NZ, Australia)
    expect(Math.min(...lons)).toBeLessThan(-100); // far-west (Alaska, Pacific)
  });
});

// ── Constants ──────────────────────────────────────────────────────

describe("constants", () => {
  test("ADSB_BASE_URL is the v3 endpoint base", () => {
    expect(ADSB_BASE_URL).toBe("https://opendata.adsb.fi/api/v3");
  });

  test("POLL_INTERVAL_MS matches existing client cadence (240s)", () => {
    expect(POLL_INTERVAL_MS).toBe(240_000);
  });

  test("RATE_LIMIT_DELAY_MS honors the documented 1 req/sec with margin", () => {
    expect(RATE_LIMIT_DELAY_MS).toBeGreaterThanOrEqual(1_000);
  });

  test("TILE_RADIUS_NM is at the v3 server cap of 250 (verified probe)", () => {
    expect(TILE_RADIUS_NM).toBe(250);
  });

  test("full tile sweep fits inside the poll window with headroom", () => {
    const sweepMs = AIRCRAFT_TILES.length * RATE_LIMIT_DELAY_MS;
    expect(sweepMs).toBeLessThan(POLL_INTERVAL_MS);
  });
});

// ── normalizeAdsbPayload ──────────────────────────────────────────

describe("normalizeAdsbPayload", () => {
  test("accepts { ac: [...] }", () => {
    const out = normalizeAdsbPayload({ ac: [{ hex: "abc" }] });
    expect(out).not.toBeNull();
    expect(out?.ac.length).toBe(1);
  });

  test("accepts an empty ac array", () => {
    const out = normalizeAdsbPayload({ ac: [] });
    expect(out).not.toBeNull();
    expect(out?.ac).toEqual([]);
  });

  test("rejects payloads without ac array", () => {
    expect(normalizeAdsbPayload({})).toBeNull();
    expect(normalizeAdsbPayload({ ac: "nope" })).toBeNull();
    expect(normalizeAdsbPayload({ ac: 42 })).toBeNull();
    expect(normalizeAdsbPayload({ ac: { hex: "x" } })).toBeNull();
  });

  test("rejects non-object inputs", () => {
    expect(normalizeAdsbPayload(null)).toBeNull();
    expect(normalizeAdsbPayload(undefined)).toBeNull();
    expect(normalizeAdsbPayload([])).toBeNull();
    expect(normalizeAdsbPayload("string")).toBeNull();
    expect(normalizeAdsbPayload(123)).toBeNull();
  });
});

// ── dedupByHex ─────────────────────────────────────────────────────

describe("dedupByHex", () => {
  test("merges duplicate hex entries (later wins)", () => {
    const result = dedupByHex([
      { hex: "abc", note: "first" },
      { hex: "def", note: "other" },
      { hex: "abc", note: "later wins" },
    ]);
    expect(result.length).toBe(2);
    const found = result.find(
      (r) => (r as { hex: string }).hex.toLowerCase() === "abc",
    );
    expect((found as { note: string })?.note).toBe("later wins");
  });

  test("dedupes case-insensitively (AbC and abc are the same aircraft)", () => {
    const result = dedupByHex([{ hex: "AbC" }, { hex: "abc" }]);
    expect(result.length).toBe(1);
  });

  test("drops records with no hex", () => {
    const result = dedupByHex([{ hex: "abc" }, {}, { hex: "" }, { hex: null }]);
    expect(result.length).toBe(1);
  });

  test("preserves records with distinct hex", () => {
    const result = dedupByHex([
      { hex: "a1" },
      { hex: "b2" },
      { hex: "c3" },
      { hex: "d4" },
    ]);
    expect(result.length).toBe(4);
  });
});

// ── AIRCRAFT_FIXTURE dev-only override ────────────────────────────

describe("resolveAircraftFixtureOverride", () => {
  test("returns null in dev when AIRCRAFT_FIXTURE is unset", async () => {
    expect(
      await resolveAircraftFixtureOverride({ NODE_ENV: "development" }),
    ).toBeNull();
  });

  test("returns null in production even when AIRCRAFT_FIXTURE is set", async () => {
    expect(
      await resolveAircraftFixtureOverride({
        NODE_ENV: "production",
        AIRCRAFT_FIXTURE: "test-snapshot",
      }),
    ).toBeNull();
  });

  test("loads the fixture in dev when AIRCRAFT_FIXTURE matches a real label", async () => {
    const result = await resolveAircraftFixtureOverride({
      NODE_ENV: "development",
      AIRCRAFT_FIXTURE: "test-snapshot",
    });
    expect(result).not.toBeNull();
    const body = result?.body as { ac?: unknown[] } | undefined;
    expect(Array.isArray(body?.ac)).toBe(true);
    expect(body?.ac?.length).toBeGreaterThan(0);
  });

  test("rejects path-traversal labels (OWASP A01)", async () => {
    await expect(
      resolveAircraftFixtureOverride({
        NODE_ENV: "development",
        AIRCRAFT_FIXTURE: "../../../etc/passwd",
      }),
    ).rejects.toThrow(/Invalid AIRCRAFT_FIXTURE/);
  });

  test("rejects shell-special and uppercase characters via regex allowlist", async () => {
    for (const bad of ["foo;bar", "foo$bar", "foo bar", "FOO", "../foo"]) {
      await expect(
        resolveAircraftFixtureOverride({
          NODE_ENV: "development",
          AIRCRAFT_FIXTURE: bad,
        }),
      ).rejects.toThrow(/Invalid AIRCRAFT_FIXTURE/);
    }
  });

  test("throws fixture-not-found when the label is well-formed but the file is missing", async () => {
    await expect(
      resolveAircraftFixtureOverride({
        NODE_ENV: "development",
        AIRCRAFT_FIXTURE: "totally-nonexistent-aircraft-fixture",
      }),
    ).rejects.toThrow(/Fixture not found/);
  });
});

// ── Initial cache state ──────────────────────────────────────────

describe("getAircraftCache", () => {
  test("returns the initial empty shape before any fetch", () => {
    const c = getAircraftCache();
    expect(c.body).toBeNull();
    expect(c.fetchedAt).toBe(0);
    expect(c.aircraftCount).toBe(0);
    expect(c.error).toBeNull();
  });
});
