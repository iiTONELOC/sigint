import { describe, expect, test } from "bun:test";
import {
  AircraftRouteLimit,
  AircraftRouteSource,
  isAircraftIcao24,
  parseAircraftDossier,
} from "@shared/domain/aircraftDossier";

function dossierWithWaypoints(waypoints: unknown): unknown {
  return {
    icao24: "abc123",
    aircraft: null,
    route: {
      source: AircraftRouteSource.FlightAware,
      origin: { icao: "KJFK" },
      destination: { icao: "KLAX" },
      waypoints,
    },
  };
}

describe("aircraft dossier contract", () => {
  test("accepts a bounded route projection", () => {
    const dossier = parseAircraftDossier(
      dossierWithWaypoints([
        [40.6, -73.7],
        [33.9, -118.4],
      ]),
    );

    expect(dossier?.route?.source).toBe(
      AircraftRouteSource.FlightAware,
    );
    expect(dossier?.route?.waypoints).toHaveLength(
      AircraftRouteLimit.WaypointComponentCount,
    );
  });

  test("rejects an unknown route source", () => {
    expect(parseAircraftDossier({
      icao24: "abc123",
      aircraft: null,
      route: {
        source: AircraftRouteSource.FlightAware.toUpperCase(),
        origin: {},
        destination: {},
      },
    })).toBeNull();
  });

  test("rejects invalid route coordinates", () => {
    expect(
      parseAircraftDossier(dossierWithWaypoints([[91, 0]])),
    ).toBeNull();
  });

  test("rejects an oversized route", () => {
    const waypoints = Array.from(
      {
        length: AircraftRouteLimit.MaximumWaypointCount + 1,
      },
      () => [0, 0],
    );
    expect(
      parseAircraftDossier(dossierWithWaypoints(waypoints)),
    ).toBeNull();
  });

  test("validates the canonical aircraft identity", () => {
    expect(isAircraftIcao24("abc123")).toBe(true);
    expect(isAircraftIcao24("xyz123")).toBe(false);
  });
});
