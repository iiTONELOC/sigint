import {
  MilFilter,
  type SquawkBucket,
} from "./aircraft";

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
