import { CacheKey } from "@shared/domain/cache";
import { authenticatedFetch } from "@/lib/net/authService";
import type {
  AircraftPoint,
} from "@/features/tracking/aircraft/data/codec";
import {
  isAircraftIcao24,
  parseAircraftDossier,
  type AircraftDossier,
  type AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import { isRecord } from "@shared/geo";
import { MS_PER_MINUTE } from "@shared/time";

export enum AircraftDossierCacheVersion {
  Current = 1,
}

export enum AircraftDossierServiceError {
  IdentityMismatch = "Aircraft dossier identity does not match the request",
  InvalidResponse = "Aircraft dossier response is invalid",
  RequestFailed = "Aircraft dossier request failed",
}

enum AircraftDossierEndpoint {
  Aircraft = "/api/dossier/aircraft",
}

enum AircraftDossierQueryParameter {
  Callsign = "callsign",
}

export type AircraftDossierCacheSnapshot = Readonly<{
  schemaVersion: AircraftDossierCacheVersion;
  entries: Readonly<
    Record<
      string,
      Readonly<{
        dossier: AircraftDossier;
        cachedAt: number;
      }>
    >
  >;
}>;

export type AircraftDossierRequest = Readonly<{
  icao24: string;
  callsign: string | null;
}>;

type AircraftDossierEntityReader = Readonly<{
  get: (entityId: string) => AircraftPoint | null;
}>;

export type AircraftDossierServiceOptions = Readonly<{
  entities: AircraftDossierEntityReader;
  readCache: () => Promise<unknown>;
  persistCache: (snapshot: AircraftDossierCacheSnapshot) => void;
  fetchDossier?: (
    request: AircraftDossierRequest,
  ) => Promise<AircraftDossier>;
  now?: () => number;
}>;

type AircraftDossierCachePolicy = Readonly<{
  key: CacheKey.Dossier;
  timeToLiveMs: number;
  maximumEntries: number;
}>;

export const AIRCRAFT_DOSSIER_CACHE_POLICY: AircraftDossierCachePolicy = {
  key: CacheKey.Dossier,
  timeToLiveMs: 30 * MS_PER_MINUTE,
  maximumEntries: 200,
};

type CachedAircraftDossier = Readonly<{
  dossier: AircraftDossier;
  cachedAt: number;
}>;

function parseCacheEntry(value: unknown): CachedAircraftDossier | null {
  if (
    !isRecord(value) ||
    typeof value.cachedAt !== "number" ||
    !Number.isFinite(value.cachedAt) ||
    value.cachedAt < 0
  ) {
    return null;
  }
  const dossier = parseAircraftDossier(value.dossier);
  return dossier ? { dossier, cachedAt: value.cachedAt } : null;
}

export function parseAircraftDossierCache(
  value: unknown,
): AircraftDossierCacheSnapshot | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== AircraftDossierCacheVersion.Current ||
    !isRecord(value.entries)
  ) {
    return null;
  }
  const entries: Record<string, CachedAircraftDossier> = {};
  for (const [key, candidate] of Object.entries(value.entries)) {
    if (key.length === 0) return null;
    const entry = parseCacheEntry(candidate);
    if (!entry) return null;
    entries[key] = entry;
  }
  return {
    schemaVersion: AircraftDossierCacheVersion.Current,
    entries,
  };
}

function requestForEntity(
  entity: AircraftPoint,
): AircraftDossierRequest | null {
  const rawIcao24 = entity.data.icao24;
  if (!rawIcao24) return null;
  const icao24 = rawIcao24.toLowerCase();
  if (!isAircraftIcao24(icao24)) return null;
  const normalizedCallsign = entity.data.callsign?.trim().toUpperCase() ?? "";
  return {
    icao24,
    callsign: normalizedCallsign.length > 0 ? normalizedCallsign : null,
  };
}

function cacheKeyFor(request: AircraftDossierRequest): string {
  return `${request.icao24}:${request.callsign ?? ""}`;
}

async function fetchAircraftDossier(
  request: AircraftDossierRequest,
): Promise<AircraftDossier> {
  const query = new URLSearchParams();
  if (request.callsign) {
    query.set(AircraftDossierQueryParameter.Callsign, request.callsign);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await authenticatedFetch(
    `${AircraftDossierEndpoint.Aircraft}/${request.icao24}${suffix}`,
  );
  if (!response.ok) {
    throw new Error(AircraftDossierServiceError.RequestFailed);
  }
  const payload: unknown = await response.json();
  const dossier = isRecord(payload)
    ? parseAircraftDossier(payload.dossier)
    : null;
  if (!dossier) {
    throw new Error(AircraftDossierServiceError.InvalidResponse);
  }
  return dossier;
}

export class AircraftDossierService {
  private readonly entities: AircraftDossierEntityReader;
  private readonly fetchDossier: (
    request: AircraftDossierRequest,
  ) => Promise<AircraftDossier>;
  private readonly now: () => number;
  private readonly persistCache: (
    snapshot: AircraftDossierCacheSnapshot,
  ) => void;
  private readonly readCache: () => Promise<unknown>;
  private readonly pending = new Map<string, Promise<AircraftDossier>>();
  private entries: Map<string, CachedAircraftDossier> | null = null;
  private hydration: Promise<Map<string, CachedAircraftDossier>> | null = null;

  constructor(options: AircraftDossierServiceOptions) {
    this.entities = options.entities;
    this.fetchDossier = options.fetchDossier ?? fetchAircraftDossier;
    this.now = options.now ?? Date.now;
    this.persistCache = options.persistCache;
    this.readCache = options.readCache;
  }

  async get(entityId: string): Promise<AircraftDossier | null> {
    const entity = this.entities.get(entityId);
    if (!entity) return null;
    const request = requestForEntity(entity);
    if (!request) return null;
    const key = cacheKeyFor(request);
    const entries = await this.cacheEntries();
    const cached = entries.get(key);
    if (
      cached &&
      this.now() - cached.cachedAt <=
        AIRCRAFT_DOSSIER_CACHE_POLICY.timeToLiveMs
    ) {
      return cached.dossier;
    }
    if (cached) entries.delete(key);
    const currentRequest = this.pending.get(key);
    if (currentRequest) return currentRequest;
    const pending = this.fetchAndCache(key, request, entries);
    this.pending.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.pending.get(key) === pending) this.pending.delete(key);
    }
  }

  async route(
    entityId: string,
  ): Promise<readonly AircraftRouteWaypoint[] | null> {
    return (await this.get(entityId))?.route?.waypoints ?? null;
  }

  private async cacheEntries(): Promise<
    Map<string, CachedAircraftDossier>
  > {
    if (this.entries) return this.entries;
    this.hydration ??= this.hydrate();
    return this.hydration;
  }

  private async hydrate(): Promise<Map<string, CachedAircraftDossier>> {
    const snapshot = parseAircraftDossierCache(await this.readCache());
    const entries = new Map<string, CachedAircraftDossier>(
      Object.entries(snapshot?.entries ?? {}),
    );
    this.entries = entries;
    return entries;
  }

  private async fetchAndCache(
    key: string,
    request: AircraftDossierRequest,
    entries: Map<string, CachedAircraftDossier>,
  ): Promise<AircraftDossier> {
    const dossier = await this.fetchDossier(request);
    if (dossier.icao24.toLowerCase() !== request.icao24) {
      throw new Error(AircraftDossierServiceError.IdentityMismatch);
    }
    entries.set(key, { dossier, cachedAt: this.now() });
    this.prune(entries);
    this.persistCache(this.snapshot(entries));
    return dossier;
  }

  private prune(entries: Map<string, CachedAircraftDossier>): void {
    while (
      entries.size > AIRCRAFT_DOSSIER_CACHE_POLICY.maximumEntries
    ) {
      let oldestKey: string | null = null;
      let oldestTime = Number.POSITIVE_INFINITY;
      for (const [key, entry] of entries) {
        if (entry.cachedAt >= oldestTime) continue;
        oldestKey = key;
        oldestTime = entry.cachedAt;
      }
      if (oldestKey === null) return;
      entries.delete(oldestKey);
    }
  }

  private snapshot(
    entries: Map<string, CachedAircraftDossier>,
  ): AircraftDossierCacheSnapshot {
    return {
      schemaVersion: AircraftDossierCacheVersion.Current,
      entries: Object.fromEntries(entries),
    };
  }
}
