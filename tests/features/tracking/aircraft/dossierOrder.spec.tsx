import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { Domain } from "@shared/domain/identity";
import { HttpStatus } from "@shared/http";
import { installFetchMock, type RestoreFetch } from "../../../support/network";
import { flushReactUpdates, renderReact } from "../../../support/react";

const fakeClient = {
  getAircraftDossier: async () => null,
  getCycloneDossier: async () => null,
  getSourceSnapshot: () => null,
  getTrail: async () => [],
  querySource: () => new Promise<never>(() => undefined),
  subscribeSource: () => () => undefined,
};
let activeClient: typeof fakeClient | null = fakeClient;
const realClientExports = { ...(await import("@/lib/cache/dataWorkerClient")) };
mock.module("@/lib/cache/dataWorkerClient", () => ({
  ...realClientExports,
  getDataWorkerClient: () => activeClient ?? realClientExports.getDataWorkerClient(),
}));

afterAll(() => {
  activeClient = null;
});

const { DataProvider } = await import("@/context/DataContext");
const { UIProvider } = await import("@/context/UIContext");
const { AircraftDossier } = await import("@/features/tracking/aircraft/ui/AircraftDossier");
const { ThemeProvider } = await import("@/theme");

type AircraftDossierProps = ComponentProps<typeof AircraftDossier>;

enum AircraftOrderFixture {
  Altitude = 35_000,
  Heading = 90,
  Latitude = 40,
  Longitude = -73,
  Speed = 450,
}

enum AircraftOrderFixtureText {
  Callsign = "UAL1",
  Icao24 = "abc123",
  Id = "ac-order",
  Timestamp = "2026-10-12T00:00:00Z",
}

const SECTION_ORDER = ["AIRCRAFT", "LIVE TELEMETRY", "ROUTE", "TELEMETRY DATA", "INTEL LINKS"];

const ITEM: AircraftDossierProps["item"] = {
  id: AircraftOrderFixtureText.Id,
  type: Domain.Aircraft,
  position: [AircraftOrderFixture.Longitude, AircraftOrderFixture.Latitude],
  timestamp: AircraftOrderFixtureText.Timestamp,
  data: {
    callsign: AircraftOrderFixtureText.Callsign,
    icao24: AircraftOrderFixtureText.Icao24,
    altitude: AircraftOrderFixture.Altitude,
    speed: AircraftOrderFixture.Speed,
    heading: AircraftOrderFixture.Heading,
  },
};

let restoreFetch: RestoreFetch = () => undefined;

function noop(): void {}

afterEach(() => {
  restoreFetch();
});

describe("AircraftDossier section order", () => {
  test("shows the ticket, the gauges, the route, then the telemetry data and the links", async () => {
    restoreFetch = installFetchMock(async () => new Response(null, { status: HttpStatus.ServiceUnavailable }));
    const { container } = renderReact(
      <ThemeProvider>
        <DataProvider>
          <UIProvider>
            <AircraftDossier item={ITEM} isolateMode={null} onLocate={noop} onFocus={noop} onSolo={noop} onClose={noop} />
          </UIProvider>
        </DataProvider>
      </ThemeProvider>,
    );

    await flushReactUpdates();
    const labels = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent?.trim());

    expect(labels).toEqual(SECTION_ORDER);
  });
});
