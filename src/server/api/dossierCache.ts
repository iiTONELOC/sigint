// ── Dossier cache ────────────────────────────────────────────────────
// Aircraft enrichment pipeline:
//   1. FlightAware scrape — live route, times, gates, delays, status
//      (extracts trackpollBootstrap JSON embedded in page HTML)
//   2. hexdb.io — aircraft info, route fallback, airport details
//   3. planespotters.net — aircraft photo (direct URL per ToS)
//
// All JSON responses cached in memory with TTL.

// ── Config ───────────────────────────────────────────────────────────

const HEXDB_BASE = "https://hexdb.io";
const PLANESPOTTERS_API = "https://api.planespotters.net/pub/photos/hex";
const FLIGHTAWARE_BASE = "https://www.flightaware.com/live/flight";
const CACHE_TTL_MS = 30 * 60_000;
const ROUTE_CACHE_TTL_MS = 5 * 60_000; // 5 min for live route data
const PHOTO_CACHE_TTL_MS = 12 * 60 * 60_000; // 12h (planespotters ToS: max 24h)
const FETCH_TIMEOUT_MS = 8_000;
const FA_FETCH_TIMEOUT_MS = 12_000; // FA pages are heavier

// ── Input sanitization ───────────────────────────────────────────────

const ICAO24_RE = /^[0-9a-f]{6}$/i;
const CALLSIGN_RE = /^[A-Z0-9]{2,10}$/i;
const ICAO_AIRPORT_RE = /^[A-Z]{4}$/i;

export function isValidIcao24(value: string): boolean {
  return ICAO24_RE.test(value);
}

export function isValidCallsign(value: string): boolean {
  return CALLSIGN_RE.test(value);
}

function sanitizeIcao24(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  return ICAO24_RE.test(cleaned) ? cleaned : null;
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

function setCached<T>(key: string, data: T, ttl: number = CACHE_TTL_MS): void {
  textCache.set(key, { data, expiresAt: Date.now() + ttl });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of textCache) {
    if (now > entry.expiresAt) textCache.delete(key);
  }
}, 10 * 60_000);

// ── Fetch with timeout ───────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── hexdb.io types ───────────────────────────────────────────────────

type HexDbAircraft = {
  ICAOTypeCode?: string;
  Manufacturer?: string;
  ModeS?: string;
  OperatorFlagCode?: string;
  RegisteredOwners?: string;
  Registration?: string;
  Type?: string;
};

type HexDbRoute = {
  flight?: string;
  route?: string;
  updatetime?: number;
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

// ── FlightAware types ────────────────────────────────────────────────

type FAairport = {
  iata?: string;
  icao?: string;
  friendlyName?: string;
  friendlyLocation?: string;
  gate?: string;
  terminal?: string;
  coord?: [number, number];
  delays?: { type: string; time: string; reason: string | null }[] | null;
};

type FAflightData = {
  origin: FAairport;
  destination: FAairport;
  flightStatus: string;
  aircraftType?: string;
  aircraftTypeFriendly?: string;
  takeoffTimes?: { scheduled?: number; estimated?: number; actual?: number };
  landingTimes?: { scheduled?: number; estimated?: number; actual?: number };
  gateDepartureTimes?: { scheduled?: number; estimated?: number; actual?: number };
  gateArrivalTimes?: { scheduled?: number; estimated?: number; actual?: number };
  flightPlan?: {
    speed?: number;
    altitude?: number;
    route?: string;
    directDistance?: number;
    plannedDistance?: number;
    ete?: number;
  };
  distance?: { elapsed?: number; remaining?: number; actual?: number };
  airline?: { fullName?: string; shortName?: string; icao?: string; iata?: string };
};

// ── Planespotters photo type ─────────────────────────────────────────

type PlaneSpottersPhoto = {
  id: string;
  thumbnail: { src: string; size: { width: number; height: number } };
  thumbnail_large: { src: string; size: { width: number; height: number } };
  link: string;
  photographer: string;
};

// ── Public API types ─────────────────────────────────────────────────

export type AircraftPhoto = {
  src: string;
  link: string;
  photographer: string;
  width: number;
  height: number;
};

export type LiveRoute = {
  source: "flightaware" | "hexdb";
  origin: {
    iata?: string;
    icao?: string;
    name?: string;
    city?: string;
    gate?: string;
  };
  destination: {
    iata?: string;
    icao?: string;
    name?: string;
    city?: string;
    gate?: string;
  };
  status?: string;
  departureTime?: number;
  arrivalTime?: number;
  departureActual?: boolean;
  arrivalActual?: boolean;
  delays?: { departure?: string; arrival?: string };
  filedRoute?: string;
  filedAltitude?: number;
  filedSpeed?: number;
  distance?: number;
  airline?: string;
};

export type AircraftDossier = {
  icao24: string;
  aircraft: HexDbAircraft | null;
  route: LiveRoute | null;
  photo: AircraftPhoto | null;
};

// ── FlightAware scraper ──────────────────────────────────────────────
// Extracts trackpollBootstrap JSON from page HTML. No DOM parsing needed.

const TRACKPOLL_RE = /var\s+trackpollBootstrap\s*=\s*(\{[\s\S]*?\});\s*(?:var\s|<\/script>)/;

async function scrapeFlightAware(callsign: string): Promise<LiveRoute | null> {
  const cacheKey = `fa:${callsign}`;
  const cached = getCached<LiveRoute | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const url = `${FLIGHTAWARE_BASE}/${encodeURIComponent(callsign)}`;
    const res = await fetchWithTimeout(url, FA_FETCH_TIMEOUT_MS);
    if (!res.ok) {
      setCached(cacheKey, false, ROUTE_CACHE_TTL_MS);
      return null;
    }

    const html = await res.text();
    const match = html.match(TRACKPOLL_RE);
    if (!match?.[1]) {
      setCached(cacheKey, false, ROUTE_CACHE_TTL_MS);
      return null;
    }

    const bootstrap = JSON.parse(match[1]);
    const flights = bootstrap?.flights;
    if (!flights) {
      setCached(cacheKey, false, ROUTE_CACHE_TTL_MS);
      return null;
    }

    // Get the first (current/most recent) flight entry
    const flightKey = Object.keys(flights)[0];
    if (!flightKey) {
      setCached(cacheKey, false, ROUTE_CACHE_TTL_MS);
      return null;
    }

    const fd = flights[flightKey] as FAflightData;
    if (!fd?.origin?.iata && !fd?.origin?.icao) {
      setCached(cacheKey, false, ROUTE_CACHE_TTL_MS);
      return null;
    }

    // Determine best departure/arrival times
    const depTime = fd.gateDepartureTimes?.actual
      ?? fd.takeoffTimes?.actual
      ?? fd.gateDepartureTimes?.estimated
      ?? fd.takeoffTimes?.estimated
      ?? fd.takeoffTimes?.scheduled;

    const arrTime = fd.gateArrivalTimes?.actual
      ?? fd.landingTimes?.actual
      ?? fd.gateArrivalTimes?.estimated
      ?? fd.landingTimes?.estimated
      ?? fd.landingTimes?.scheduled;

    const depIsActual = !!(fd.gateDepartureTimes?.actual ?? fd.takeoffTimes?.actual);
    const arrIsActual = !!(fd.gateArrivalTimes?.actual ?? fd.landingTimes?.actual);

    // Delay info
    let depDelay: string | undefined;
    let arrDelay: string | undefined;
    if (fd.takeoffTimes?.scheduled && fd.takeoffTimes?.actual) {
      const diff = fd.takeoffTimes.actual - fd.takeoffTimes.scheduled;
      if (diff > 300) depDelay = formatDelay(diff);
    }
    if (fd.landingTimes?.scheduled && fd.landingTimes?.actual) {
      const diff = fd.landingTimes.actual - fd.landingTimes.scheduled;
      if (diff > 300) arrDelay = formatDelay(diff);
    }

    const route: LiveRoute = {
      source: "flightaware",
      origin: {
        iata: fd.origin.iata,
        icao: fd.origin.icao,
        name: fd.origin.friendlyName,
        city: fd.origin.friendlyLocation,
        gate: fd.origin.gate ?? undefined,
      },
      destination: {
        iata: fd.destination.iata,
        icao: fd.destination.icao,
        name: fd.destination.friendlyName,
        city: fd.destination.friendlyLocation,
        gate: fd.destination.gate ?? undefined,
      },
      status: fd.flightStatus || undefined,
      departureTime: depTime,
      arrivalTime: arrTime,
      departureActual: depIsActual,
      arrivalActual: arrIsActual,
      delays: (depDelay || arrDelay) ? { departure: depDelay, arrival: arrDelay } : undefined,
      filedRoute: fd.flightPlan?.route || undefined,
      filedAltitude: fd.flightPlan?.altitude ? fd.flightPlan.altitude * 100 : undefined,
      filedSpeed: fd.flightPlan?.speed || undefined,
      distance: fd.flightPlan?.directDistance || fd.distance?.actual || undefined,
      airline: fd.airline?.shortName || fd.airline?.fullName || undefined,
    };

    setCached(cacheKey, route, ROUTE_CACHE_TTL_MS);
    return route;
  } catch {
    setCached(cacheKey, false, 2 * 60_000); // 2 min on error
    return null;
  }
}

function formatDelay(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m late`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m late` : `${hrs}h late`;
}

// ── hexdb.io fetch functions ─────────────────────────────────────────

async function fetchAircraftInfo(hex: string): Promise<HexDbAircraft | null> {
  const cacheKey = `aircraft:${hex}`;
  const cached = getCached<HexDbAircraft>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`${HEXDB_BASE}/api/v1/aircraft/${hex}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === "404") return null;
    setCached(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

async function fetchHexDbRoute(callsign: string): Promise<LiveRoute | null> {
  const cacheKey = `hexroute:${callsign}`;
  const cached = getCached<LiveRoute | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    const res = await fetchWithTimeout(`${HEXDB_BASE}/api/v1/route/icao/${callsign}`);
    if (!res.ok) {
      setCached(cacheKey, false, CACHE_TTL_MS);
      return null;
    }
    const data = await res.json() as HexDbRoute;
    if (data?.status === "404" || !data?.route) {
      setCached(cacheKey, false, CACHE_TTL_MS);
      return null;
    }

    const parts = data.route.split("-");
    const originIcao = parts[0] ? sanitizeIcaoAirport(parts[0]) : null;
    const destIcao = parts[1] ? sanitizeIcaoAirport(parts[1]) : null;

    // Fetch airport details in parallel
    const [originAirport, destAirport] = await Promise.all([
      originIcao ? fetchAirport(originIcao) : Promise.resolve(null),
      destIcao ? fetchAirport(destIcao) : Promise.resolve(null),
    ]);

    const route: LiveRoute = {
      source: "hexdb",
      origin: {
        iata: originAirport?.iata,
        icao: originIcao ?? undefined,
        name: originAirport?.airport,
        city: originAirport ? `${originAirport.airport}${originAirport.country_code ? ` (${originAirport.country_code})` : ""}` : undefined,
      },
      destination: {
        iata: destAirport?.iata,
        icao: destIcao ?? undefined,
        name: destAirport?.airport,
        city: destAirport ? `${destAirport.airport}${destAirport.country_code ? ` (${destAirport.country_code})` : ""}` : undefined,
      },
    };

    setCached(cacheKey, route, CACHE_TTL_MS);
    return route;
  } catch {
    setCached(cacheKey, false, 5 * 60_000);
    return null;
  }
}

async function fetchAirport(icao: string): Promise<HexDbAirport | null> {
  const cacheKey = `airport:${icao}`;
  const cached = getCached<HexDbAirport>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`${HEXDB_BASE}/api/v1/airport/icao/${icao}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status === "404") return null;
    setCached(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

// ── Planespotters photo ──────────────────────────────────────────────

async function fetchPhoto(hex: string, reg?: string, typeCode?: string): Promise<AircraftPhoto | null> {
  const cacheKey = `photo:${hex}`;
  const cached = getCached<AircraftPhoto | false>(cacheKey);
  if (cached !== null) return cached || null;

  try {
    let url = `${PLANESPOTTERS_API}/${hex.toUpperCase()}`;
    const params: string[] = [];
    if (reg) params.push(`reg=${encodeURIComponent(reg)}`);
    if (typeCode) params.push(`icaoType=${encodeURIComponent(typeCode)}`);
    if (params.length > 0) url += `?${params.join("&")}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      setCached(cacheKey, false, PHOTO_CACHE_TTL_MS);
      return null;
    }

    const data = (await res.json()) as { photos?: PlaneSpottersPhoto[] };
    const first = data.photos?.[0];
    if (!first) {
      setCached(cacheKey, false, PHOTO_CACHE_TTL_MS);
      return null;
    }

    const thumb = first.thumbnail_large ?? first.thumbnail;
    const result: AircraftPhoto = {
      src: thumb.src,
      link: first.link,
      photographer: first.photographer,
      width: thumb.size.width,
      height: thumb.size.height,
    };

    setCached(cacheKey, result, PHOTO_CACHE_TTL_MS);
    return result;
  } catch {
    setCached(cacheKey, false, 5 * 60_000);
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

  // Fetch aircraft info + photo in parallel with route
  const [aircraft, route, photo] = await Promise.all([
    fetchAircraftInfo(hex),
    callsign ? fetchRoute(callsign) : Promise.resolve(null),
    fetchPhoto(hex).then(async (p) => {
      // If no photo by hex, try by registration from aircraft info
      if (p) return p;
      const ac = await fetchAircraftInfo(hex);
      if (ac?.Registration) {
        return fetchPhoto(hex, ac.Registration, ac.ICAOTypeCode);
      }
      return null;
    }),
  ]);

  const dossier: AircraftDossier = {
    icao24: hex,
    aircraft,
    route,
    photo,
  };

  // Cache dossier for shorter TTL if we have live FA data
  const ttl = route?.source === "flightaware" ? ROUTE_CACHE_TTL_MS : CACHE_TTL_MS;
  setCached(cacheKey, dossier, ttl);
  return dossier;
}

// ── Route fetch (FA primary, hexdb fallback) ─────────────────────────

async function fetchRoute(callsign: string): Promise<LiveRoute | null> {
  // Try FlightAware first — live data
  const faRoute = await scrapeFlightAware(callsign);
  if (faRoute) return faRoute;

  // Fall back to hexdb.io — stale but better than nothing
  return fetchHexDbRoute(callsign);
}

// ── Airport lookup (standalone) ──────────────────────────────────────

export async function getAirportInfo(icaoRaw: string): Promise<HexDbAirport | null> {
  const icao = sanitizeIcaoAirport(icaoRaw);
  if (!icao) return null;
  return fetchAirport(icao);
}
