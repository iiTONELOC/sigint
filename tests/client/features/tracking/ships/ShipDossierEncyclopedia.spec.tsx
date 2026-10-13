import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { Domain } from "@shared/domain/identity";
import { HttpStatus } from "@shared/http";
import { installFetchMock, type RestoreFetch } from "../../../../support/network";
import { flushReactUpdates, renderReact } from "../../../../support/react";

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

const { DataProvider } = await import("@/context/DataContext");
const { UIProvider } = await import("@/context/UIContext");
const { ShipDossier } = await import("@/features/tracking/ships/ui/ShipDossier");
const { __resetEncyclopediaArticlesForTests } = await import("@/lib/net/encyclopedia");
const { ThemeProvider } = await import("@/theme");

type ShipDossierProps = ComponentProps<typeof ShipDossier>;

enum ShipFixture {
  Imo = 9811000,
  Latitude = 30,
  Longitude = 32,
  Mmsi = 353136000,
  PhotoHeight = 360,
  PhotoWidth = 640,
  UnknownImo = 1234567,
}

enum ShipFixtureText {
  Credit = "Huug Pieterse",
  Encyclopedia = "ENCYCLOPEDIA",
  Identity = "IDENTITY",
  License = "CC BY 4.0",
  PhotoPage = "https://commons.wikimedia.org/wiki/File:Ever_Given_2021.jpg",
  PhotoSrc = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ev/Ever_Given_2021.jpg/640px-Ever_Given_2021.jpg",
  Extract = "Ever Given is a container ship that blocked the Suez Canal in 2021.",
  Id = "ship-order",
  Name = "EVER GIVEN",
  Timestamp = "2026-10-12T00:00:00Z",
  Title = "Ever Given",
  Url = "https://en.wikipedia.org/wiki/Ever_Given",
}

const ANSWER = {
  article: { title: ShipFixtureText.Title, extract: ShipFixtureText.Extract, url: ShipFixtureText.Url, image: null },
  photo: { src: ShipFixtureText.PhotoSrc, width: ShipFixture.PhotoWidth, height: ShipFixture.PhotoHeight, credit: ShipFixtureText.Credit, license: ShipFixtureText.License, link: ShipFixtureText.PhotoPage },
};

function sectionTitled(container: HTMLDivElement, title: string): HTMLElement {
  const section = Array.from(container.querySelectorAll("section")).find(
    (candidate) => candidate.querySelector("h3")?.textContent?.trim() === title,
  );
  if (!section) throw new TypeError(`the ${title} section must render`);
  return section;
}

function shipItem(imo: number): ShipDossierProps["item"] {
  return {
    id: ShipFixtureText.Id,
    type: Domain.Ships,
    position: [ShipFixture.Longitude, ShipFixture.Latitude],
    timestamp: ShipFixtureText.Timestamp,
    data: { mmsi: ShipFixture.Mmsi, imo, name: ShipFixtureText.Name },
  };
}

let restoreFetch: RestoreFetch = () => undefined;

function noop(): void {}

function renderShip(imo: number): HTMLDivElement {
  restoreFetch = installFetchMock(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/encyclopedia/vessel") && url.endsWith(String(ShipFixture.Imo))) return Response.json(ANSWER);
    if (url.includes("/api/encyclopedia/vessel")) return Response.json({ article: null, photo: null });
    return new Response(null, { status: HttpStatus.ServiceUnavailable });
  });
  return renderReact(
    <ThemeProvider>
      <DataProvider>
        <UIProvider>
          <ShipDossier item={shipItem(imo)} isolateMode={null} onLocate={noop} onFocus={noop} onSolo={noop} onClose={noop} />
        </UIProvider>
      </DataProvider>
    </ThemeProvider>,
  ).container;
}

afterAll(() => {
  activeClient = null;
});

afterEach(() => {
  restoreFetch();
  __resetEncyclopediaArticlesForTests();
});

describe("ShipDossier encyclopedia", () => {
  test("shows the article for a well-known vessel right after IDENTITY", async () => {
    const container = renderShip(ShipFixture.Imo);
    await flushReactUpdates();
    const labels = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent?.trim());

    expect(labels.indexOf(ShipFixtureText.Encyclopedia)).toBe(labels.indexOf("IDENTITY") + 1);
    expect(container.textContent).toContain(ShipFixtureText.Extract);
  });

  test("shows the hull photo with its credit and license at the top of IDENTITY", async () => {
    const container = renderShip(ShipFixture.Imo);
    await flushReactUpdates();
    const identity = sectionTitled(container, ShipFixtureText.Identity);
    const img = identity.querySelector("img");

    expect(img?.getAttribute("src")).toBe(ShipFixtureText.PhotoSrc);
    expect(img?.closest("a")?.getAttribute("href")).toBe(ShipFixtureText.PhotoPage);
    expect(identity.textContent).toContain(ShipFixtureText.Credit);
    expect(identity.textContent).toContain(ShipFixtureText.License);
  });

  test("shows nothing extra for a vessel without an article or a photo", async () => {
    const container = renderShip(ShipFixture.UnknownImo);
    await flushReactUpdates();

    expect(container.textContent).not.toContain(ShipFixtureText.Encyclopedia);
    expect(sectionTitled(container, ShipFixtureText.Identity).querySelector("img")).toBeNull();
  });
});
