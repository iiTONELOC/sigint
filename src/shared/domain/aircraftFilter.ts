import {
  type AircraftData,
  type AircraftPoint,
  MilFilter,
  SquawkBucket,
  squawkBucketFor,
} from "./aircraft";
import { isRecord } from "../geo";
import { isEnumValue } from "../types/enum";

export type AircraftFilterValues = Readonly<{
  enabled: boolean;
  showAirborne: boolean;
  showGround: boolean;
  milFilter: MilFilter;
  squawks: readonly SquawkBucket[];
  countries: readonly string[];
}>;

export const DEFAULT_AIRCRAFT_FILTER_VALUES: AircraftFilterValues = {
  enabled: true,
  showAirborne: true,
  showGround: true,
  milFilter: MilFilter.All,
  squawks: [],
  countries: [],
};

export function isAircraftFilter(
  value: unknown,
): value is AircraftFilterValues {
  return isRecord(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.showAirborne === "boolean" &&
    typeof value.showGround === "boolean" &&
    isEnumValue(value.milFilter, MilFilter) &&
    Array.isArray(value.squawks) &&
    value.squawks.every((entry) => isEnumValue(entry, SquawkBucket)) &&
    new Set(value.squawks).size === value.squawks.length &&
    Array.isArray(value.countries) &&
    value.countries.every(
      (entry) => typeof entry === "string" && entry.length > 0,
    ) &&
    new Set(value.countries).size === value.countries.length;
}

function matchesRole(data: AircraftData, filter: MilFilter): boolean {
  if (filter === MilFilter.Military) return data.military === true;
  if (filter === MilFilter.Civilian) return data.military !== true;
  if (filter === MilFilter.Recon) return data.recon === true;
  return true;
}

export function matchesAircraftFilter(
  point: AircraftPoint,
  filter: AircraftFilterValues,
): boolean {
  if (!filter.enabled) return false;
  const { data } = point;
  const movementMatches = data.onGround === true
    ? filter.showGround
    : filter.showAirborne;
  const squawkMatches = filter.squawks.length === 0 ||
    filter.squawks.includes(squawkBucketFor(data.squawk));
  const countryMatches = filter.countries.length === 0 ||
    filter.countries.includes(data.originCountry ?? "");
  return movementMatches &&
    matchesRole(data, filter.milFilter) &&
    squawkMatches &&
    countryMatches;
}
