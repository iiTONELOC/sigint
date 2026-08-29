import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  AircraftRouteSource,
  isAircraftIcao24,
} from "@shared/domain/aircraftDossier";
import {
  getAircraftDossier,
  isValidCallsign,
} from "../../src/server/api/dossierCache";
import {
  installFetchMock,
  type FetchMockImplementation,
  type RestoreFetch,
} from "../support/network";

enum AircraftDossierFixture {
  FlightAwareHost = "flightaware.com",
  HexDbHost = "hexdb.io",
  HexDbRoutePath = "/api/v1/route/icao/",
}

let restoreFetch: RestoreFetch | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function setFetch(implementation: FetchMockImplementation): void {
  restoreFetch?.();
  restoreFetch = installFetchMock(implementation);
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
    expect(isAircraftIcao24("abc123")).toBe(true);
    expect(isAircraftIcao24("ABCDEF")).toBe(true);
    expect(isValidCallsign("UAL123")).toBe(true);
  });

  test("rejects malformed aircraft identifiers", () => {
    expect(isAircraftIcao24("../../../etc/passwd")).toBe(false);
    expect(isAircraftIcao24("xyz123")).toBe(false);
    expect(isValidCallsign("UAL-123")).toBe(false);
  });

  test("rejects invalid aircraft input without an upstream request", async () => {
    let requestCount = 0;
    setFetch(async () => {
      requestCount++;
      return new Response();
    });

    expect(await getAircraftDossier("invalid")).toBeNull();
    expect(requestCount).toBe(0);
  });
});

describe("aircraft dossier route", () => {
  test("normalizes the provider route through the shared contract", async () => {
    let backgroundRouteRequestCount = 0;
    setFetch(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(AircraftDossierFixture.FlightAwareHost)) {
        return new Response(flightAwareHtml());
      }
      if (url.includes(AircraftDossierFixture.HexDbRoutePath)) {
        backgroundRouteRequestCount++;
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
    expect(backgroundRouteRequestCount).toBe(1);
  });
});
