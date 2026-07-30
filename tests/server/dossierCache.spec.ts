import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  AircraftRouteSource,
} from "@shared/domain/aircraftDossier";
import {
  getAircraftDossier,
  getAirportInfo,
  isValidCallsign,
  isValidIcao24,
} from "../../src/server/api/dossierCache";

enum AircraftDossierFixture {
  FlightAwareHost = "flightaware.com",
  HexDbHost = "hexdb.io",
  HexDbRoutePath = "/api/v1/route/icao/",
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function setFetch(
  implementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): void {
  globalThis.fetch = Object.assign(implementation, {
    preconnect: originalFetch.preconnect,
  });
}

function flightAwareHtml(): string {
  return `<script>var trackpollBootstrap = ${JSON.stringify({
    flights: {
      current: {
        origin: {
          iata: "JFK",
          icao: "KJFK",
          friendlyName: "John F Kennedy International",
          friendlyLocation: null,
          gate: null,
        },
        destination: {
          iata: "LAX",
          icao: "KLAX",
          friendlyName: "Los Angeles International",
          friendlyLocation: null,
          gate: null,
        },
        flightStatus: "en route",
        takeoffTimes: {
          scheduled: 1_000,
          estimated: null,
          actual: 2_000,
        },
        landingTimes: {
          scheduled: 5_000,
          estimated: null,
          actual: null,
        },
        gateDepartureTimes: null,
        flightPlan: {
          speed: 453,
          altitude: 330,
          route: "DCT",
          directDistance: null,
          plannedDistance: 2_150,
          ete: null,
        },
        distance: {
          elapsed: null,
          remaining: 1_800,
          actual: null,
        },
        airline: {
          fullName: "Example Air",
          shortName: null,
          icao: "UAL",
          iata: null,
        },
        waypoints: [
          [-73.7, 40.6],
          [-118.4, 33.9],
        ],
      },
    },
  })};</script>`;
}

describe("aircraft dossier validation", () => {
  test("accepts canonical ICAO24 and callsign values", () => {
    expect(isValidIcao24("abc123")).toBe(true);
    expect(isValidIcao24("ABCDEF")).toBe(true);
    expect(isValidCallsign("UAL123")).toBe(true);
  });

  test("rejects malformed aircraft identifiers", () => {
    expect(isValidIcao24("../../../etc/passwd")).toBe(false);
    expect(isValidIcao24("xyz123")).toBe(false);
    expect(isValidCallsign("UAL-123")).toBe(false);
  });

  test("rejects invalid lookup input without an upstream request", async () => {
    let requestCount = 0;
    setFetch(async () => {
      requestCount++;
      return new Response();
    });

    expect(await getAircraftDossier("invalid")).toBeNull();
    expect(await getAirportInfo("JFK")).toBeNull();
    expect(requestCount).toBe(0);
  });
});

describe("aircraft dossier route", () => {
  test("normalizes the provider route through the shared contract", async () => {
    let staleRouteRequestCount = 0;
    setFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(AircraftDossierFixture.FlightAwareHost)) {
        return new Response(flightAwareHtml());
      }
      if (url.includes(AircraftDossierFixture.HexDbRoutePath)) {
        staleRouteRequestCount++;
        return Response.json({ route: "KMCI-KPHX" });
      }
      if (url.includes(AircraftDossierFixture.HexDbHost)) {
        return Response.json({});
      }
      return new Response(null, { status: 404 });
    });

    const dossier = await getAircraftDossier("abc123", "UAL123");

    expect(dossier?.route?.source).toBe(
      AircraftRouteSource.FlightAware,
    );
    expect(dossier?.route?.waypoints).toEqual([
      [40.6, -73.7],
      [33.9, -118.4],
    ]);
    expect(dossier?.route?.delays?.departure).toBe("17m late");
    expect(staleRouteRequestCount).toBe(0);
  });
});
