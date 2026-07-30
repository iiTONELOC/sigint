import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  AircraftRouteSource,
  type AircraftDossier,
} from "@shared/domain/aircraftDossier";
import {
  AircraftDossierCacheVersion,
  AircraftDossierService,
  AircraftDossierServiceError,
  type AircraftDossierCacheSnapshot,
} from "@/workers/data/aircraftDossierService";
import type {
  AircraftPoint,
} from "@/features/tracking/aircraft/data/codec";

enum AircraftDossierTestTime {
  CachedAt = 1_000,
  Current = 2_000,
}

function aircraft(id: string = "aircraft-a"): AircraftPoint {
  return {
    id,
    type: Domain.Aircraft,
    lat: 40,
    lon: -74,
    timestamp: "2026-07-30T00:00:00.000Z",
    data: {
      icao24: "abc123",
      callsign: "UAL123",
    },
  };
}

function dossier(icao24: string = "abc123"): AircraftDossier {
  return {
    icao24,
    aircraft: null,
    route: {
      source: AircraftRouteSource.FlightAware,
      origin: { icao: "KJFK" },
      destination: { icao: "KLAX" },
      waypoints: [
        [40.6, -73.7],
        [33.9, -118.4],
      ],
    },
  };
}

function cacheSnapshot(
  value: AircraftDossier,
): AircraftDossierCacheSnapshot {
  return {
    schemaVersion: AircraftDossierCacheVersion.Current,
    entries: {
      "abc123:UAL123": {
        dossier: value,
        cachedAt: AircraftDossierTestTime.CachedAt,
      },
    },
  };
}

describe("AircraftDossierService", () => {
  test("serves the worker-owned cache without a second request", async () => {
    let requestCount = 0;
    const service = new AircraftDossierService({
      entities: { get: () => aircraft() },
      readCache: async () => cacheSnapshot(dossier()),
      persistCache: () => undefined,
      fetchDossier: async () => {
        requestCount++;
        return dossier();
      },
      now: () => AircraftDossierTestTime.Current,
    });

    expect(await service.get("aircraft-a")).toEqual(dossier());
    expect(requestCount).toBe(0);
  });

  test("de-duplicates concurrent requests for one aircraft", async () => {
    let requestCount = 0;
    let completeRequest = (_value: AircraftDossier): void => undefined;
    let markRequestStarted = (): void => undefined;
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    const pendingDossier = new Promise<AircraftDossier>((resolve) => {
      completeRequest = resolve;
    });
    const service = new AircraftDossierService({
      entities: { get: () => aircraft() },
      readCache: async () => null,
      persistCache: () => undefined,
      fetchDossier: async () => {
        requestCount++;
        markRequestStarted();
        return pendingDossier;
      },
      now: () => AircraftDossierTestTime.Current,
    });

    const first = service.get("aircraft-a");
    const second = service.get("aircraft-a");
    await requestStarted;
    expect(requestCount).toBe(1);
    completeRequest(dossier());
    expect(await first).toEqual(dossier());
    expect(await second).toEqual(dossier());
  });

  test("persists a validated dossier after a cache miss", async () => {
    const persisted: AircraftDossierCacheSnapshot[] = [];
    const service = new AircraftDossierService({
      entities: { get: () => aircraft() },
      readCache: async () => null,
      persistCache: (snapshot) => {
        persisted.push(snapshot);
      },
      fetchDossier: async () => dossier(),
      now: () => AircraftDossierTestTime.Current,
    });

    expect(await service.get("aircraft-a")).toEqual(dossier());
    expect(persisted.at(-1)?.entries["abc123:UAL123"]?.dossier).toEqual(
      dossier(),
    );
  });

  test("rejects a response for another aircraft", async () => {
    const service = new AircraftDossierService({
      entities: { get: () => aircraft() },
      readCache: async () => null,
      persistCache: () => undefined,
      fetchDossier: async () => dossier("def456"),
      now: () => AircraftDossierTestTime.Current,
    });

    await expect(service.get("aircraft-a")).rejects.toThrow(
      AircraftDossierServiceError.IdentityMismatch,
    );
  });

  test("returns no dossier when the selected entity is unavailable", async () => {
    const service = new AircraftDossierService({
      entities: { get: () => null },
      readCache: async () => null,
      persistCache: () => undefined,
      fetchDossier: async () => dossier(),
      now: () => AircraftDossierTestTime.Current,
    });

    expect(await service.get("missing")).toBeNull();
  });
});
