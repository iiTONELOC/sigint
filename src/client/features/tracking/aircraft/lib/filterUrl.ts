import type { AircraftFilter } from "../types";
import {
  MilFilter,
  SquawkBucket,
} from "@shared/domain/aircraft";
import {
  DEFAULT_AIRCRAFT_FILTER_VALUES,
} from "@shared/domain/aircraftFilter";
import { isEnumValue } from "@shared/types/enum";

enum AircraftFilterQuery {
  Enabled = "ac",
  Airborne = "air",
  Ground = "gnd",
  Squawks = "squawks",
  Countries = "countries",
  Military = "mil",
}

enum QueryBoolean {
  True = "1",
  False = "0",
  TrueWord = "true",
  FalseWord = "false",
  Yes = "yes",
  No = "no",
  On = "on",
  Off = "off",
}

const TRUE_QUERY_VALUES: ReadonlySet<string> = new Set([
  QueryBoolean.True,
  QueryBoolean.TrueWord,
  QueryBoolean.Yes,
  QueryBoolean.On,
]);

const FALSE_QUERY_VALUES: ReadonlySet<string> = new Set([
  QueryBoolean.False,
  QueryBoolean.FalseWord,
  QueryBoolean.No,
  QueryBoolean.Off,
]);

export const DEFAULT_AIRCRAFT_FILTER: AircraftFilter = {
  enabled: DEFAULT_AIRCRAFT_FILTER_VALUES.enabled,
  showAirborne: DEFAULT_AIRCRAFT_FILTER_VALUES.showAirborne,
  showGround: DEFAULT_AIRCRAFT_FILTER_VALUES.showGround,
  squawks: new Set(DEFAULT_AIRCRAFT_FILTER_VALUES.squawks),
  countries: new Set(DEFAULT_AIRCRAFT_FILTER_VALUES.countries),
  milFilter: DEFAULT_AIRCRAFT_FILTER_VALUES.milFilter,
};

function parseBoolParam(
  params: URLSearchParams,
  key: AircraftFilterQuery,
  defaultValue: boolean,
): boolean {
  if (!params.has(key)) return defaultValue;
  const raw = (params.get(key) ?? "").trim().toLowerCase();
  if (TRUE_QUERY_VALUES.has(raw)) return true;
  if (FALSE_QUERY_VALUES.has(raw)) return false;
  return defaultValue;
}

export function getInitialAircraftFilter(): AircraftFilter {
  if (typeof window === "undefined") return DEFAULT_AIRCRAFT_FILTER;
  const params = new URLSearchParams(window.location.search);

  const squawksRaw = params.get(AircraftFilterQuery.Squawks) ?? "";
  const squawks = new Set<SquawkBucket>();
  for (const raw of squawksRaw.split(",")) {
    const candidate = raw.trim();
    if (isEnumValue(candidate, SquawkBucket)) squawks.add(candidate);
  }

  let countries: Set<string>;
  if (!params.has(AircraftFilterQuery.Countries)) {
    countries = new Set(DEFAULT_AIRCRAFT_FILTER.countries);
  } else {
    countries = new Set(
      (params.get(AircraftFilterQuery.Countries) ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
  }

  const milRaw = (
    params.get(AircraftFilterQuery.Military) ?? ""
  ).trim().toLowerCase();
  const milFilter = isEnumValue(milRaw, MilFilter) ? milRaw : MilFilter.All;

  return {
    enabled: parseBoolParam(
      params,
      AircraftFilterQuery.Enabled,
      DEFAULT_AIRCRAFT_FILTER.enabled,
    ),
    showAirborne: parseBoolParam(
      params,
      AircraftFilterQuery.Airborne,
      DEFAULT_AIRCRAFT_FILTER.showAirborne,
    ),
    showGround: parseBoolParam(
      params,
      AircraftFilterQuery.Ground,
      DEFAULT_AIRCRAFT_FILTER.showGround,
    ),
    squawks,
    countries,
    milFilter,
  };
}

export function syncAircraftFilterToUrl(aircraftFilter: AircraftFilter): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set(
    AircraftFilterQuery.Enabled,
    aircraftFilter.enabled ? QueryBoolean.True : QueryBoolean.False,
  );
  params.set(
    AircraftFilterQuery.Airborne,
    aircraftFilter.showAirborne
      ? QueryBoolean.True
      : QueryBoolean.False,
  );
  params.set(
    AircraftFilterQuery.Ground,
    aircraftFilter.showGround
      ? QueryBoolean.True
      : QueryBoolean.False,
  );

  const squawkValues = Array.from(aircraftFilter.squawks).sort((left, right) =>
    left.localeCompare(right),
  );
  if (squawkValues.length > 0) {
    params.set(
      AircraftFilterQuery.Squawks,
      squawkValues.join(","),
    );
  } else {
    params.delete(AircraftFilterQuery.Squawks);
  }

  const countryValues = Array.from(aircraftFilter.countries).sort(
    (left, right) => left.localeCompare(right),
  );
  if (countryValues.length > 0) {
    params.set(
      AircraftFilterQuery.Countries,
      countryValues.join(","),
    );
  } else {
    params.delete(AircraftFilterQuery.Countries);
  }

  if (aircraftFilter.milFilter !== MilFilter.All) {
    params.set(
      AircraftFilterQuery.Military,
      aircraftFilter.milFilter,
    );
  } else {
    params.delete(AircraftFilterQuery.Military);
  }

  const query = params.toString();
  const nextUrl =
    query.length > 0
      ? `${window.location.pathname}?${query}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;

  if (
    `${window.location.pathname}${window.location.search}${window.location.hash}` !==
    nextUrl
  ) {
    window.history.replaceState({}, "", nextUrl);
  }
}
