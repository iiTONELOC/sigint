import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";

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

const CACHE_KEY = CACHE_KEYS.dossier;
const CACHE_TTL_MS = 30 * 60_000;

type DossierCacheMap = Record<string, { dossier: AircraftDossier; ts: number }>;

async function loadCache(): Promise<DossierCacheMap> {
  try {
    return await cacheGet<DossierCacheMap>(CACHE_KEY) ?? {};
  } catch {
    return {};
  }
}

export async function getCachedDossier(key: string): Promise<AircraftDossier | null> {
  const cache = await loadCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.dossier;
}

export async function setCachedDossier(key: string, dossier: AircraftDossier): Promise<void> {
  const cache = await loadCache();
  cache[key] = { dossier, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 200) {
    const sorted = keys.sort((a, b) => cache[a]!.ts - cache[b]!.ts);
    for (let i = 0; i < sorted.length - 200; i++) delete cache[sorted[i]!];
  }
  cacheSet(CACHE_KEY, cache);
}
