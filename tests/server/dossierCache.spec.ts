import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  AircraftEventTime,
  AircraftFlightEvent,
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

function flightAwareHtml(overrides: Record<string, unknown> = {}): string {
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
        ...overrides,
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
    expect(dossier?.route?.schedule?.[AircraftFlightEvent.Takeoff]).toEqual({
      [AircraftEventTime.Scheduled]: 1_000,
      [AircraftEventTime.Actual]: 2_000,
    });
    expect(backgroundRouteRequestCount).toBe(1);
  });
});

function serveFlightAware(overrides: Record<string, unknown>): void {
  setFetch(async (input: RequestInfo | URL) =>
    String(input).includes(AircraftDossierFixture.FlightAwareHost)
      ? new Response(flightAwareHtml(overrides))
      : new Response(null, { status: 404 }));
}

describe("aircraft dossier filed route fallback", () => {
  const airport = { iata: null, icao: "KLAL", friendlyName: null, friendlyLocation: null, gate: null };

  test("builds waypoints from filed coordinates between the airports", async () => {
    serveFlightAware({
      origin: { ...airport, coord: [-82, 28] },
      destination: { ...airport, coord: [-82, 28] },
      flightPlan: { route: "DCT 2858N/08628W DCT 2755S/08718E" },
      waypoints: [],
    });

    const route = (await getAircraftDossier("abc126", "NOAA49"))?.route;

    expect(route?.waypoints).toEqual([
      [28, -82],
      [28 + 58 / 60, -(86 + 28 / 60)],
      [-(27 + 55 / 60), 87 + 18 / 60],
      [28, -82],
    ]);
    expect(route?.fixes?.map((fix) => fix.name)).toEqual(["2858N/08628W", "2755S/08718E"]);
  });

  test("ignores malformed filed coordinates", async () => {
    serveFlightAware({
      origin: { ...airport, coord: [-82, 28] },
      destination: { ...airport, coord: [-82, 28] },
      flightPlan: { route: "9958N/08628W 2860N/08628W 2858N/18628W 2858X/08628W" },
      waypoints: [],
    });

    const route = (await getAircraftDossier("abc127", "NOAA50"))?.route;

    expect(route?.waypoints).toBeUndefined();
  });
});
