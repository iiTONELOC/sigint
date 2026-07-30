import {
  MilFilter,
  SquawkBucket,
} from "@shared/domain/aircraft";
import {
  DEFAULT_AIRCRAFT_FILTER_VALUES,
} from "@shared/domain/aircraftFilter";
import { isEnumValue } from "@shared/types/enum";
import {
  RenderGlobeCommandKind,
  type RenderAircraftFilter,
} from "@/workers/render/protocol";
import type {
  RenderGlobeStateStore,
} from "@/render-surface/globeStateStore";

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

export type RenderUrlLocation = Readonly<
  Pick<Location, "pathname" | "search" | "hash">
>;

export type AircraftFilterUrlAdapterOptions = Readonly<{
  globeState: RenderGlobeStateStore;
  readLocation: () => RenderUrlLocation;
  replaceUrl: (url: string) => void;
}>;

function parseBoolean(
  params: URLSearchParams,
  key: AircraftFilterQuery,
  defaultValue: boolean,
): boolean {
  if (!params.has(key)) return defaultValue;
  const value = (params.get(key) ?? "").trim().toLowerCase();
  if (TRUE_QUERY_VALUES.has(value)) return true;
  if (FALSE_QUERY_VALUES.has(value)) return false;
  return defaultValue;
}

function parseSquawks(params: URLSearchParams): readonly SquawkBucket[] {
  const values = new Set<SquawkBucket>();
  const query = params.get(AircraftFilterQuery.Squawks) ?? "";
  for (const raw of query.split(",")) {
    const value = raw.trim();
    if (isEnumValue(value, SquawkBucket)) values.add(value);
  }
  return [...values];
}

function parseCountries(params: URLSearchParams): readonly string[] {
  if (!params.has(AircraftFilterQuery.Countries)) {
    return [...DEFAULT_AIRCRAFT_FILTER_VALUES.countries];
  }
  const query = params.get(AircraftFilterQuery.Countries) ?? "";
  return [
    ...new Set(
      query
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseAircraftFilterSearch(
  search: string,
): RenderAircraftFilter {
  const params = new URLSearchParams(search);
  const militaryQuery = (
    params.get(AircraftFilterQuery.Military) ?? ""
  ).trim().toLowerCase();
  return {
    enabled: parseBoolean(
      params,
      AircraftFilterQuery.Enabled,
      DEFAULT_AIRCRAFT_FILTER_VALUES.enabled,
    ),
    showAirborne: parseBoolean(
      params,
      AircraftFilterQuery.Airborne,
      DEFAULT_AIRCRAFT_FILTER_VALUES.showAirborne,
    ),
    showGround: parseBoolean(
      params,
      AircraftFilterQuery.Ground,
      DEFAULT_AIRCRAFT_FILTER_VALUES.showGround,
    ),
    squawks: parseSquawks(params),
    countries: parseCountries(params),
    milFilter: isEnumValue(militaryQuery, MilFilter)
      ? militaryQuery
      : DEFAULT_AIRCRAFT_FILTER_VALUES.milFilter,
  };
}

function setBooleanQuery(
  params: URLSearchParams,
  key: AircraftFilterQuery,
  value: boolean,
): void {
  params.set(
    key,
    value ? QueryBoolean.True : QueryBoolean.False,
  );
}

function setListQuery(
  params: URLSearchParams,
  key: AircraftFilterQuery,
  values: readonly string[],
): void {
  const sorted = [...values].sort((left, right) =>
    left.localeCompare(right),
  );
  if (sorted.length > 0) {
    params.set(key, sorted.join(","));
    return;
  }
  params.delete(key);
}

export function createAircraftFilterUrl(
  location: RenderUrlLocation,
  filter: RenderAircraftFilter,
): string {
  const params = new URLSearchParams(location.search);
  setBooleanQuery(params, AircraftFilterQuery.Enabled, filter.enabled);
  setBooleanQuery(
    params,
    AircraftFilterQuery.Airborne,
    filter.showAirborne,
  );
  setBooleanQuery(
    params,
    AircraftFilterQuery.Ground,
    filter.showGround,
  );
  setListQuery(params, AircraftFilterQuery.Squawks, filter.squawks);
  setListQuery(params, AircraftFilterQuery.Countries, filter.countries);
  if (filter.milFilter === MilFilter.All) {
    params.delete(AircraftFilterQuery.Military);
  } else {
    params.set(AircraftFilterQuery.Military, filter.milFilter);
  }
  const query = params.toString();
  return query.length > 0
    ? `${location.pathname}?${query}${location.hash}`
    : `${location.pathname}${location.hash}`;
}

export class AircraftFilterUrlAdapter {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly options: AircraftFilterUrlAdapterOptions,
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    const initial = parseAircraftFilterSearch(
      this.options.readLocation().search,
    );
    this.unsubscribe = this.options.globeState.subscribe(this.publish);
    this.replace(initial);
    this.options.globeState.dispatch({
      kind: RenderGlobeCommandKind.SetAircraftFilter,
      filter: initial,
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private readonly publish = (): void => {
    this.replace(this.options.globeState.read().aircraftFilter);
  };

  private replace(filter: RenderAircraftFilter): void {
    const location = this.options.readLocation();
    const current =
      `${location.pathname}${location.search}${location.hash}`;
    const next = createAircraftFilterUrl(location, filter);
    if (next !== current) this.options.replaceUrl(next);
  }
}

export function createBrowserAircraftFilterUrlAdapter(
  globeState: RenderGlobeStateStore,
): AircraftFilterUrlAdapter {
  return new AircraftFilterUrlAdapter({
    globeState,
    readLocation: () => globalThis.location,
    replaceUrl: (url) => {
      globalThis.history.replaceState(
        globalThis.history.state,
        document.title,
        url,
      );
    },
  });
}
