import { describe, test, expect } from "bun:test";
import {
  ICAO24_COUNTRY_RANGES,
  countryFromIcao24,
} from "../../../src/server/data/icao24CountryRanges";

// ── countryFromIcao24 — ICAO Annex 10 hex-to-country lookup ─────
// Every test fixture and dossier consumer uses full English country
// names ("United States", "France", etc.) — the spec asserts on
// those literals. If you ever swap the format to ISO 3166 alpha-3,
// update fixtures + this spec together.

describe("countryFromIcao24 — geographic spread", () => {
  test("US hex a12345 → United States", () => {
    expect(countryFromIcao24("a12345")).toBe("United States");
  });

  test("UK hex 400000 → United Kingdom", () => {
    expect(countryFromIcao24("400000")).toBe("United Kingdom");
  });

  test("Germany hex 3c0000 → Germany", () => {
    expect(countryFromIcao24("3c0000")).toBe("Germany");
  });

  test("Japan hex 840000 → Japan", () => {
    expect(countryFromIcao24("840000")).toBe("Japan");
  });

  test("Canada hex c01234 → Canada", () => {
    expect(countryFromIcao24("c01234")).toBe("Canada");
  });

  test("Brazil hex e48000 → Brazil", () => {
    expect(countryFromIcao24("e48000")).toBe("Brazil");
  });

  test("Australia hex 7c8000 → Australia", () => {
    expect(countryFromIcao24("7c8000")).toBe("Australia");
  });

  test("China hex 781234 → China", () => {
    expect(countryFromIcao24("781234")).toBe("China");
  });

  test("Russia hex 100000 → Russian Federation", () => {
    expect(countryFromIcao24("100000")).toBe("Russian Federation");
  });

  test("South Africa hex 008000 → South Africa", () => {
    expect(countryFromIcao24("008000")).toBe("South Africa");
  });
});

describe("countryFromIcao24 — boundaries", () => {
  test("first hex of US range (a00000) → United States", () => {
    expect(countryFromIcao24("a00000")).toBe("United States");
  });

  test("last hex of US range (afffff) → United States", () => {
    expect(countryFromIcao24("afffff")).toBe("United States");
  });

  test("one hex past US range (b00000) → '' (currently unmapped block)", () => {
    expect(countryFromIcao24("b00000")).toBe("");
  });

  test("one hex below US range (9fffff) → '' (currently unmapped)", () => {
    expect(countryFromIcao24("9fffff")).toBe("");
  });

  test("first hex of UK range (400000) inclusive", () => {
    expect(countryFromIcao24("400000")).toBe("United Kingdom");
  });

  test("last hex of UK range (43ffff) inclusive", () => {
    expect(countryFromIcao24("43ffff")).toBe("United Kingdom");
  });

  test("UK→Austria boundary: 440000 → Austria, not UK", () => {
    expect(countryFromIcao24("440000")).toBe("Austria");
  });
});

describe("countryFromIcao24 — invalid input", () => {
  test("empty string → ''", () => {
    expect(countryFromIcao24("")).toBe("");
  });

  test("non-hex characters → ''", () => {
    expect(countryFromIcao24("xyz123")).toBe("");
  });

  test("hex inside an unallocated block (e.g. 200000 in unassigned EUR gap) → ''", () => {
    expect(countryFromIcao24("200000")).toBe("");
  });
});

describe("ICAO24_COUNTRY_RANGES — table integrity", () => {
  test("ranges are sorted by start ascending (binary-search invariant)", () => {
    for (let i = 1; i < ICAO24_COUNTRY_RANGES.length; i++) {
      const prev = ICAO24_COUNTRY_RANGES[i - 1]!;
      const curr = ICAO24_COUNTRY_RANGES[i]!;
      expect(curr.start).toBeGreaterThan(prev.start);
    }
  });

  test("every range has start ≤ end", () => {
    for (const r of ICAO24_COUNTRY_RANGES) {
      expect(r.start).toBeLessThanOrEqual(r.end);
    }
  });

  test("ranges do not overlap (no hex maps to two countries)", () => {
    for (let i = 1; i < ICAO24_COUNTRY_RANGES.length; i++) {
      const prev = ICAO24_COUNTRY_RANGES[i - 1]!;
      const curr = ICAO24_COUNTRY_RANGES[i]!;
      expect(curr.start).toBeGreaterThan(prev.end);
    }
  });
});
