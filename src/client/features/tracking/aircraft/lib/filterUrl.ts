import type { AircraftFilter } from "../types";

export const DEFAULT_AIRCRAFT_FILTER: AircraftFilter = {
  enabled: true,
  showAirborne: true,
  showGround: true,
  squawks: new Set(),
  countries: new Set(),
};

function parseBoolParam(
  params: URLSearchParams,
  key: string,
  defaultValue: boolean,
): boolean {
  if (!params.has(key)) return defaultValue;
  const raw = (params.get(key) ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

export function getInitialAircraftFilter(): AircraftFilter {
  if (typeof window === "undefined") return DEFAULT_AIRCRAFT_FILTER;
  const params = new URLSearchParams(window.location.search);

  const squawksRaw = params.get("squawks") ?? "";
  const squawks = new Set<"7700" | "7600" | "7500" | "other">();
  squawksRaw
    .split(",")
    .map((v) => v.trim())
    .forEach((v) => {
      if (v === "7700" || v === "7600" || v === "7500" || v === "other") {
        squawks.add(v);
      }
    });

  let countries: Set<string>;
  if (!params.has("countries")) {
    countries = new Set(DEFAULT_AIRCRAFT_FILTER.countries);
  } else {
    countries = new Set(
      (params.get("countries") ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
  }

  return {
    enabled: parseBoolParam(params, "ac", DEFAULT_AIRCRAFT_FILTER.enabled),
    showAirborne: parseBoolParam(
      params,
      "air",
      DEFAULT_AIRCRAFT_FILTER.showAirborne,
    ),
    showGround: parseBoolParam(
      params,
      "gnd",
      DEFAULT_AIRCRAFT_FILTER.showGround,
    ),
    squawks,
    countries,
  };
}

export function syncAircraftFilterToUrl(aircraftFilter: AircraftFilter): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.set("ac", aircraftFilter.enabled ? "1" : "0");
  params.set("air", aircraftFilter.showAirborne ? "1" : "0");
  params.set("gnd", aircraftFilter.showGround ? "1" : "0");

  const squawkValues = Array.from(aircraftFilter.squawks).sort();
  if (squawkValues.length > 0) params.set("squawks", squawkValues.join(","));
  else params.delete("squawks");

  const countryValues = Array.from(aircraftFilter.countries).sort();
  if (countryValues.length > 0)
    params.set("countries", countryValues.join(","));
  else params.delete("countries");

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
