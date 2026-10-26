import { GeoJsonGeometryType } from "@shared/geo";
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
  resetCycloneConeCache,
  getCycloneCone,
  parseKmlConeToGeoJSON,
  CONE_CACHE_TTL_MS,
} from "../../../src/server/api/cyclonesConeCache";
import { getCycloneDossier } from "../../../src/server/api/cyclonesDossierCache";

// Real capture: EP01 2026 (Amanda). The cone KMZ URL is read out of the
// real CurrentStorms.json (trackCone.kmzFile), so derive it from that fixture
// rather than hardcoding, keeps the mock honest against the real payload.
const REAL_CS = "tests/fixtures/cyclones-real/CurrentStorms.json";
const REAL_CONE_KMZ = "tests/fixtures/cyclones-real/ep012026-cone.kmz";
const STORM_ID = "EP012026";

let kmzBytes: ArrayBuffer;
let currentStormsBody: string;
let coneKmzUrl: string;

beforeEach(async () => {
  kmzBytes = await Bun.file(REAL_CONE_KMZ).arrayBuffer();
  currentStormsBody = await Bun.file(REAL_CS).text();
  const cs = JSON.parse(currentStormsBody) as {
    activeStorms: { trackCone?: { kmzFile?: string } }[];
  };
  coneKmzUrl = cs.activeStorms[0]!.trackCone!.kmzFile!;
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
    expect(polygon!.type).toBe(GeoJsonGeometryType.Polygon);
    expect(polygon!.coordinates[0]!.length).toBeGreaterThanOrEqual(4);
    expect(polygon!.coordinates[0]![0]).toEqual([-90.0, 22.4]);
  });

  test("returns null without a Polygon or with a ring of fewer than four vertices", () => {
    const rejected: ReadonlyArray<readonly [string, string]> = [
      ["no polygon", `<?xml version="1.0"?><kml><Document/></kml>`],
      ["short ring", `<?xml?><kml><Polygon><outerBoundaryIs><LinearRing>
<coordinates>-90,22,0 -82,28,0 -90,22,0</coordinates>
</LinearRing></outerBoundaryIs></Polygon></kml>`],
    ];
    for (const [name, kml] of rejected) {
      expect([name, parseKmlConeToGeoJSON(kml)]).toEqual([name, null]);
    }
  });

  test("throws on malformed coordinate values", () => {
    const kml = `<?xml?><kml><Polygon><outerBoundaryIs><LinearRing>
<coordinates>not,a,coord -82,28,0 -78,32,0 -84,32,0 -90,22,0</coordinates>
</LinearRing></outerBoundaryIs></Polygon></kml>`;
    expect(() => parseKmlConeToGeoJSON(kml)).toThrow("Malformed coordinate value");
  });
});

// ── End-to-end cache ───────────────────────────────────────────────

describe("getCycloneCone: KMZ fetch + cache + fallback", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCount: Record<string, number>;
  let fetchInit: Record<string, RequestInit | undefined>;
  let kmzHandler: () => Response | Promise<Response>;

  beforeEach(() => {
    __resetCyclonesCacheForTests();
    resetCycloneConeCache();
    originalFetch = globalThis.fetch;
    fetchCount = {};
    fetchInit = {};
    kmzHandler = () => new Response(kmzBytes, { status: 200 });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      fetchCount[url] = (fetchCount[url] ?? 0) + 1;
      fetchInit[url] = init;
      if (url.endsWith("/CurrentStorms.json")) {
        return new Response(currentStormsBody, { status: 200 });
      }
      if (url === coneKmzUrl) return kmzHandler();
      // Enrichment also fetches the forecast TRACK.kmz; serve it empty-ok so
      // this cone-focused spec doesn't fail on an unmocked track fetch.
      if (url.includes("TRACK.kmz")) return new Response("", { status: 503 });
      throw new Error(`Unmocked fetch: ${url}`);
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches the real cone KMZ, returns valid GeoJSON Polygon", async () => {
    await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).not.toBeNull();
    expect(result.cone!.type).toBe(GeoJsonGeometryType.Polygon);
    // Real NHC cone is a many-hundred-vertex polygon, not a 4-point stub.
    expect(result.cone!.coordinates[0]!.length).toBeGreaterThan(300);
    expect(fetchInit[coneKmzUrl]?.redirect).toBe("error");
  });

  test("rejects response-provided product URLs outside NHC origins", async () => {
    const blockedUrls = [
      "https://127.0.0.1/TRACK.kmz",
      "https://attacker.invalid/CONE.kmz",
      "https://user@www.nhc.noaa.gov/public.html",
      "https://www.nhc.noaa.gov:443/discussion.html",
      "https://www.nhc.noaa.gov:8443/discussion.html",
      "http://www.nhc.noaa.gov/wind.html",
      "https://ftp.nhc.noaa.gov.evil.example/models.dat.gz",
    ];
    currentStormsBody = JSON.stringify({
      activeStorms: [{
        id: STORM_ID,
        forecastTrack: { kmzFile: blockedUrls[0] },
        trackCone: { kmzFile: blockedUrls[1] },
        publicAdvisory: { url: blockedUrls[2] },
        forecastDiscussion: { url: blockedUrls[3] },
        windSpeedProbabilities: { url: blockedUrls[4] },
        modelGuidance: { url: blockedUrls[5] },
      }],
    });

    await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
    await getCycloneDossier(STORM_ID);

    for (const url of blockedUrls) {
      expect([url, fetchCount[url] ?? 0]).toEqual([url, 0]);
    }
  });

  test("cache returns within TTL without re-fetching", async () => {
    await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
    // fetchCyclones already warmed the cone via enrichment; reset the counter
    // so we measure only the explicit getCycloneCone calls below.
    fetchCount[coneKmzUrl] = 0;
    await getCycloneCone(STORM_ID);
    await getCycloneCone(STORM_ID);
    await getCycloneCone(STORM_ID);
    expect(fetchCount[coneKmzUrl]).toBe(0); // served from cache, no re-fetch
    expect(CONE_CACHE_TTL_MS).toBe(60 * 60_000);
  });

  test("storm not registered in cyclonesCache → cone: null", async () => {
    // Don't call fetchCyclones, stormProducts is empty.
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).toBeNull();
  });

  test("KMZ fetch HTTP error → cone: null, no throw", async () => {
    kmzHandler = () => new Response("oops", { status: 503 });
    await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
    resetCycloneConeCache(); // drop the entry enrichment cached
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).toBeNull();
  });

  test("KMZ network error → cone: null, no throw", async () => {
    kmzHandler = () => {
      throw new Error("simulated network error");
    };
    await fetchCyclones(new Date(Date.UTC(2026, 5, 4)));
    resetCycloneConeCache();
    const result = await getCycloneCone(STORM_ID);
    expect(result.cone).toBeNull();
  });
});
