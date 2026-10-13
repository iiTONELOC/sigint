import { describe, test, expect } from "bun:test";
import {
  ICAO24_COUNTRY_RANGES,
  countryFromIcao24,
} from "../../../src/server/data/icao24CountryRanges";

enum CountryName {
  Australia = "Australia",
  Austria = "Austria",
  Brazil = "Brazil",
  Canada = "Canada",
  China = "China",
  Germany = "Germany",
  Japan = "Japan",
  Russia = "Russian Federation",
  SouthAfrica = "South Africa",
  UnitedKingdom = "United Kingdom",
  UnitedStates = "United States",
  Unmapped = "",
}

const SPREAD: ReadonlyArray<readonly [string, CountryName]> = [
  ["a12345", CountryName.UnitedStates],
  ["400000", CountryName.UnitedKingdom],
  ["3c0000", CountryName.Germany],
  ["840000", CountryName.Japan],
  ["c01234", CountryName.Canada],
  ["e48000", CountryName.Brazil],
  ["7c8000", CountryName.Australia],
  ["781234", CountryName.China],
  ["100000", CountryName.Russia],
  ["008000", CountryName.SouthAfrica],
];

const BOUNDARIES: ReadonlyArray<readonly [string, CountryName]> = [
  ["a00000", CountryName.UnitedStates],
  ["afffff", CountryName.UnitedStates],
  ["b00000", CountryName.Unmapped],
  ["9fffff", CountryName.Unmapped],
  ["400000", CountryName.UnitedKingdom],
  ["43ffff", CountryName.UnitedKingdom],
  ["440000", CountryName.Austria],
];

const INVALID: ReadonlyArray<readonly [string, CountryName]> = [
  ["", CountryName.Unmapped],
  ["xyz123", CountryName.Unmapped],
  ["200000", CountryName.Unmapped],
];

describe("countryFromIcao24", () => {
  test("names the country across allocated blocks, keeps boundaries inclusive, and answers empty for gaps and bad input", () => {
    for (const [hex, country] of [...SPREAD, ...BOUNDARIES, ...INVALID]) {
      expect([hex, countryFromIcao24(hex)]).toEqual([hex, country]);
    }
  });
});

describe("ICAO24_COUNTRY_RANGES table integrity", () => {
  test("ranges are sorted by start, each start precedes its end, and no two ranges overlap", () => {
    for (let index = 1; index < ICAO24_COUNTRY_RANGES.length; index++) {
      const previous = ICAO24_COUNTRY_RANGES[index - 1];
      const current = ICAO24_COUNTRY_RANGES[index];
      if (!previous || !current) throw new TypeError("the range table must be dense");
      expect(current.start).toBeGreaterThan(previous.end);
    }
    for (const range of ICAO24_COUNTRY_RANGES) {
      expect(range.start).toBeLessThanOrEqual(range.end);
    }
  });
});
