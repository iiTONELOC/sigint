import {
  fetchWithTimeout,
  FETCH_TIMEOUT_STANDARD_MS,
  FETCH_TIMEOUT_FLIGHTAWARE_MS,
} from "../lib/fetchWithTimeout";
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

enum AircraftDossierProviderEndpoint {
  FlightAware = "https://www.flightaware.com/live/flight",
  HexDb = "https://hexdb.io",
}

enum AircraftDossierCacheTime {
  StandardMs = 30 * MS_PER_MINUTE, // NOSONAR: shared time units own conversion.
  FiveMinutesMs = 5 * MS_PER_MINUTE, // NOSONAR: shared time units own conversion.
  FailureMs = 2 * MS_PER_MINUTE, // NOSONAR: shared time units own conversion.
  SweepMs = 10 * MS_PER_MINUTE, // NOSONAR: shared time units own conversion.
}

enum AircraftDossierDelay {
  MinimumLateSeconds = 300,
}

enum HexDbResponseStatus {
  NotFound = "404",
}

// ── Input sanitization ───────────────────────────────────────────────

const CALLSIGN_RE = /^[A-Z0-9]{2,10}$/i;
const ICAO_AIRPORT_RE = /^[A-Z]{4}$/i;

export function isValidIcao24(value: string): boolean {
  return isAircraftIcao24(value);
}

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

type CacheEntry<T> = { data: T; expiresAt: number };

const textCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = textCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    textCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(
  key: string,
  data: T,
  ttl: number = AircraftDossierCacheTime.StandardMs,
): void {
  textCache.set(key, { data, expiresAt: Date.now() + ttl });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of textCache) {
    if (now > entry.expiresAt) textCache.delete(key);
  }
}, AircraftDossierCacheTime.SweepMs);

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

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined ||
    (typeof value === "number" && Number.isFinite(value));
}

function isHexDbRoute(value: unknown): value is HexDbRoute {
  return isRecord(value) &&
    isOptionalString(value.flight) &&
    isOptionalString(value.route) &&
    isOptionalNumber(value.updatetime) &&
    isOptionalString(value.status);
}

function isHexDbAirport(value: unknown): value is HexDbAirport {
  return isRecord(value) &&
    isOptionalString(value.airport) &&
    isOptionalString(value.country_code) &&
    isOptionalString(value.iata) &&
    isOptionalString(value.icao) &&
    isOptionalNumber(value.latitude) &&
    isOptionalNumber(value.longitude) &&
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
    ?? flight.takeoffTimes?.scheduled;
  const arrivalTime = flight.gateArrivalTimes?.actual
    ?? flight.landingTimes?.actual
    ?? flight.gateArrivalTimes?.estimated
    ?? flight.landingTimes?.estimated
    ?? flight.landingTimes?.scheduled;
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

function cacheMissingFlightAwareRoute(
  cacheKey: string,
  duration: AircraftDossierCacheTime,
): null {
  setCached(cacheKey, false, duration);
  return null;
}

async function scrapeFlightAware(
  callsign: string,
): Promise<AircraftRoute | null> {
  const cacheKey = `fa:${callsign}`;
  const cached = getCached<AircraftRoute | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const url =
      `${AircraftDossierProviderEndpoint.FlightAware}/${encodeURIComponent(callsign)}`;
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_FLIGHTAWARE_MS);
    if (!res.ok) {
      return cacheMissingFlightAwareRoute(
        cacheKey,
        AircraftDossierCacheTime.FiveMinutesMs,
      );
    }

    const html = await res.text();
    const flight = parseFlightAwareData(html);
    if (!flight) {
      return cacheMissingFlightAwareRoute(
        cacheKey,
        AircraftDossierCacheTime.FiveMinutesMs,
      );
    }

    const route = flightAwareRoute(flight);
    setCached(cacheKey, route, AircraftDossierCacheTime.FiveMinutesMs);
    return route;
  } catch {
    return cacheMissingFlightAwareRoute(
      cacheKey,
      AircraftDossierCacheTime.FailureMs,
    );
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
      `${AircraftDossierProviderEndpoint.HexDb}/api/v1/aircraft/${hex}`,
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
    setCached(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

function airportCity(airport: HexDbAirport | null): string | undefined {
  if (!airport) return undefined;
  const country = airport.country_code
    ? ` (${airport.country_code})`
    : "";
  return `${airport.airport}${country}`;
}

async function fetchHexDbRoute(
  callsign: string,
): Promise<AircraftRoute | null> {
  const cacheKey = `hexroute:${callsign}`;
  const cached = getCached<AircraftRoute | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const res = await fetchWithTimeout(
      `${AircraftDossierProviderEndpoint.HexDb}/api/v1/route/icao/${callsign}`,
      FETCH_TIMEOUT_STANDARD_MS,
    );
    if (!res.ok) {
      setCached(
        cacheKey,
        false,
        AircraftDossierCacheTime.StandardMs,
      );
      return null;
    }
    const value: unknown = await res.json();
    if (
      !isHexDbRoute(value) ||
      value.status === HexDbResponseStatus.NotFound ||
      !value.route
    ) {
      setCached(
        cacheKey,
        false,
        AircraftDossierCacheTime.StandardMs,
      );
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
    };

    setCached(
      cacheKey,
      route,
      AircraftDossierCacheTime.StandardMs,
    );
    return route;
  } catch {
    setCached(
      cacheKey,
      false,
      AircraftDossierCacheTime.FiveMinutesMs,
    );
    return null;
  }
}

async function fetchAirport(icao: string): Promise<HexDbAirport | null> {
  const cacheKey = `airport:${icao}`;
  const cached = getCached<HexDbAirport>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `${AircraftDossierProviderEndpoint.HexDb}/api/v1/airport/icao/${icao}`,
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

export async function getAircraftDossier(icao24Raw: string, callsignRaw?: string): Promise<AircraftDossier | null> {
  const hex = sanitizeIcao24(icao24Raw);
  if (!hex) return null;

  const cacheKey = `dossier:${hex}:${callsignRaw ?? ""}`;
  const cached = getCached<AircraftDossier>(cacheKey);
  if (cached) return cached;

  const callsign = callsignRaw ? sanitizeCallsign(callsignRaw) : null;

  const [aircraft, route] = await Promise.all([
    fetchAircraftInfo(hex),
    callsign ? fetchRoute(callsign) : Promise.resolve(null),
  ]);

  const dossier: AircraftDossier = {
    icao24: hex,
    aircraft,
    route,
  };

  // Cache dossier for shorter TTL if we have live FA data
  const ttl = route?.source === AircraftRouteSource.FlightAware
    ? AircraftDossierCacheTime.FiveMinutesMs
    : AircraftDossierCacheTime.StandardMs;
  setCached(cacheKey, dossier, ttl);
  return dossier;
}

// ── Route fetch (FA primary, hexdb fallback) ─────────────────────────

async function fetchRoute(
  callsign: string,
): Promise<AircraftRoute | null> {
  const faRoute = await scrapeFlightAware(callsign);
  if (faRoute) return faRoute;

  return fetchHexDbRoute(callsign);
}

// ── Airport lookup (standalone) ──────────────────────────────────────

export async function getAirportInfo(icaoRaw: string): Promise<HexDbAirport | null> {
  const icao = sanitizeIcaoAirport(icaoRaw);
  if (!icao) return null;
  return fetchAirport(icao);
}
