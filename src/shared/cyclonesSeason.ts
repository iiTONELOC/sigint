export type CycloneBasin = "AL" | "EP" | "CP" | "WP" | "IO" | "SH";

type MonthDay = Readonly<{ month: number; day: number }>;
type SeasonWindow =
  | Readonly<{ kind: "year_round" }>
  | Readonly<{ kind: "bounded"; start: MonthDay; end: MonthDay }>;

const MONTH_DAY_RADIX = 100;
const NORTHERN_START: MonthDay = { month: 5, day: 15 };
const NORTHERN_END: MonthDay = { month: 12, day: 15 };
const SOUTHERN_START: MonthDay = { month: 10, day: 15 };
const SOUTHERN_END: MonthDay = { month: 5, day: 15 };
const YEAR_ROUND: SeasonWindow = { kind: "year_round" };

const BASIN_SEASONS: Readonly<Record<CycloneBasin, SeasonWindow>> = {
  AL: { kind: "bounded", start: NORTHERN_START, end: NORTHERN_END },
  EP: { kind: "bounded", start: NORTHERN_START, end: NORTHERN_END },
  CP: { kind: "bounded", start: NORTHERN_START, end: NORTHERN_END },
  WP: YEAR_ROUND,
  IO: YEAR_ROUND,
  SH: { kind: "bounded", start: SOUTHERN_START, end: SOUTHERN_END },
};

const ALL_BASINS: readonly CycloneBasin[] = ["AL", "EP", "CP", "WP", "IO", "SH"];

// Runtime scope remains NHC-only until a reliable JTWC source exists.
export const ACTIVE_BASINS: readonly CycloneBasin[] = ["AL", "EP", "CP"];

function monthDayValue(value: MonthDay): number {
  return value.month * MONTH_DAY_RADIX + value.day;
}

function inWindow(current: MonthDay, start: MonthDay, end: MonthDay): boolean {
  const currentValue = monthDayValue(current);
  const startValue = monthDayValue(start);
  const endValue = monthDayValue(end);
  if (startValue <= endValue) {
    return currentValue >= startValue && currentValue <= endValue;
  }
  // A start after the end marks a season that wraps across the UTC year.
  return currentValue >= startValue || currentValue <= endValue;
}

export function basinSeasonActive(
  basin: CycloneBasin,
  now: Date = new Date(),
): boolean {
  const window = BASIN_SEASONS[basin];
  if (window.kind === "year_round") return true;
  return inWindow(
    { month: now.getUTCMonth() + 1, day: now.getUTCDate() },
    window.start,
    window.end,
  );
}

export function anyBasinActive(now: Date = new Date()): boolean {
  return ALL_BASINS.some((basin) => basinSeasonActive(basin, now));
}

export function anyActiveBasinInSeason(now: Date = new Date()): boolean {
  return ACTIVE_BASINS.some((basin) => basinSeasonActive(basin, now));
}

export function shouldShowCyclonesToggle(
  stormCount: number,
  now: Date = new Date(),
): boolean {
  return stormCount > 0 || anyActiveBasinInSeason(now);
}
