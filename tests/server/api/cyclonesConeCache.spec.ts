import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import {
  __resetCyclonesCacheForTests,
  fetchCyclones,
} from "../../../src/server/api/cyclonesCache";
import {
  __resetCycloneConeCacheForTests,
  getCycloneCone,
  parseKmlConeToGeoJSON,
  CONE_CACHE_TTL_MS,
} from "../../../src/server/api/cyclonesConeCache";

const KMZ_URL =
  "https://www.nhc.noaa.gov/storm_graphics/api/AL142024_013adv_CONE.kmz";
const STORM_ID = "AL142024";

let kmzBytes: Uint8Array;

beforeEach(async () => {
  kmzBytes = new Uint8Array(
    await Bun.file("tests/fixtures/cyclones-cone/milton-al14-cone.kmz")
      .arrayBuffer(),
  );
});

// ── KML → GeoJSON parser ────────────────────────────────────────────

describe("parseKmlConeToGeoJSON", () => {
  test("extracts Polygon outer ring as GeoJSON with at least 4 vertices", () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml><Document><Placemark><Polygon><outerBoundaryIs><LinearRing>
<coordinates>
  -90.0,22.4,0
  -82.0,28.0,0
  -78.0,32.0,0
  -84.0,32.0,0
  -90.0,22.4,0
</coordinates>
</LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const polygon = parseKmlConeToGeoJSON(kml);
    expect(polygon).not.toBeNull();
    expect(polygon!.type).toBe("Polygon");
    expect(polygon!.coordinates[0]!.length).toBeGreaterThanOrEqual(4);
    expect(polygon!.coordinates[0]![0]).toEqual([-90.0, 22.4]);
  });

  test("returns null when KML has no <Polygon>", () => {
    const kml = `<?xml version="1.0"?><kml><Document/></kml>`;
    expect(parseKmlConeToGeoJSON(kml)).toBeNull();
  });

  test("returns null when ring has fewer than 4 vertices", () => {
    const kml = `<?xml?><kml><Polygon><outerBoundaryIs><LinearRing>
<coordinates>-90,22,0 -82,28,0 -90,22,0</coordinates>
</LinearRing></outerBoundaryIs></Polygon></kml>`;
    expect(parseKmlConeToGeoJSON(kml)).toBeNull();
  });

  test("throws on malformed coordinate values", () => {
    const kml = `<?xml?><kml><Polygon><outerBoundaryIs><LinearRing>
<coordinates>not,a,coord -82,28,0 -78,32,0 -84,32,0 -90,22,0</coordinates>
</LinearRing></outerBoundaryIs></Polygon></kml>`;
    expect(() => parseKmlConeToGeoJSON(kml)).toThrow("Malformed coordinate value");
  });
});

// ── End-to-end cache ───────────────────────────────────────────────

describe("getCycloneCone — KMZ fetch + cache + fallback", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCount: Record<string, number>;
  let kmzHandler: () => Response | Promise<Response>;

  beforeEach(() => {
    __resetCyclonesCacheForTests();
    __resetCycloneConeCacheForTests();
    originalFetch = globalThis.fetch;
    fetchCount = {};
    kmzHandler = () => new Response(kmzBytes, { status: 200 });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      fetchCount[url] = (fetchCount[url] ?? 0) + 1;
      if (url.endsWith("/CurrentStorms.json")) {
        const body = await Bun.file(
          "tests/fixtures/cyclones/CurrentStorms-milton-al14.json",
        ).text();
        return new Response(body, { status: 200 });
      }
      if (url === KMZ_URL) return kmzHandler();
      throw new Error(`Unmocked fetch: ${url}`);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches Milton KMZ, returns valid GeoJSON Polygon", async () => {
    await fetchCyclones(new Date(Date.UTC(2024, 9, 8)));
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).not.toBeNull();
    expect(result.cone!.type).toBe("Polygon");
    expect(result.cone!.coordinates[0]!.length).toBeGreaterThanOrEqual(4);
  });

  test("cache returns within TTL without re-fetching", async () => {
    await fetchCyclones(new Date(Date.UTC(2024, 9, 8)));
    await getCycloneCone(STORM_ID);
    await getCycloneCone(STORM_ID);
    await getCycloneCone(STORM_ID);
    expect(fetchCount[KMZ_URL]).toBe(1);
    expect(CONE_CACHE_TTL_MS).toBe(60 * 60_000);
  });

  test("storm not registered in cyclonesCache → cone: null", async () => {
    // Don't call fetchCyclones — stormProducts is empty.
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).toBeNull();
  });

  test("KMZ fetch HTTP error → cone: null, no throw", async () => {
    await fetchCyclones(new Date(Date.UTC(2024, 9, 8)));
    kmzHandler = () => new Response("oops", { status: 503 });
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).toBeNull();
  });

  test("KMZ network error → cone: null, no throw", async () => {
    await fetchCyclones(new Date(Date.UTC(2024, 9, 8)));
    kmzHandler = () => {
      throw new Error("simulated network error");
    };
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).toBeNull();
  });
});
