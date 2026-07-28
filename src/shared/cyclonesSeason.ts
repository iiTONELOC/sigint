export enum CycloneBasin {
  Atlantic = "AL",
  EasternPacific = "EP",
  CentralPacific = "CP",
  WesternPacific = "WP",
  IndianOcean = "IO",
  SouthernHemisphere = "SH",
}

/** The basins NHC publishes, which is the runtime scope. */
export type NhcBasin =
  | CycloneBasin.Atlantic
  | CycloneBasin.EasternPacific
  | CycloneBasin.CentralPacific;

enum SeasonWindowKind {
  YearRound = "year_round",
  Bounded = "bounded",
}

type MonthDay = Readonly<{ month: number; day: number }>;
type SeasonWindow =
  | Readonly<{ kind: SeasonWindowKind.YearRound }>
  | Readonly<{ kind: SeasonWindowKind.Bounded; start: MonthDay; end: MonthDay }>;

const MONTH_DAY_RADIX = 100;
const NORTHERN_START: MonthDay = { month: 5, day: 15 };
const NORTHERN_END: MonthDay = { month: 12, day: 15 };
const SOUTHERN_START: MonthDay = { month: 10, day: 15 };
const SOUTHERN_END: MonthDay = { month: 5, day: 15 };
const YEAR_ROUND: SeasonWindow = { kind: SeasonWindowKind.YearRound };

const NORTHERN_SEASON: SeasonWindow = {
  kind: SeasonWindowKind.Bounded,
  start: NORTHERN_START,
  end: NORTHERN_END,
};

const BASIN_SEASONS: Readonly<Record<CycloneBasin, SeasonWindow>> = {
  [CycloneBasin.Atlantic]: NORTHERN_SEASON,
  [CycloneBasin.EasternPacific]: NORTHERN_SEASON,
  [CycloneBasin.CentralPacific]: NORTHERN_SEASON,
  [CycloneBasin.WesternPacific]: YEAR_ROUND,
  [CycloneBasin.IndianOcean]: YEAR_ROUND,
  [CycloneBasin.SouthernHemisphere]: {
    kind: SeasonWindowKind.Bounded,
    start: SOUTHERN_START,
    end: SOUTHERN_END,
  },
};

const ALL_BASINS: readonly CycloneBasin[] = Object.values(CycloneBasin);

// Runtime scope remains NHC-only until a reliable JTWC source exists.
export const ACTIVE_BASINS: readonly NhcBasin[] = [
  CycloneBasin.Atlantic,
  CycloneBasin.EasternPacific,
  CycloneBasin.CentralPacific,
];

const NHC_BASIN_VALUES: ReadonlySet<string> = new Set(ACTIVE_BASINS);

/** Narrows a raw source field to a basin NHC actually publishes. */
export function isNhcBasin(value: unknown): value is NhcBasin {
  return typeof value === "string" && NHC_BASIN_VALUES.has(value);
}

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
  if (window.kind === SeasonWindowKind.YearRound) return true;
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
