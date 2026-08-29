import { authenticatedFetch } from "@/lib/net/authService";
import { AircraftApiRoute, type AircraftPoint } from "@shared/domain/aircraft";
import {
  normalizeIcao24,
  parseAircraftDossier,
  type AircraftDossier,
  type AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import { isRecord } from "@shared/geo";

export enum AircraftDossierServiceError {
  IdentityMismatch = "Aircraft dossier identity does not match the request",
  InvalidResponse = "Aircraft dossier response is invalid",
  RequestFailed = "Aircraft dossier request failed",
}

enum AircraftDossierQueryParameter {
  Callsign = "callsign",
}

export type AircraftDossierRequest = Readonly<{
  icao24: string;
  callsign: string | null;
}>;

type AircraftDossierEntityReader = Readonly<{
  get: (entityId: string) => AircraftPoint | null;
}>;

export type AircraftDossierServiceOptions = Readonly<{
  entities: AircraftDossierEntityReader;
  fetchDossier?: (
    request: AircraftDossierRequest,
  ) => Promise<AircraftDossier>;
}>;

function requestForEntity(
  entity: AircraftPoint,
): AircraftDossierRequest | null {
  const rawIcao24 = entity.data.icao24;
  if (!rawIcao24) return null;
  const icao24 = normalizeIcao24(rawIcao24);
  if (!icao24) return null;
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
    `${AircraftApiRoute.Dossier}/${request.icao24}${suffix}`,
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
  private readonly pending = new Map<string, Promise<AircraftDossier>>();

  constructor(options: AircraftDossierServiceOptions) {
    this.entities = options.entities;
    this.fetchDossier = options.fetchDossier ?? fetchAircraftDossier;
  }

  async get(entityId: string): Promise<AircraftDossier | null> {
    const entity = this.entities.get(entityId);
    if (!entity) return null;
    const request = requestForEntity(entity);
    if (!request) return null;
    const key = cacheKeyFor(request);
    const currentRequest = this.pending.get(key);
    if (currentRequest) return currentRequest;
    const pending = this.fetch(request);
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

  private async fetch(
    request: AircraftDossierRequest,
  ): Promise<AircraftDossier> {
    const dossier = await this.fetchDossier(request);
    if (dossier.icao24.toLowerCase() !== request.icao24) {
      throw new Error(AircraftDossierServiceError.IdentityMismatch);
    }
    return dossier;
  }
}
