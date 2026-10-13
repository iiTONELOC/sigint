import { afterAll, describe, expect, mock, test } from "bun:test";
import { CycloneThreatKind, CycloneThreatLevel } from "@shared/domain/cyclones";
import { testCycloneScenePoint } from "../../../_support/cyclone";
import { renderReact } from "../../../support/react";

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
const { CycloneDossierBody } = await import("@/features/environmental/cyclones/ui/CycloneDossier");
const { ThemeProvider } = await import("@/theme");

enum CycloneOrderFixtureText {
  Impact = "Roofs and power lines",
  Threat = "Hurricane-force winds",
}

const SECTION_ORDER = [
  "VITALS",
  "THREATS & POTENTIAL IMPACTS",
  "TRACK",
  "FORECAST TIMELINE",
  "WIND FIELD",
  "FORECAST",
  "HISTORY",
  "NHC PRODUCTS",
  "INTEL LINKS",
];

describe("CycloneDossierBody section order", () => {
  test("shows vitals, threats, the track, the timeline, then the rest", () => {
    const scene = testCycloneScenePoint();
    const item = {
      ...scene,
      data: {
        ...scene.data,
        hazards: {
          threats: [{ kind: CycloneThreatKind.Wind, level: CycloneThreatLevel.High, title: CycloneOrderFixtureText.Threat, impacts: [CycloneOrderFixtureText.Impact] }],
          peakSurge: [],
          windChances: [],
          arrival: {},
        },
      },
    };
    const { container } = renderReact(
      <ThemeProvider>
        <DataProvider>
          <UIProvider>
            <CycloneDossierBody item={item} />
          </UIProvider>
        </DataProvider>
      </ThemeProvider>,
    );

    const labels = Array.from(container.querySelectorAll("section[aria-label]")).map((s) => s.getAttribute("aria-label"));

    expect(labels).toEqual(SECTION_ORDER);
  });
});
