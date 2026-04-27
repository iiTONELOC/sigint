import { describe, test, expect } from "bun:test";
import {
  normalizeCyclonesPayload,
  getCyclonesCache,
  NHC_URL,
  USER_AGENT,
  POLL_INTERVAL_MS,
} from "../../src/server/api/cyclonesCache";

// ── Pure validator: shape of an NHC CurrentStorms.json response ────

describe("normalizeCyclonesPayload", () => {
  test("accepts the documented shape", () => {
    const out = normalizeCyclonesPayload({
      activeStorms: [{ id: "al052026", name: "STORM_TEST_C5" }],
    });
    expect(out).not.toBeNull();
    expect(out?.activeStorms.length).toBe(1);
  });

  test("accepts an empty activeStorms array (out-of-season is the truth)", () => {
    const out = normalizeCyclonesPayload({ activeStorms: [] });
    expect(out).not.toBeNull();
    expect(out?.activeStorms).toEqual([]);
  });

  test("rejects payloads where activeStorms is missing", () => {
    expect(normalizeCyclonesPayload({})).toBeNull();
  });

  test("rejects payloads where activeStorms is not an array", () => {
    expect(normalizeCyclonesPayload({ activeStorms: "nope" })).toBeNull();
    expect(normalizeCyclonesPayload({ activeStorms: 42 })).toBeNull();
    expect(
      normalizeCyclonesPayload({ activeStorms: { foo: "bar" } }),
    ).toBeNull();
  });

  test("rejects non-object payloads", () => {
    expect(normalizeCyclonesPayload(null)).toBeNull();
    expect(normalizeCyclonesPayload(undefined)).toBeNull();
    expect(normalizeCyclonesPayload("string")).toBeNull();
    expect(normalizeCyclonesPayload(123)).toBeNull();
    expect(normalizeCyclonesPayload([])).toBeNull();
  });

  test("preserves extra fields by ignoring them (server passes through what it needs)", () => {
    const out = normalizeCyclonesPayload({
      activeStorms: [{ id: "al01" }],
      _comment: "synthetic",
      extra: "ignored",
    });
    expect(out?.activeStorms.length).toBe(1);
  });
});

// ── Module-level cache + constants ─────────────────────────────────

describe("cyclonesCache module surface", () => {
  test("getCyclonesCache returns initial empty shape before any fetch", () => {
    const c = getCyclonesCache();
    expect(c.body).toBeNull();
    expect(c.fetchedAt).toBe(0);
    expect(c.stormCount).toBe(0);
    expect(c.error).toBeNull();
  });

  test("NHC_URL is the hardcoded official endpoint (A10 SSRF guard)", () => {
    expect(NHC_URL).toBe("https://www.nhc.noaa.gov/CurrentStorms.json");
  });

  test("USER_AGENT identifies the project per NOAA convention", () => {
    expect(USER_AGENT).toContain("sigint");
    expect(USER_AGENT).toContain("github.com/iitoneloc/sigint");
  });

  test("poll interval is 30 minutes (matches client maxCacheAgeMs ≤ pollInterval invariant)", () => {
    expect(POLL_INTERVAL_MS).toBe(30 * 60_000);
  });
});

// ── Fixture-driven validation (test-only fixture system) ──────────

describe("normalizeCyclonesPayload — accepts the v1.0 fixture set", () => {
  const FIXTURES = [
    "empty-out-of-season.json",
    "tropical-depression.json",
    "subtropical-example.json",
    "single-cat3.json",
    "single-cat5.json",
    "multi-storm.json",
  ];

  for (const name of FIXTURES) {
    test(`tests/fixtures/cyclones/${name} normalizes successfully`, async () => {
      const fixture = await Bun.file(`tests/fixtures/cyclones/${name}`).json();
      const out = normalizeCyclonesPayload(fixture);
      expect(out).not.toBeNull();
      expect(Array.isArray(out?.activeStorms)).toBe(true);
    });
  }
});
