import { GeoLimit, isRecord, type GeoPoint } from "@shared/geo";
import { isOptionalFiniteNumber } from "@shared/types/numbers";

const AIRCRAFT_ICAO24_PATTERN = /^[0-9a-f]{6}$/i;

export enum AircraftRouteSource {
  FlightAware = "flightaware",
  HexDb = "hexdb",
}

export enum AircraftRouteLimit {
  WaypointComponentCount = 2,
  MaximumWaypointCount = 400,
}

export enum AircraftRoutePolylineLimit {
  MinimumWaypointCount = 2,
}

export type AircraftRouteWaypoint = readonly [
  latitude: number,
  longitude: number,
];

/** Waypoints as lon/lat points for the geo render helpers. */
export function routeGeoPoints(points: readonly AircraftRouteWaypoint[]): GeoPoint[] {
  return points.map(([latitude, longitude]) => [longitude, latitude]);
}

export type AircraftRouteEndpoint = Readonly<{
  iata?: string;
  icao?: string;
  name?: string;
  city?: string;
  gate?: string;
}>;

export type AircraftRoute = Readonly<{
  source: AircraftRouteSource;
  origin: AircraftRouteEndpoint;
  destination: AircraftRouteEndpoint;
  status?: string;
  departureTime?: number;
  arrivalTime?: number;
  departureActual?: boolean;
  arrivalActual?: boolean;
  delays?: Readonly<{ departure?: string; arrival?: string }>;
  filedRoute?: string;
  filedAltitude?: number;
  filedSpeed?: number;
  distance?: number;
  airline?: string;
  waypoints?: readonly AircraftRouteWaypoint[];
}>;

export type AircraftDossierAircraft = Readonly<{
  ICAOTypeCode?: string;
  Manufacturer?: string;
  ModeS?: string;
  OperatorFlagCode?: string;
  RegisteredOwners?: string;
  Registration?: string;
  Type?: string;
}>;

export type AircraftDossier = Readonly<{
  icao24: string;
  aircraft: AircraftDossierAircraft | null;
  route: AircraftRoute | null;
}>;

export type SplitRoute = Readonly<{
  flown: readonly AircraftRouteWaypoint[];
  remaining: readonly AircraftRouteWaypoint[];
}>;

export function aircraftAirportCode(
  endpoint: AircraftRouteEndpoint | undefined,
): string {
  return endpoint?.icao || endpoint?.iata || "";
}

export function isAircraftIcao24(value: string): boolean {
  return AIRCRAFT_ICAO24_PATTERN.test(value);
}

export function normalizeIcao24(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  return isAircraftIcao24(normalized) ? normalized : null;
}

export function splitRouteAtAircraft(
  route: readonly AircraftRouteWaypoint[],
  latitude: number,
  longitude: number,
): SplitRoute {
  let segmentIndex = 0;
  let segmentFraction = 0;
  let nearestDistance = Infinity;
  for (let index = 0; index < route.length - 1; index++) {
    const start = route[index];
    const end = route[index + 1];
    if (!start || !end) continue;
    const longitudeDelta = end[1] - start[1];
    const latitudeDelta = end[0] - start[0];
    const segmentLength =
      longitudeDelta * longitudeDelta + latitudeDelta * latitudeDelta;
    const fraction = segmentLength > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((longitude - start[1]) * longitudeDelta +
              (latitude - start[0]) * latitudeDelta) /
              segmentLength,
          ),
        )
      : 0;
    const projectedLongitude = start[1] + fraction * longitudeDelta;
    const projectedLatitude = start[0] + fraction * latitudeDelta;
    const distance =
      (longitude - projectedLongitude) ** 2 +
      (latitude - projectedLatitude) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      segmentIndex = index;
      segmentFraction = fraction;
    }
  }
  const start = route[segmentIndex];
  const end = route[segmentIndex + 1];
  if (!start || !end) return { flown: route, remaining: route };
  const splitPoint: AircraftRouteWaypoint = [
    start[0] + segmentFraction * (end[0] - start[0]),
    start[1] + segmentFraction * (end[1] - start[1]),
  ];
  return {
    flown: [...route.slice(0, segmentIndex + 1), splitPoint],
    remaining: [splitPoint, ...route.slice(segmentIndex + 1)],
  };
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isAircraftRouteSource(
  value: unknown,
): value is AircraftRouteSource {
  return value === AircraftRouteSource.FlightAware ||
    value === AircraftRouteSource.HexDb;
}

function isAircraftRouteEndpoint(
  value: unknown,
): value is AircraftRouteEndpoint {
  return isRecord(value) &&
    isOptionalString(value.iata) &&
    isOptionalString(value.icao) &&
    isOptionalString(value.name) &&
    isOptionalString(value.city) &&
    isOptionalString(value.gate);
}

export function isAircraftRouteWaypoint(
  value: unknown,
): value is AircraftRouteWaypoint {
  if (
    !Array.isArray(value) ||
    value.length !== AircraftRouteLimit.WaypointComponentCount
  ) {
    return false;
  }
  const latitude = value[0];
  const longitude = value[1];
  return typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= GeoLimit.MinLatitude &&
    latitude <= GeoLimit.MaxLatitude &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= GeoLimit.MinLongitude &&
    longitude <= GeoLimit.MaxLongitude;
}

export function isAircraftRoutePolyline(
  value: unknown,
): value is readonly AircraftRouteWaypoint[] {
  return Array.isArray(value) &&
    value.length >= AircraftRoutePolylineLimit.MinimumWaypointCount &&
    value.length <= AircraftRouteLimit.MaximumWaypointCount &&
    value.every(isAircraftRouteWaypoint);
}

function hasValidWaypoints(value: unknown): boolean {
  return value === undefined ||
    isAircraftRoutePolyline(value);
}

function hasValidDelays(value: unknown): boolean {
  return value === undefined ||
    (isRecord(value) &&
      isOptionalString(value.departure) &&
      isOptionalString(value.arrival));
}

export function isAircraftRoute(value: unknown): value is AircraftRoute {
  return isRecord(value) &&
    isAircraftRouteSource(value.source) &&
    isAircraftRouteEndpoint(value.origin) &&
    isAircraftRouteEndpoint(value.destination) &&
    isOptionalString(value.status) &&
    isOptionalFiniteNumber(value.departureTime) &&
    isOptionalFiniteNumber(value.arrivalTime) &&
    isOptionalBoolean(value.departureActual) &&
    isOptionalBoolean(value.arrivalActual) &&
    hasValidDelays(value.delays) &&
    isOptionalString(value.filedRoute) &&
    isOptionalFiniteNumber(value.filedAltitude) &&
    isOptionalFiniteNumber(value.filedSpeed) &&
    isOptionalFiniteNumber(value.distance) &&
    isOptionalString(value.airline) &&
    hasValidWaypoints(value.waypoints);
}

export function isAircraftDossierAircraft(
  value: unknown,
): value is AircraftDossierAircraft {
  return isRecord(value) &&
    isOptionalString(value.ICAOTypeCode) &&
    isOptionalString(value.Manufacturer) &&
    isOptionalString(value.ModeS) &&
    isOptionalString(value.OperatorFlagCode) &&
    isOptionalString(value.RegisteredOwners) &&
    isOptionalString(value.Registration) &&
    isOptionalString(value.Type);
}

export function isAircraftDossier(
  value: unknown,
): value is AircraftDossier {
  return isRecord(value) &&
    typeof value.icao24 === "string" &&
    isAircraftIcao24(value.icao24) &&
    (value.aircraft === null ||
      isAircraftDossierAircraft(value.aircraft)) &&
    (value.route === null || isAircraftRoute(value.route));
}

export function parseAircraftDossier(
  value: unknown,
): AircraftDossier | null {
  return isAircraftDossier(value) ? value : null;
}
