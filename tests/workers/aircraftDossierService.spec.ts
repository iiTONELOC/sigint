import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  AircraftRouteSource,
  type AircraftDossier,
} from "@shared/domain/aircraftDossier";
import {
  AircraftDossierService,
  AircraftDossierServiceError,
} from "@/workers/data/aircraftDossierService";
import type { AircraftPoint } from "@shared/domain/aircraft";

function aircraft(id: string = "aircraft-a"): AircraftPoint {
  return {
    id,
    type: Domain.Aircraft,
    position: [-74, 40],
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

describe("AircraftDossierService", () => {
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
      fetchDossier: async () => {
        requestCount++;
        markRequestStarted();
        return pendingDossier;
      },
    });

    const first = service.get("aircraft-a");
    const second = service.get("aircraft-a");
    await requestStarted;
    expect(requestCount).toBe(1);
    completeRequest(dossier());
    expect(await first).toEqual(dossier());
    expect(await second).toEqual(dossier());
  });

  test("rejects a response for another aircraft", async () => {
    const service = new AircraftDossierService({
      entities: { get: () => aircraft() },
      fetchDossier: async () => dossier("def456"),
    });

    await expect(service.get("aircraft-a")).rejects.toThrow(
      AircraftDossierServiceError.IdentityMismatch,
    );
  });

  test("returns no dossier when the selected entity is unavailable", async () => {
    const service = new AircraftDossierService({
      entities: { get: () => null },
      fetchDossier: async () => dossier(),
    });

    expect(await service.get("missing")).toBeNull();
  });
});
