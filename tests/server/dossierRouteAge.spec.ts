import { describe, expect, test } from "bun:test";
import {
  AircraftRouteSource,
  type AircraftDossierBundle,
  type AircraftRoute,
} from "@shared/domain/aircraftDossier";
import { routeReceivedAt } from "../../src/server/api/dossierCache";

const NOW = 1_000_000;
const EARLIER = 400_000;
const route = { source: AircraftRouteSource.FlightAware } as AircraftRoute;

function cached(withRoute: boolean): Readonly<{ data: AircraftDossierBundle; receivedAt: number }> {
  return { data: { icao24: "abc123", aircraft: null, route: withRoute ? route : null }, receivedAt: EARLIER };
}

describe("routeReceivedAt", () => {
  test("a freshly fetched route is stamped now", () => {
    expect(routeReceivedAt(route, cached(true), NOW)).toBe(NOW);
  });

  test("a carried-forward route keeps the age it was first fetched at", () => {
    expect(routeReceivedAt(null, cached(true), NOW)).toBe(EARLIER);
  });

  test("with no route to carry forward the entry is stamped now", () => {
    expect(routeReceivedAt(null, cached(false), NOW)).toBe(NOW);
    expect(routeReceivedAt(null, null, NOW)).toBe(NOW);
  });
});
