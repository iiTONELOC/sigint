import { afterAll, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { DataProvider } from "@/context/DataContext";
import { UIProvider } from "@/context/UIContext";
import type { DataPoint } from "@/features/base/dataPoints";
import { CycloneDossier } from "@/features/environmental/cyclones/ui/CycloneDossier";
import { ThemeProvider } from "@/theme";
import { Domain } from "@shared/domain/identity";
import { testCycloneScenePoint } from "../_support/cyclone";
import { renderReact } from "../support/react";

enum DetailPanelFixtureSelector {
  Card = "[data-tour='detail-drag-handle']",
  Section = "section[aria-label]",
  Sheet = "[data-detail-sheet]",
}

enum DetailPanelFixtureSection {
  ForecastTimeline = "FORECAST TIMELINE",
}

enum DetailPanelFixtureText {
  Callsign = "UAL123",
  Icao = "abc123",
  Id = "detail-panel-aircraft",
}

enum DetailPanelFixtureCoordinate {
  Latitude = 40.7,
  Longitude = -73.9,
}

const AIRCRAFT_POINT: DataPoint = {
  data: {
    callsign: DetailPanelFixtureText.Callsign,
    icao24: DetailPanelFixtureText.Icao,
  },
  id: DetailPanelFixtureText.Id,
  position: [
    DetailPanelFixtureCoordinate.Longitude,
    DetailPanelFixtureCoordinate.Latitude,
  ],
  timestamp: new Date().toISOString(),
  type: Domain.Aircraft,
};

let mocking = true;
let mobileLayout = false;
const realLayoutMode = { ...(await import("@/layout-mode")) };
mock.module("@/layout-mode", () => ({
  ...realLayoutMode,
  useIsMobileLayout: () =>
    mocking ? mobileLayout : realLayoutMode.useIsMobileLayout(),
}));

const { DetailPanel } = await import("@/components/DetailPanel");

function noop(): void {}

type DetailPanelSurfaces = Readonly<{ card: boolean; sheet: boolean }>;

function renderPanel(mobile: boolean): DetailPanelSurfaces {
  mobileLayout = mobile;
  const { container } = renderReact(
    <ThemeProvider>
      <DetailPanel
        item={AIRCRAFT_POINT}
        isolateMode={null}
        onClose={noop}
        onSetIsolateMode={noop}
      />
    </ThemeProvider>,
  );
  return {
    card: container.querySelector(DetailPanelFixtureSelector.Card) !== null,
    sheet: container.querySelector(DetailPanelFixtureSelector.Sheet) !== null,
  };
}

function sectionLabels(node: ReactElement): Array<string | null> {
  const { container } = renderReact(
    <ThemeProvider>
      <DataProvider>
        <UIProvider>{node}</UIProvider>
      </DataProvider>
    </ThemeProvider>,
  );
  return Array.from(container.querySelectorAll(DetailPanelFixtureSelector.Section)).map((section) =>
    section.getAttribute("aria-label"),
  );
}

afterAll(() => {
  mocking = false;
});

describe("DetailPanel storm card", () => {
  test("shows every section of the storm dossier", () => {
    mobileLayout = false;
    const item = testCycloneScenePoint();

    const card = sectionLabels(
      <DetailPanel item={item} isolateMode={null} onClose={noop} onSetIsolateMode={noop} />,
    );
    const dossier = sectionLabels(
      <CycloneDossier item={item} isolateMode={null} onLocate={noop} onFocus={noop} onSolo={noop} onClose={noop} />,
    );

    expect(card).toEqual(dossier);
    expect(card).toContain(DetailPanelFixtureSection.ForecastTimeline);
  });
});

describe("DetailPanel layout", () => {
  test("shows the bottom sheet in the phone layout", () => {
    expect(renderPanel(true)).toEqual({ card: false, sheet: true });
  });

  test("shows the floating card in the desktop layout", () => {
    expect(renderPanel(false)).toEqual({ card: true, sheet: false });
  });
});
