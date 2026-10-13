import { afterEach, describe, expect, test } from "bun:test";
import { useAircraftPhoto } from "@/features/tracking/aircraft/hooks/useAircraftPhoto";
import { __resetEncyclopediaArticlesForTests } from "@/lib/net/encyclopedia";
import { EncyclopediaQuery } from "@shared/domain/encyclopedia";
import { HttpStatus } from "@shared/http";
import { installFetchMock, type RestoreFetch } from "../../../../../support/network";
import { flushReactUpdates, renderHook } from "../../../../../support/react";

enum PhotoFixtureText {
  Description = "BOEING 737-800",
  Icao24 = "a1b2c3",
  Manufacturer = "THE BOEING CO",
  Model = "737-86N(WL)",
  Registration = "N12345",
  Spotted = "https://cdn.plnspttrs.net/12345/aircraft.jpg",
  StockImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Delta_737-800.jpg/640px-Delta_737-800.jpg",
  StockTitle = "Boeing 737 Next Generation",
  StockUrl = "https://en.wikipedia.org/wiki/Boeing_737_Next_Generation",
}

enum PhotoFixtureSize {
  Height = 427,
  Width = 640,
}

enum PhotoFixtureCount {
  None = 0,
}

enum SpotterAnswer {
  Down = "down",
  None = "none",
  Photo = "photo",
  Registration = "registration",
}

const STOCK = { article: { title: PhotoFixtureText.StockTitle, extract: "", url: PhotoFixtureText.StockUrl, image: { src: PhotoFixtureText.StockImage, width: PhotoFixtureSize.Width, height: PhotoFixtureSize.Height } } };
const SPOTTED = { photos: [{ thumbnail: { src: PhotoFixtureText.Spotted, size: { width: PhotoFixtureSize.Width, height: PhotoFixtureSize.Height } }, link: PhotoFixtureText.Spotted, photographer: "Someone" }] };
const STOCK_QUERY = { description: PhotoFixtureText.Description, manufacturer: PhotoFixtureText.Manufacturer, model: PhotoFixtureText.Model };

let restoreFetch: RestoreFetch = () => undefined;
let requested: string[] = [];

function serve(spotter: SpotterAnswer): void {
  restoreFetch = installFetchMock(async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("planespotters")) {
      if (spotter === SpotterAnswer.Down) throw new TypeError(SpotterAnswer.Down);
      const byTail = spotter === SpotterAnswer.Registration && url.endsWith(`/reg/${PhotoFixtureText.Registration}`);
      return spotter === SpotterAnswer.Photo || byTail ? Response.json(SPOTTED) : new Response(null, { status: HttpStatus.NotFound });
    }
    if (url.includes("/api/encyclopedia/aircraft-type")) return Response.json(STOCK);
    return new Response(null, { status: HttpStatus.NotFound });
  });
}

function stockRequests(): string[] {
  return requested.filter((url) => url.includes("encyclopedia"));
}

function spotterRequests(): string[] {
  return requested.filter((url) => url.includes("planespotters"));
}

afterEach(() => {
  restoreFetch();
  __resetEncyclopediaArticlesForTests();
  requested = [];
});

describe("useAircraftPhoto", () => {
  test("falls back to the type's stock photo, asking with the feed description", async () => {
    serve(SpotterAnswer.None);
    const { result } = renderHook(() => useAircraftPhoto(PhotoFixtureText.Icao24, PhotoFixtureText.Registration, STOCK_QUERY));
    await flushReactUpdates();

    expect(result.current.photo?.stock).toBe(true);
    expect(stockRequests()[0]).toContain(`${EncyclopediaQuery.Description}=${encodeURIComponent(PhotoFixtureText.Description).replaceAll("%20", "+")}`);
    expect(result.current.photo?.src).toBe(PhotoFixtureText.StockImage);
    expect(result.current.photo?.link).toBe(PhotoFixtureText.StockUrl);
    expect(result.current.loading).toBe(false);
  });

  test("still reaches the stock photo when the spotter service cannot be reached", async () => {
    serve(SpotterAnswer.Down);
    const { result } = renderHook(() => useAircraftPhoto(PhotoFixtureText.Icao24, PhotoFixtureText.Registration, STOCK_QUERY));
    await flushReactUpdates();

    expect(result.current.photo?.stock).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  test("asks the spotters by tail number when the hex has no photo, before any stock", async () => {
    serve(SpotterAnswer.Registration);
    const { result } = renderHook(() => useAircraftPhoto(PhotoFixtureText.Icao24, PhotoFixtureText.Registration, STOCK_QUERY));
    await flushReactUpdates();

    expect(result.current.photo?.stock).toBe(false);
    expect(result.current.photo?.src).toBe(PhotoFixtureText.Spotted);
    expect(spotterRequests().map((url) => url.slice(url.indexOf("/pub/")))).toEqual([
      `/pub/photos/hex/${PhotoFixtureText.Icao24.toUpperCase()}`,
      `/pub/photos/reg/${PhotoFixtureText.Registration}`,
    ]);
    expect(stockRequests()).toHaveLength(PhotoFixtureCount.None);
  });

  test("keeps the real photo and never asks for stock when the spotters answer", async () => {
    serve(SpotterAnswer.Photo);
    const { result } = renderHook(() => useAircraftPhoto(PhotoFixtureText.Icao24, PhotoFixtureText.Registration, STOCK_QUERY));
    await flushReactUpdates();

    expect(result.current.photo?.stock).toBe(false);
    expect(result.current.photo?.src).toBe(PhotoFixtureText.Spotted);
    expect(stockRequests()).toHaveLength(PhotoFixtureCount.None);
  });

  test("asks for no stock photo when nothing names the type", async () => {
    serve(SpotterAnswer.None);
    const { result } = renderHook(() => useAircraftPhoto(PhotoFixtureText.Icao24, PhotoFixtureText.Registration));
    await flushReactUpdates();

    expect(result.current.photo).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(stockRequests()).toHaveLength(PhotoFixtureCount.None);
  });
});
