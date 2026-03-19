import { cacheGet, cacheSet } from "@/lib/storageService";

// ── Types ────────────────────────────────────────────────────────────

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
  photo: AircraftPhoto | null;
};

export type DossierState = {
  status: "idle" | "loading" | "loaded" | "error";
  data: AircraftDossier | null;
  entityId: string | null;
};

// ── Cache ────────────────────────────────────────────────────────────

const CACHE_KEY = "sigint.dossier.cache.v1";
const CACHE_TTL_MS = 30 * 60_000;

type DossierCacheMap = Record<string, { dossier: AircraftDossier; ts: number }>;

function loadCache(): DossierCacheMap {
  try {
    return cacheGet<DossierCacheMap>(CACHE_KEY) ?? {};
  } catch {
    return {};
  }
}

export function getCachedDossier(key: string): AircraftDossier | null {
  const cache = loadCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.dossier;
}

export function setCachedDossier(key: string, dossier: AircraftDossier): void {
  const cache = loadCache();
  cache[key] = { dossier, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 200) {
    const sorted = keys.sort((a, b) => cache[a]!.ts - cache[b]!.ts);
    for (let i = 0; i < sorted.length - 200; i++) delete cache[sorted[i]!];
  }
  cacheSet(CACHE_KEY, cache);
}
