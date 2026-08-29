import {
  fetchWithTimeout,
  FETCH_TIMEOUT_FLIGHTAWARE_MS,
  FETCH_TIMEOUT_STANDARD_MS,
} from "../lib/fetchWithTimeout";
import {
  lookupAircraftMetadata,
  type AircraftMetadataRecord,
} from "./aircraftEnrichment";
import {
  AircraftRouteLimit,
  AircraftRoutePolylineLimit,
  AircraftRouteSource,
  isAircraftDossierAircraft,
  isAircraftIcao24,
  type AircraftDossier,
  type AircraftDossierAircraft,
  type AircraftRoute,
  type AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import { GeoMeasurement, isRecord } from "@shared/geo";
import {
  MINUTES_PER_HOUR,
  MS_PER_MINUTE,
  SECONDS_PER_MINUTE,
} from "@shared/time";
import { isOptionalFiniteNumber } from "@shared/types/numbers";

const AIRCRAFT_DOSSIER_PROVIDER_ENDPOINTS = {
  [AircraftRouteSource.FlightAware]:
    "https://www.flightaware.com/live/flight",
  [AircraftRouteSource.HexDb]: "https://hexdb.io",
} satisfies Readonly<Record<AircraftRouteSource, string>>;

const AIRCRAFT_DOSSIER_CACHE_TIME = Object.freeze({
  enrichedMs: 5 * MS_PER_MINUTE,
  standardMs: 30 * MS_PER_MINUTE,
  sweepMs: 10 * MS_PER_MINUTE,
});

enum AircraftDossierDelay {
  MinimumLateSeconds = 300,
}

enum HexDbResponseStatus {
  NotFound = "404",
}

// ── Input sanitization ───────────────────────────────────────────────

const CALLSIGN_RE = /^[A-Z0-9]{2,10}$/i;
const ICAO_AIRPORT_RE = /^[A-Z]{4}$/i;

export function isValidCallsign(value: string): boolean {
  return CALLSIGN_RE.test(value);
}

function sanitizeIcao24(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  return isAircraftIcao24(cleaned) ? cleaned : null;
}

function sanitizeCallsign(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase();
  return CALLSIGN_RE.test(cleaned) ? cleaned : null;
}

function sanitizeIcaoAirport(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase();
  return ICAO_AIRPORT_RE.test(cleaned) ? cleaned : null;
}

// ── Cache ────────────────────────────────────────────────────────────

type CacheEntry<T> = {
  data: T;
  receivedAt: number;
  expiresAt: number;
};

const textCache = new Map<string, CacheEntry<unknown>>();

function getCachedEntry<T>(key: string): CacheEntry<T> | null {
  const entry = textCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    textCache.delete(key);
    return null;
  }
  return entry as CacheEntry<T>;
}

function getCached<T>(key: string): T | null {
  return getCachedEntry<T>(key)?.data ?? null;
}

function setCached<T>(
  key: string,
  data: T,
  ttl: number = AIRCRAFT_DOSSIER_CACHE_TIME.standardMs,
): void {
  const receivedAt = Date.now();
  textCache.set(key, {
    data,
    receivedAt,
    expiresAt: receivedAt + ttl,
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of textCache) {
    if (now > entry.expiresAt) textCache.delete(key);
  }
}, AIRCRAFT_DOSSIER_CACHE_TIME.sweepMs);

// ── hexdb.io types ───────────────────────────────────────────────────

type HexDbRoute = {
  flight?: string;
  route?: string;
  updatetime?: number;
  // hexdb returns a status string (e.g. "404") when a route isn't found.
  status?: string;
};

type HexDbAirport = {
  airport?: string;
  country_code?: string;
  iata?: string;
  icao?: string;
  latitude?: number;
  longitude?: number;
  region_name?: string;
};

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isHexDbRoute(value: unknown): value is HexDbRoute {
  return isRecord(value) &&
    isOptionalString(value.flight) &&
    isOptionalString(value.route) &&
    isOptionalFiniteNumber(value.updatetime) &&
    isOptionalString(value.status);
}

function isHexDbAirport(value: unknown): value is HexDbAirport {
  return isRecord(value) &&
    isOptionalString(value.airport) &&
    isOptionalString(value.country_code) &&
    isOptionalString(value.iata) &&
    isOptionalString(value.icao) &&
    isOptionalFiniteNumber(value.latitude) &&
    isOptionalFiniteNumber(value.longitude) &&
    isOptionalString(value.region_name);
}

// ── FlightAware types ────────────────────────────────────────────────

type FAflightTimes = {
  scheduled?: number | null;
  estimated?: number | null;
  actual?: number | null;
};

type FAairport = {
  iata?: string | null;
  icao?: string | null;
  friendlyName?: string | null;
  friendlyLocation?: string | null;
  gate?: string | null;
};

type FAflightData = {
  origin: FAairport;
  destination: FAairport;
  flightStatus?: string | null;
  takeoffTimes?: FAflightTimes | null;
  landingTimes?: FAflightTimes | null;
  gateDepartureTimes?: FAflightTimes | null;
  gateArrivalTimes?: FAflightTimes | null;
  flightPlan?: {
    speed?: number | null;
    altitude?: number | null;
    route?: string | null;
    directDistance?: number | null;
    plannedDistance?: number | null;
    ete?: number | null;
  } | null;
  distance?: {
    elapsed?: number | null;
    remaining?: number | null;
    actual?: number | null;
  } | null;
  airline?: {
    fullName?: string | null;
    shortName?: string | null;
    icao?: string | null;
    iata?: string | null;
  } | null;
  waypoints?: readonly unknown[] | null;
};

function isOptionalFlightAwareString(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    typeof value === "string";
}

function isOptionalFlightAwareNumber(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value));
}

function isFlightTimeSet(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (isRecord(value) &&
      isOptionalFlightAwareNumber(value.scheduled) &&
      isOptionalFlightAwareNumber(value.estimated) &&
      isOptionalFlightAwareNumber(value.actual));
}

function isFlightAwareAirport(value: unknown): value is FAairport {
  return isRecord(value) &&
    isOptionalFlightAwareString(value.iata) &&
    isOptionalFlightAwareString(value.icao) &&
    isOptionalFlightAwareString(value.friendlyName) &&
    isOptionalFlightAwareString(value.friendlyLocation) &&
    isOptionalFlightAwareString(value.gate);
}

function isFlightPlan(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (isRecord(value) &&
      isOptionalFlightAwareNumber(value.speed) &&
      isOptionalFlightAwareNumber(value.altitude) &&
      isOptionalFlightAwareString(value.route) &&
      isOptionalFlightAwareNumber(value.directDistance) &&
      isOptionalFlightAwareNumber(value.plannedDistance) &&
      isOptionalFlightAwareNumber(value.ete));
}

function isFlightDistance(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (isRecord(value) &&
      isOptionalFlightAwareNumber(value.elapsed) &&
      isOptionalFlightAwareNumber(value.remaining) &&
      isOptionalFlightAwareNumber(value.actual));
}

function isFlightAirline(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (isRecord(value) &&
      isOptionalFlightAwareString(value.fullName) &&
      isOptionalFlightAwareString(value.shortName) &&
      isOptionalFlightAwareString(value.icao) &&
      isOptionalFlightAwareString(value.iata));
}

function isFlightAwareData(value: unknown): value is FAflightData {
  return isRecord(value) &&
    isFlightAwareAirport(value.origin) &&
    isFlightAwareAirport(value.destination) &&
    isOptionalString(value.flightStatus) &&
    isFlightTimeSet(value.takeoffTimes) &&
    isFlightTimeSet(value.landingTimes) &&
    isFlightTimeSet(value.gateDepartureTimes) &&
    isFlightTimeSet(value.gateArrivalTimes) &&
    isFlightPlan(value.flightPlan) &&
    isFlightDistance(value.distance) &&
    isFlightAirline(value.airline) &&
    (
      value.waypoints === undefined ||
      value.waypoints === null ||
      Array.isArray(value.waypoints)
    );
}

// ── FlightAware scraper ──────────────────────────────────────────────
// Extracts trackpollBootstrap JSON from page HTML. No DOM parsing needed.

const TRACKPOLL_RE = /var\s+trackpollBootstrap\s*=\s*(\{[\s\S]*?\});\s*(?:var\s|<\/script>)/;

function parseFlightAwareData(html: string): FAflightData | null {
  const match = TRACKPOLL_RE.exec(html);
  if (!match?.[1]) return null;

  const bootstrap: unknown = JSON.parse(match[1]);
  if (!isRecord(bootstrap) || !isRecord(bootstrap.flights)) return null;

  const [flight] = Object.values(bootstrap.flights);
  if (!isFlightAwareData(flight)) return null;
  if (!flight.origin.iata && !flight.origin.icao) return null;
  return flight;
}

function flightAwareWaypoints(
  flight: FAflightData,
): AircraftRouteWaypoint[] | undefined {
  if (!Array.isArray(flight.waypoints)) return undefined;

  const waypoints = flight.waypoints
    .filter(
      (point): point is [number, number] =>
        Array.isArray(point) &&
        point.length >= AircraftRoutePolylineLimit.MinimumWaypointCount &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
    .slice(0, AircraftRouteLimit.MaximumWaypointCount)
    .map(
      ([longitude, latitude]): AircraftRouteWaypoint => [
        latitude,
        longitude,
      ],
    );

  return waypoints.length >=
    AircraftRoutePolylineLimit.MinimumWaypointCount
    ? waypoints
    : undefined;
}

function flightDelay(
  scheduled: number | null | undefined,
  actual: number | null | undefined,
): string | undefined {
  if (scheduled == null || actual == null) return undefined;
  const difference = actual - scheduled;
  return difference > AircraftDossierDelay.MinimumLateSeconds
    ? formatDelay(difference)
    : undefined;
}

function flightAwareRoute(flight: FAflightData): AircraftRoute {
  const departureTime = flight.gateDepartureTimes?.actual
    ?? flight.takeoffTimes?.actual
    ?? flight.gateDepartureTimes?.estimated
    ?? flight.takeoffTimes?.estimated
    ?? flight.takeoffTimes?.scheduled
    ?? undefined;
  const arrivalTime = flight.gateArrivalTimes?.actual
    ?? flight.landingTimes?.actual
    ?? flight.gateArrivalTimes?.estimated
    ?? flight.landingTimes?.estimated
    ?? flight.landingTimes?.scheduled
    ?? undefined;
  const departureDelay = flightDelay(
    flight.takeoffTimes?.scheduled,
    flight.takeoffTimes?.actual,
  );
  const arrivalDelay = flightDelay(
    flight.landingTimes?.scheduled,
    flight.landingTimes?.actual,
  );
  const delays = departureDelay || arrivalDelay
    ? { departure: departureDelay, arrival: arrivalDelay }
    : undefined;

  return {
    source: AircraftRouteSource.FlightAware,
    origin: {
      iata: flight.origin.iata ?? undefined,
      icao: flight.origin.icao ?? undefined,
      name: flight.origin.friendlyName ?? undefined,
      city: flight.origin.friendlyLocation ?? undefined,
      gate: flight.origin.gate ?? undefined,
    },
    destination: {
      iata: flight.destination.iata ?? undefined,
      icao: flight.destination.icao ?? undefined,
      name: flight.destination.friendlyName ?? undefined,
      city: flight.destination.friendlyLocation ?? undefined,
      gate: flight.destination.gate ?? undefined,
    },
    status: flight.flightStatus || undefined,
    departureTime,
    arrivalTime,
    departureActual: Boolean(
      flight.gateDepartureTimes?.actual ??
      flight.takeoffTimes?.actual,
    ),
    arrivalActual: Boolean(
      flight.gateArrivalTimes?.actual ??
      flight.landingTimes?.actual,
    ),
    delays,
    filedRoute: flight.flightPlan?.route || undefined,
    filedAltitude: flight.flightPlan?.altitude
      ? flight.flightPlan.altitude * GeoMeasurement.FeetPerFlightLevel
      : undefined,
    filedSpeed: flight.flightPlan?.speed || undefined,
    distance:
      flight.flightPlan?.plannedDistance ||
      flight.flightPlan?.directDistance ||
      flight.distance?.actual ||
      undefined,
    airline:
      flight.airline?.shortName ||
      flight.airline?.fullName ||
      undefined,
    waypoints: flightAwareWaypoints(flight),
  };
}

async function scrapeFlightAware(
  callsign: string,
): Promise<AircraftRoute | null> {
  const cacheKey = `fa:${callsign}`;
  const cached = getCached<AircraftRoute>(cacheKey);
  if (cached) return cached;

  try {
    const url =
      `${AIRCRAFT_DOSSIER_PROVIDER_ENDPOINTS[AircraftRouteSource.FlightAware]}/${encodeURIComponent(callsign)}`;
    const res = await fetchWithTimeout(
      url,
      FETCH_TIMEOUT_FLIGHTAWARE_MS,
    );
    if (!res.ok) return null;

    const html = await res.text();
    const flight = parseFlightAwareData(html);
    if (!flight) return null;

    const route = flightAwareRoute(flight);
    setCached(cacheKey, route, AIRCRAFT_DOSSIER_CACHE_TIME.enrichedMs);
    return route;
  } catch {
    return null;
  }
}

function formatDelay(seconds: number): string {
  const mins = Math.round(seconds / SECONDS_PER_MINUTE);
  if (mins < MINUTES_PER_HOUR) return `${mins}m late`;
  const hrs = Math.floor(mins / MINUTES_PER_HOUR);
  const rem = mins % MINUTES_PER_HOUR;
  return rem > 0 ? `${hrs}h ${rem}m late` : `${hrs}h late`;
}

// ── hexdb.io fetch functions ─────────────────────────────────────────

async function fetchAircraftInfo(
  hex: string,
): Promise<AircraftDossierAircraft | null> {
  const cacheKey = `aircraft:${hex}`;
  const cached = getCached<AircraftDossierAircraft>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `${AIRCRAFT_DOSSIER_PROVIDER_ENDPOINTS[AircraftRouteSource.HexDb]}/api/v1/aircraft/${hex}`,
      FETCH_TIMEOUT_STANDARD_MS,
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      isRecord(data) &&
      data.status === HexDbResponseStatus.NotFound
    ) {
      return null;
    }
    if (!isAircraftDossierAircraft(data)) return null;
    setCached(cacheKey, data, AIRCRAFT_DOSSIER_CACHE_TIME.enrichedMs);
    return data;
  } catch {
    return null;
  }
}

function dossierAircraftFromMetadata(
  metadata: AircraftMetadataRecord | null,
): AircraftDossierAircraft | null {
  if (!metadata) return null;
  return {
    ICAOTypeCode: metadata.typecode,
    Manufacturer: metadata.manufacturerName,
    ModeS: metadata.icao24.toUpperCase(),
    OperatorFlagCode: metadata.operatorIcao,
    RegisteredOwners: metadata.operator,
    Registration: metadata.registration,
    Type: metadata.model ?? metadata.resolvedType,
  };
}

async function fetchLocalAircraftInfo(
  hex: string,
): Promise<AircraftDossierAircraft | null> {
  return dossierAircraftFromMetadata(
    await lookupAircraftMetadata(hex),
  );
}

function airportCity(airport: HexDbAirport | null): string | undefined {
  if (!airport) return undefined;
  const country = airport.country_code
    ? ` (${airport.country_code})`
    : "";
  return `${airport.airport}${country}`;
}

function airportWaypoint(
  airport: HexDbAirport | null,
): AircraftRouteWaypoint | undefined {
  if (
    airport?.latitude === undefined ||
    airport.longitude === undefined
  ) {
    return undefined;
  }
  return [airport.latitude, airport.longitude];
}

async function fetchHexDbRoute(
  callsign: string,
): Promise<AircraftRoute | null> {
  const cacheKey = `hexroute:${callsign}`;
  const cached = getCached<AircraftRoute>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `${AIRCRAFT_DOSSIER_PROVIDER_ENDPOINTS[AircraftRouteSource.HexDb]}/api/v1/route/icao/${callsign}`,
      FETCH_TIMEOUT_STANDARD_MS,
    );
    if (!res.ok) return null;
    const value: unknown = await res.json();
    if (
      !isHexDbRoute(value) ||
      value.status === HexDbResponseStatus.NotFound ||
      !value.route
    ) {
      return null;
    }
    const routeText = value.route;

    const parts = routeText.split("-");
    const originIcao = parts[0] ? sanitizeIcaoAirport(parts[0]) : null;
    const destIcao = parts[1] ? sanitizeIcaoAirport(parts[1]) : null;

    // Fetch airport details in parallel
    const [originAirport, destAirport] = await Promise.all([
      originIcao ? fetchAirport(originIcao) : Promise.resolve(null),
      destIcao ? fetchAirport(destIcao) : Promise.resolve(null),
    ]);
    const originWaypoint = airportWaypoint(originAirport);
    const destinationWaypoint = airportWaypoint(destAirport);

    const route: AircraftRoute = {
      source: AircraftRouteSource.HexDb,
      origin: {
        iata: originAirport?.iata,
        icao: originIcao ?? undefined,
        name: originAirport?.airport,
        city: airportCity(originAirport),
      },
      destination: {
        iata: destAirport?.iata,
        icao: destIcao ?? undefined,
        name: destAirport?.airport,
        city: airportCity(destAirport),
      },
      waypoints:
        originWaypoint && destinationWaypoint
          ? [originWaypoint, destinationWaypoint]
          : undefined,
    };

    setCached(
      cacheKey,
      route,
      AIRCRAFT_DOSSIER_CACHE_TIME.enrichedMs,
    );
    return route;
  } catch {
    return null;
  }
}

async function fetchAirport(icao: string): Promise<HexDbAirport | null> {
  const cacheKey = `airport:${icao}`;
  const cached = getCached<HexDbAirport>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `${AIRCRAFT_DOSSIER_PROVIDER_ENDPOINTS[AircraftRouteSource.HexDb]}/api/v1/airport/icao/${icao}`,
      FETCH_TIMEOUT_STANDARD_MS,
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      isRecord(data) &&
      data.status === HexDbResponseStatus.NotFound
    ) {
      return null;
    }
    if (!isHexDbAirport(data)) return null;
    setCached(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

// ── Composite dossier fetch ──────────────────────────────────────────

function hasAircraftDossierEnrichment(
  aircraft: AircraftDossierAircraft | null,
  route: AircraftRoute | null,
): boolean {
  return aircraft !== null || route !== null;
}

export async function getAircraftDossier(
  icao24Raw: string,
  callsignRaw?: string,
): Promise<AircraftDossier | null> {
  const hex = sanitizeIcao24(icao24Raw);
  if (!hex) return null;

  const callsign = callsignRaw ? sanitizeCallsign(callsignRaw) : null;
  const cacheKey = `dossier:${hex}:${callsign ?? ""}`;
  const cachedEntry = getCachedEntry<AircraftDossier>(cacheKey);
  const fallbackEntry = cachedEntry &&
      hasAircraftDossierEnrichment(
        cachedEntry.data.aircraft,
        cachedEntry.data.route,
      )
    ? cachedEntry
    : null;
  if (
    fallbackEntry &&
    Date.now() - fallbackEntry.receivedAt <=
      AIRCRAFT_DOSSIER_CACHE_TIME.enrichedMs
  ) {
    return fallbackEntry.data;
  }

  const hexDbAircraft = fetchAircraftInfo(hex);
  const hexDbRoute = callsign
    ? fetchHexDbRoute(callsign)
    : Promise.resolve(null);

  const [aircraft, route] = await Promise.all([
    fetchLocalAircraftInfo(hex),
    callsign ? fetchRoute(callsign) : Promise.resolve(null),
  ]);

  const dossier: AircraftDossier = {
    icao24: hex,
    aircraft: aircraft ?? fallbackEntry?.data.aircraft ?? null,
    route: route ?? fallbackEntry?.data.route ?? null,
  };

  if (hasAircraftDossierEnrichment(aircraft, route)) {
    setCached(cacheKey, dossier, AIRCRAFT_DOSSIER_CACHE_TIME.standardMs);
  }
  void refreshHexDbDossier(
    cacheKey,
    dossier,
    hexDbAircraft,
    hexDbRoute,
  );
  return dossier;
}

async function refreshHexDbDossier(
  cacheKey: string,
  foreground: AircraftDossier,
  aircraftRequest: Promise<AircraftDossierAircraft | null>,
  routeRequest: Promise<AircraftRoute | null>,
): Promise<void> {
  const [aircraft, route] = await Promise.all([
    aircraftRequest,
    routeRequest,
  ]);
  if (!aircraft && !route) return;
  const cached = getCachedEntry<AircraftDossier>(cacheKey)?.data ?? foreground;
  const enriched: AircraftDossier = {
    ...cached,
    aircraft: aircraft ?? cached.aircraft,
    route: cached.route ?? route,
  };
  setCached(
    cacheKey,
    enriched,
    AIRCRAFT_DOSSIER_CACHE_TIME.standardMs,
  );
}

// ── Foreground route fetch ───────────────────────────────────────────

async function fetchRoute(
  callsign: string,
): Promise<AircraftRoute | null> {
  return scrapeFlightAware(callsign);
}
