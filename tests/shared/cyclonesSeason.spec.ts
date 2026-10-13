import { describe, test, expect } from "bun:test";
import {
  ACTIVE_BASINS,
  CycloneBasin,
  anyActiveBasinInSeason,
  basinLabel,
  shouldShowCyclonesToggle,
} from "@shared/cyclonesSeason";

enum SeasonFixtureYear {
  Current = 2026,
}

enum SeasonFixtureCount {
  None = 0,
  One = 1,
  Several = 3,
}

const utc = (month: number, day: number): Date =>
  new Date(Date.UTC(SeasonFixtureYear.Current, month - 1, day));

const IN_SEASON = utc(8, 15);
const OUT_OF_SEASON = utc(2, 1);

describe("ACTIVE_BASINS and anyActiveBasinInSeason", () => {
  test("ACTIVE_BASINS lists exactly the Atlantic, Eastern Pacific and Central Pacific", () => {
    expect([...ACTIVE_BASINS].sort()).toEqual([
      CycloneBasin.Atlantic,
      CycloneBasin.CentralPacific,
      CycloneBasin.EastPacific,
    ]);
  });

  test("names every basin from its member name", () => {
    expect(Object.values(CycloneBasin).map(basinLabel)).toEqual(["Atlantic", "East Pacific", "Central Pacific"]);
  });

  test("anyActiveBasinInSeason follows the shared Northern Hemisphere window, boundaries inclusive", () => {
    const cases: ReadonlyArray<readonly [Date, boolean]> = [
      [utc(1, 15), false],
      [utc(5, 14), false],
      [utc(5, 15), true],
      [utc(8, 1), true],
      [utc(12, 15), true],
      [utc(12, 16), false],
    ];

    for (const [date, inSeason] of cases) {
      expect([date.toISOString(), anyActiveBasinInSeason(date)]).toEqual([date.toISOString(), inSeason]);
    }
  });
});

describe("shouldShowCyclonesToggle", () => {
  test("shows the toggle in season, or whenever a storm exists, and hides it otherwise", () => {
    const cases: ReadonlyArray<readonly [number, Date, boolean]> = [
      [SeasonFixtureCount.None, OUT_OF_SEASON, false],
      [SeasonFixtureCount.One, OUT_OF_SEASON, true],
      [SeasonFixtureCount.None, IN_SEASON, true],
      [SeasonFixtureCount.Several, IN_SEASON, true],
      [SeasonFixtureCount.None, utc(5, 15), true],
      [SeasonFixtureCount.None, utc(5, 14), false],
    ];

    for (const [storms, date, visible] of cases) {
      expect([storms, date.toISOString(), shouldShowCyclonesToggle(storms, date)]).toEqual([storms, date.toISOString(), visible]);
    }
  });

  test("reads the live clock when no date is given", () => {
    expect(shouldShowCyclonesToggle(SeasonFixtureCount.One)).toBe(true);
  });
});
