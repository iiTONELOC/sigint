import { describe, test, expect } from "bun:test";
import {
  ACTIVE_BASINS,
  basinSeasonActive,
  anyBasinActive,
  anyActiveBasinInSeason,
  shouldShowCyclonesToggle,
  type CycloneBasin,
} from "../../src/shared/cyclonesSeason";

// All dates are UTC — the helper reads `getUTCMonth() / getUTCDate()`
// so dyno-vs-laptop TZ skew can't drift the boundary.
const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

// ── Northern Hemisphere basins (AL / EP / CP) ─────────────────────
// Window: May 15 – Dec 15 inclusive.

describe("basinSeasonActive — Northern Hemisphere (AL/EP/CP)", () => {
  const NORTH: CycloneBasin[] = ["AL", "EP", "CP"];

  test("Jun 1 → in season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 6, 1))).toBe(true);
  });

  test("Aug 15 → in season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 8, 15))).toBe(true);
  });

  test("Nov 30 → in season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 11, 30))).toBe(true);
  });

  test("Jan 15 → out of season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 1, 15))).toBe(false);
  });

  test("Mar 1 → out of season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 3, 1))).toBe(false);
  });

  test("May 15 (low boundary, inclusive) → in season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 5, 15))).toBe(true);
  });

  test("May 14 (one day before boundary) → out of season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 5, 14))).toBe(false);
  });

  test("Dec 15 (high boundary, inclusive) → in season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 12, 15))).toBe(true);
  });

  test("Dec 16 (one day after boundary) → out of season", () => {
    for (const b of NORTH) expect(basinSeasonActive(b, utc(2026, 12, 16))).toBe(false);
  });
});

// ── Southern Hemisphere basin (SH) ────────────────────────────────
// Window: Oct 15 – May 15 inclusive (wraps year boundary).

describe("basinSeasonActive — Southern Hemisphere (SH)", () => {
  test("Jan 15 → in season (mid-summer)", () => {
    expect(basinSeasonActive("SH", utc(2026, 1, 15))).toBe(true);
  });

  test("Mar 1 → in season", () => {
    expect(basinSeasonActive("SH", utc(2026, 3, 1))).toBe(true);
  });

  test("Nov 30 → in season", () => {
    expect(basinSeasonActive("SH", utc(2026, 11, 30))).toBe(true);
  });

  test("Jul 1 → out of season (austral winter)", () => {
    expect(basinSeasonActive("SH", utc(2026, 7, 1))).toBe(false);
  });

  test("Oct 15 (low boundary, inclusive) → in season", () => {
    expect(basinSeasonActive("SH", utc(2026, 10, 15))).toBe(true);
  });

  test("Oct 14 (one day before boundary) → out of season", () => {
    expect(basinSeasonActive("SH", utc(2026, 10, 14))).toBe(false);
  });

  test("May 15 (high boundary, inclusive) → in season", () => {
    expect(basinSeasonActive("SH", utc(2026, 5, 15))).toBe(true);
  });

  test("May 16 (one day after boundary) → out of season", () => {
    expect(basinSeasonActive("SH", utc(2026, 5, 16))).toBe(false);
  });
});

// ── Year-round basins (WP / IO) ───────────────────────────────────

describe("basinSeasonActive — year-round basins (WP/IO)", () => {
  const YEAR_ROUND: CycloneBasin[] = ["WP", "IO"];
  const sampleDays = [
    utc(2026, 1, 1),
    utc(2026, 4, 30),
    utc(2026, 7, 15),
    utc(2026, 10, 14),
    utc(2026, 12, 31),
  ];

  test("WP and IO are in season every day of the year", () => {
    for (const b of YEAR_ROUND) {
      for (const d of sampleDays) {
        expect(basinSeasonActive(b, d)).toBe(true);
      }
    }
  });
});

// ── anyBasinActive ────────────────────────────────────────────────

describe("anyBasinActive", () => {
  test("returns true year-round (WP/IO are always in season)", () => {
    const sampleDays = [
      utc(2026, 1, 15),
      utc(2026, 5, 14),
      utc(2026, 7, 1),
      utc(2026, 10, 14),
      utc(2026, 12, 16),
    ];
    for (const d of sampleDays) {
      expect(anyBasinActive(d)).toBe(true);
    }
  });
});

// ── ACTIVE_BASINS + anyActiveBasinInSeason ────────────────────────

describe("ACTIVE_BASINS + anyActiveBasinInSeason", () => {
  test("ACTIVE_BASINS lists exactly AL/EP/CP today (NHC-only scope)", () => {
    expect([...ACTIVE_BASINS].sort()).toEqual(["AL", "CP", "EP"]);
  });

  test("anyActiveBasinInSeason matches the Northern-Hemi window since AL/EP/CP share it", () => {
    expect(anyActiveBasinInSeason(utc(2026, 1, 15))).toBe(false); // mid-winter
    expect(anyActiveBasinInSeason(utc(2026, 5, 14))).toBe(false); // one day before window
    expect(anyActiveBasinInSeason(utc(2026, 5, 15))).toBe(true); // boundary in
    expect(anyActiveBasinInSeason(utc(2026, 8, 1))).toBe(true); // peak
    expect(anyActiveBasinInSeason(utc(2026, 12, 15))).toBe(true); // boundary in
    expect(anyActiveBasinInSeason(utc(2026, 12, 16))).toBe(false); // one day after window
  });
});

// ── shouldShowCyclonesToggle — UI visibility predicate ───────────

describe("shouldShowCyclonesToggle", () => {
  const inSeason = utc(2026, 8, 15); // peak Atlantic
  const outOfSeason = utc(2026, 2, 1); // mid-winter, all NH basins shut

  test("out of season + no storms → toggle hidden", () => {
    expect(shouldShowCyclonesToggle(0, outOfSeason)).toBe(false);
  });

  test("out of season + 1 storm → toggle visible (rare late-season carry-over)", () => {
    expect(shouldShowCyclonesToggle(1, outOfSeason)).toBe(true);
  });

  test("in season + no storms → toggle visible (a storm could appear any moment)", () => {
    expect(shouldShowCyclonesToggle(0, inSeason)).toBe(true);
  });

  test("in season + storms → toggle visible", () => {
    expect(shouldShowCyclonesToggle(3, inSeason)).toBe(true);
  });

  test("season-boundary day (May 15) + no storms → toggle visible", () => {
    expect(shouldShowCyclonesToggle(0, utc(2026, 5, 15))).toBe(true);
  });

  test("one day before season (May 14) + no storms → toggle hidden", () => {
    expect(shouldShowCyclonesToggle(0, utc(2026, 5, 14))).toBe(false);
  });

  test("default `now` (no second arg) wires the live wall clock", () => {
    // Storm count > 0 wins regardless of date — verifies the parameter
    // is optional without tripping a TypeError.
    expect(shouldShowCyclonesToggle(1)).toBe(true);
  });
});
