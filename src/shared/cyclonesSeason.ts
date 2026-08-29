export enum CycloneBasin {
  Atlantic = "AL",
  EasternPacific = "EP",
  CentralPacific = "CP",
}

export const BASIN_LABEL: Readonly<Record<CycloneBasin, string>> = {
  [CycloneBasin.Atlantic]: "Atlantic",
  [CycloneBasin.EasternPacific]: "East Pacific",
  [CycloneBasin.CentralPacific]: "Central Pacific",
};

const MONTH_DAY_RADIX = 100;
const NHC_SEASON_START = 515;
const NHC_SEASON_END = 1_215;

export const ACTIVE_BASINS: readonly CycloneBasin[] =
  Object.values(CycloneBasin);

const NHC_BASIN_VALUES: ReadonlySet<string> = new Set(ACTIVE_BASINS);

export function isNhcBasin(value: unknown): value is CycloneBasin {
  return typeof value === "string" && NHC_BASIN_VALUES.has(value);
}

export function anyActiveBasinInSeason(now: Date = new Date()): boolean {
  const monthDay =
    (now.getUTCMonth() + 1) * MONTH_DAY_RADIX + now.getUTCDate();
  return monthDay >= NHC_SEASON_START && monthDay <= NHC_SEASON_END;
}

export function shouldShowCyclonesToggle(
  stormCount: number,
  now: Date = new Date(),
): boolean {
  return stormCount > 0 || anyActiveBasinInSeason(now);
}
