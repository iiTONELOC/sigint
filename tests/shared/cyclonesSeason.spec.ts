import { describe, test, expect } from "bun:test";
import {
  ACTIVE_BASINS,
  CycloneBasin,
  anyActiveBasinInSeason,
  shouldShowCyclonesToggle,
} from "@shared/cyclonesSeason";

// All dates are UTC — the helper reads `getUTCMonth() / getUTCDate()`
// so dyno-vs-laptop TZ skew can't drift the boundary.
const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

// ── ACTIVE_BASINS + anyActiveBasinInSeason ────────────────────────

describe("ACTIVE_BASINS + anyActiveBasinInSeason", () => {
  test("ACTIVE_BASINS lists exactly AL/EP/CP today (NHC-only scope)", () => {
    expect([...ACTIVE_BASINS].sort()).toEqual([
      CycloneBasin.Atlantic,
      CycloneBasin.CentralPacific,
      CycloneBasin.EasternPacific,
    ]);
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
