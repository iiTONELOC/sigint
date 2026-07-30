import { cacheGet, cacheSet } from "@/lib/cache/storageService";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { MS_PER_MINUTE } from "@shared/time";

// ── Types ────────────────────────────────────────────────────────────

export type AircraftPhoto = {
  src: string;
  link: string;
  photographer: string;
  width: number;
  height: number;
};

export enum AircraftRouteSource {
  FlightAware = "flightaware",
  HexDb = "hexdb",
}

export type LiveRoute = {
  source: AircraftRouteSource;
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
  /** Decoded planned route as [lat, lon] pairs. */
  waypoints?: [number, number][];
};

/** Single source for an airport's display or lookup code: ICAO ("K…") first,
 *  IATA fallback. The airports table is keyed by both, so either resolves. */
export function airportCode(apt?: { iata?: string; icao?: string }): string {
  return apt?.icao || apt?.iata || "";
}

export type AircraftDossier = {
  icao24: string;
  aircraft: {
    ICAOTypeCode?: string;
    Manufacturer?: string;
    ModeS?: string;
    OperatorFlagCode?: string;
    RegisteredOwners?: string;
    Registration?: string;
    Type?: string;
  } | null;
  route: LiveRoute | null;
};

export enum DossierLoadStatus {
  Idle = "idle",
  Loading = "loading",
  Loaded = "loaded",
  Error = "error",
}

export type DossierState = {
  status: DossierLoadStatus;
  data: AircraftDossier | null;
  entityId: string | null;
};

// ── Cache ────────────────────────────────────────────────────────────

type DossierCachePolicy = Readonly<{
  cacheKey: typeof CACHE_KEYS.dossier;
  ttlMs: number;
  maxEntries: number;
}>;

const DOSSIER_CACHE_POLICY: DossierCachePolicy = {
  cacheKey: CACHE_KEYS.dossier,
  ttlMs: 30 * MS_PER_MINUTE,
  maxEntries: 200,
};

type DossierCacheMap = Record<string, { dossier: AircraftDossier; ts: number }>;

async function loadCache(): Promise<DossierCacheMap> {
  try {
    return await cacheGet<DossierCacheMap>(
      DOSSIER_CACHE_POLICY.cacheKey,
    ) ?? {};
  } catch {
    return {};
  }
}

export async function getCachedDossier(key: string): Promise<AircraftDossier | null> {
  const cache = await loadCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > DOSSIER_CACHE_POLICY.ttlMs) return null;
  return entry.dossier;
}

export async function setCachedDossier(key: string, dossier: AircraftDossier): Promise<void> {
  const cache = await loadCache();
  cache[key] = { dossier, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > DOSSIER_CACHE_POLICY.maxEntries) {
    keys.sort((a, b) => cache[a]!.ts - cache[b]!.ts);
    const deleteCount =
      keys.length - DOSSIER_CACHE_POLICY.maxEntries;
    for (let index = 0; index < deleteCount; index += 1) {
      const keyToDelete = keys[index];
      if (keyToDelete) delete cache[keyToDelete];
    }
  }
  cacheSet(DOSSIER_CACHE_POLICY.cacheKey, cache);
}
