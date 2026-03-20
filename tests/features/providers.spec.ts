import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { earthquakeProvider } from "@/features/environmental/earthquake/data/provider";
import { shipProvider } from "@/features/tracking/ships/data/provider";
import { fireProvider } from "@/features/environmental/fires/data/provider";
import { weatherProvider } from "@/features/environmental/weather/data/provider";
import { gdeltProvider } from "@/features/intel/events/data/provider";

// ── Mock responses ──────────────────────────────────────────────────

const MOCK_USGS = {
  features: [
    {
      id: "us7000test",
      properties: {
        mag: 5.2,
        place: "42km NE of Tokyo",
        time: Date.now(),
        felt: 100,
        tsunami: 0,
        alert: null,
        sig: 450,
        magType: "mww",
        type: "earthquake",
        status: "reviewed",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000test",
      },
      geometry: { coordinates: [139.7, 35.7, 30] },
    },
  ],
};

const MOCK_SHIPS = {
  data: [
    {
      mmsi: 123456789,
      lat: 51.5,
      lon: -0.1,
      sog: 12.5,
      cog: 180,
      heading: 175,
      navStatus: 0,
      navStatusLabel: "Under way using engine",
      lastSeen: Date.now(),
      name: "TEST VESSEL",
      callSign: "ABCD",
      imo: 9876543,
      shipType: 70,
      shipTypeLabel: "Cargo",
      destination: "LONDON",
      draught: 8.5,
      length: 200,
      width: 30,
    },
  ],
  vesselCount: 1,
  connected: true,
};

const MOCK_FIRES = {
  data: [
    {
      lat: -15.5,
      lon: 28.3,
      brightness: 340,
      scan: 0.5,
      track: 0.4,
      acqDate: "2025-01-15",
      acqTime: "1430",
      satellite: "N",
      instrument: "VIIRS",
      confidence: "nominal",
      version: "2.0NRT",
      brightT31: 290,
      frp: 25.5,
      daynight: "D",
    },
  ],
  fetchedAt: Date.now(),
  fireCount: 1,
};

const MOCK_WEATHER = {
  type: "FeatureCollection",
  features: [
    {
      id: "urn:oid:2.49.0.1.840.0.test",
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-90, 35],
            [-89, 35],
            [-89, 36],
            [-90, 36],
            [-90, 35],
          ],
        ],
      },
      properties: {
        id: "urn:oid:2.49.0.1.840.0.test",
        event: "Tornado Warning",
        severity: "Extreme",
        certainty: "Observed",
        urgency: "Immediate",
        headline: "Tornado Warning for Test County",
        description: "A tornado has been sighted.",
        instruction: "Take cover immediately.",
        senderName: "NWS Test",
        areaDesc: "Test County",
        onset: new Date().toISOString(),
        expires: new Date(Date.now() + 3600000).toISOString(),
        effective: new Date().toISOString(),
        sent: new Date().toISOString(),
        status: "Actual",
        messageType: "Alert",
        category: "Met",
        response: "Shelter",
      },
    },
  ],
};

const MOCK_GDELT = {
  data: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [36.8, -1.3] },
        properties: {
          name: "Nairobi, Kenya",
          html: '<a href="https://example.com">Protests in Nairobi</a>',
          url: "https://example.com/article1",
          urltone: "-8.5",
          urlpubtimedate: new Date().toISOString(),
          urlsourcecountry: "Kenya",
          domain: "example.com",
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [44.4, 33.3] },
        properties: {
          name: "Baghdad, Iraq",
          html: '<a href="https://example.com/2">Conflict in Baghdad</a>',
          url: "https://example.com/article2",
          urltone: "-12.0",
          urlpubtimedate: new Date().toISOString(),
          urlsourcecountry: "Iraq",
          domain: "example.com",
        },
      },
    ],
  },
  fetchedAt: Date.now(),
};

// ── Fetch mock ──────────────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;
let mockResponses: Map<string, { ok: boolean; body: unknown }>;

function setupMock() {
  mockResponses = new Map();
  // @ts-ignore
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    // Auth endpoint
    if (url.includes("/api/auth/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    }

    for (const [pattern, resp] of mockResponses) {
      if (url.includes(pattern)) {
        return {
          ok: resp.ok,
          status: resp.ok ? 200 : 503,
          json: async () => resp.body,
        } as unknown as Response;
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  };
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  setupMock();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Earthquake ──────────────────────────────────────────────────────

describe("earthquakeProvider", () => {
  test("fetches and transforms USGS data", async () => {
    mockResponses.set("earthquake.usgs.gov", { ok: true, body: MOCK_USGS });
    const result = await earthquakeProvider.refresh();
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("quakes");
    expect(result[0]!.id).toBe("Qus7000test");
    expect(result[0]!.lat).toBe(35.7);
    expect(result[0]!.lon).toBe(139.7);
  });

  test("DataPoint shape", async () => {
    mockResponses.set("earthquake.usgs.gov", { ok: true, body: MOCK_USGS });
    const result = await earthquakeProvider.refresh();
    const d = result[0]!.data as any;
    expect(d.magnitude).toBe(5.2);
    expect(d.depth).toBe(30);
    expect(d.location).toBe("42km NE of Tokyo");
    expect(d.tsunami).toBe(false);
    expect(d.felt).toBe(100);
    expect(typeof d.url).toBe("string");
  });

  test("error fallback", async () => {
    mockResponses.set("earthquake.usgs.gov", { ok: false, body: {} });
    const result = await earthquakeProvider.refresh();
    const snap = earthquakeProvider.getSnapshot();
    expect(snap.error).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── Ships ───────────────────────────────────────────────────────────

describe("shipProvider", () => {
  test("fetches and transforms AIS data", async () => {
    mockResponses.set("/api/ships/latest", { ok: true, body: MOCK_SHIPS });
    const result = await shipProvider.refresh();
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("ships");
    expect(result[0]!.id).toBe("S123456789");
    expect(result[0]!.lat).toBe(51.5);
    expect(result[0]!.lon).toBe(-0.1);
  });

  test("DataPoint shape", async () => {
    mockResponses.set("/api/ships/latest", { ok: true, body: MOCK_SHIPS });
    const result = await shipProvider.refresh();
    const d = result[0]!.data as any;
    expect(d.mmsi).toBe(123456789);
    expect(d.name).toBe("TEST VESSEL");
    expect(d.vesselType).toBe("Cargo");
    expect(d.sog).toBe(12.5);
    expect(d.heading).toBe(175);
    expect(d.destination).toBe("LONDON");
    expect(typeof d.speedMps).toBe("number");
  });

  test("filters null island", async () => {
    const body = {
      ...MOCK_SHIPS,
      data: [{ ...MOCK_SHIPS.data[0], lat: 0, lon: 0 }],
    };
    mockResponses.set("/api/ships/latest", { ok: true, body });
    const result = await shipProvider.refresh();
    // New fetch returns 0 valid points, but cache retains previous data
    // Verify the null island point was filtered (not added to result)
    const hasNullIsland = result.some((p) => p.lat === 0 && p.lon === 0);
    expect(hasNullIsland).toBe(false);
  });
});

// ── Fires ───────────────────────────────────────────────────────────

describe("fireProvider", () => {
  test("fetches and transforms FIRMS data", async () => {
    mockResponses.set("/api/fires/latest", { ok: true, body: MOCK_FIRES });
    const result = await fireProvider.refresh();
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("fires");
    expect(result[0]!.id).toStartWith("FI");
    expect(result[0]!.lat).toBe(-15.5);
    expect(result[0]!.lon).toBe(28.3);
  });

  test("DataPoint shape", async () => {
    mockResponses.set("/api/fires/latest", { ok: true, body: MOCK_FIRES });
    const result = await fireProvider.refresh();
    const d = result[0]!.data as any;
    expect(d.frp).toBe(25.5);
    expect(d.brightness).toBe(340);
    expect(d.confidence).toBe("nominal");
    expect(d.satellite).toBe("N");
    expect(d.daynight).toBe("D");
  });

  test("parses acquisition timestamp", async () => {
    mockResponses.set("/api/fires/latest", { ok: true, body: MOCK_FIRES });
    const result = await fireProvider.refresh();
    expect(result[0]!.timestamp).toContain("2025-01-15");
    expect(result[0]!.timestamp).toContain("14:30");
  });
});

// ── Weather ─────────────────────────────────────────────────────────

describe("weatherProvider", () => {
  test("fetches and transforms NWS data", async () => {
    mockResponses.set("api.weather.gov", { ok: true, body: MOCK_WEATHER });
    const result = await weatherProvider.refresh();
    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("weather");
    expect(result[0]!.id).toStartWith("WX");
  });

  test("computes polygon centroid", async () => {
    mockResponses.set("api.weather.gov", { ok: true, body: MOCK_WEATHER });
    const result = await weatherProvider.refresh();
    // Centroid of [[-90,35],[-89,35],[-89,36],[-90,36],[-90,35]]
    expect(result[0]!.lat).toBeCloseTo(35.4, 0);
    expect(result[0]!.lon).toBeCloseTo(-89.6, 0);
  });

  test("DataPoint shape", async () => {
    mockResponses.set("api.weather.gov", { ok: true, body: MOCK_WEATHER });
    const result = await weatherProvider.refresh();
    const d = result[0]!.data as any;
    expect(d.event).toBe("Tornado Warning");
    expect(d.severity).toBe("Extreme");
    expect(d.certainty).toBe("Observed");
    expect(d.urgency).toBe("Immediate");
    expect(d.areaDesc).toBe("Test County");
  });

  test("skips features without geometry", async () => {
    const body = {
      type: "FeatureCollection",
      features: [{ ...MOCK_WEATHER.features[0], geometry: null }],
    };
    mockResponses.set("api.weather.gov", { ok: true, body });
    const result = await weatherProvider.refresh();
    // New fetch returns 0 valid points, but stale retention keeps cache
    // Verify no null-geometry points were added
    const hasNullGeo = result.some((p) => p.lat === 0 && p.lon === 0);
    expect(hasNullGeo).toBe(false);
  });
});

// ── GDELT Events ────────────────────────────────────────────────────

describe("gdeltProvider", () => {
  test("fetches and transforms GDELT data", async () => {
    mockResponses.set("/api/events/latest", { ok: true, body: MOCK_GDELT });
    const result = await gdeltProvider.refresh();
    expect(result.length).toBe(2);
    expect(result[0]!.type).toBe("events");
    expect(result[0]!.id).toStartWith("GE");
  });

  test("DataPoint shape", async () => {
    mockResponses.set("/api/events/latest", { ok: true, body: MOCK_GDELT });
    const result = await gdeltProvider.refresh();
    const d = result[0]!.data as any;
    expect(d.headline).toBe("Protests in Nairobi");
    expect(d.url).toBe("https://example.com/article1");
    expect(d.sourceCountry).toBe("Kenya");
    expect(d.source).toBe("example.com");
    expect(typeof d.severity).toBe("number");
    expect(typeof d.tone).toBe("number");
  });

  test("derives severity from tone", async () => {
    mockResponses.set("/api/events/latest", { ok: true, body: MOCK_GDELT });
    const result = await gdeltProvider.refresh();
    // tone -8.5 => severity 3 (Tension), tone -12.0 => severity 4 (Conflict)
    const d0 = result[0]!.data as any;
    const d1 = result[1]!.data as any;
    expect(d0.severity).toBe(3);
    expect(d0.category).toBe("Tension");
    expect(d1.severity).toBe(4);
    expect(d1.category).toBe("Conflict");
  });

  test("extracts headline from HTML", async () => {
    mockResponses.set("/api/events/latest", { ok: true, body: MOCK_GDELT });
    const result = await gdeltProvider.refresh();
    expect((result[0]!.data as any).headline).toBe("Protests in Nairobi");
    expect((result[1]!.data as any).headline).toBe("Conflict in Baghdad");
  });

  test("deduplicates by URL via mergeFn", async () => {
    mockResponses.set("/api/events/latest", { ok: true, body: MOCK_GDELT });
    // First fetch
    await gdeltProvider.refresh();
    // Second fetch with same URLs
    const result = await gdeltProvider.refresh();
    // Should not double the count
    expect(result.length).toBe(2);
  });
});
