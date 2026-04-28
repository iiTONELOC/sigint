import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { AircraftProvider } from "@/features/tracking/aircraft/data/provider";

// ── Mock /api/aircraft/states response (adsb.fi v3 shape) ─────────
// Provider now reads from the same-origin server proxy populated by
// src/server/api/aircraftCache.ts. authenticatedFetch makes an internal
// /api/auth/token call before the data call — the mock covers both.

// Mock records mirror what the SERVER returns post-enrichment —
// originCountry is populated server-side via countryFromIcao24 in
// src/server/api/aircraftEnrichment.ts. abc123 (hex 0xABC123) falls
// in the US block 0xA00000–0xAFFFFF → "United States".
const MOCK_AIRCRAFT = [
  {
    hex: "abc123",
    flight: "UAL123 ", // intentional trailing whitespace
    alt_baro: 30000,
    gs: 250,
    track: 90,
    baro_rate: 0,
    squawk: "1200",
    lat: 40.7,
    lon: -73.9,
    originCountry: "United States",
  },
  {
    hex: "def456",
    flight: "BAW456 ",
    alt_baro: 35000,
    gs: 200,
    track: 180,
    baro_rate: -984.25, // ≈ -5 m/s when /196.85
    lat: 51.5,
    lon: -0.1,
    originCountry: "United Kingdom",
  },
];

function mockAircraftResponse(ac: unknown[] = MOCK_AIRCRAFT, ok = true) {
  return {
    ok,
    status: ok ? 200 : 503,
    json: async () => ({ ac }),
  } as unknown as Response;
}

function installFetchMock(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes("/api/auth/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    }
    return handler(url);
  }) as typeof globalThis.fetch;
}

// ── Setup / teardown ────────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── hydrate ─────────────────────────────────────────────────────────

describe("AircraftProvider.hydrate()", () => {
  test("returns null with no cache", async () => {
    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.hydrate();
    expect(result).toBeNull();
  });
});

// ── getData ─────────────────────────────────────────────────────────

describe("AircraftProvider.getData()", () => {
  test("fetches from /api/aircraft/states and returns DataPoints", async () => {
    installFetchMock(() => mockAircraftResponse());

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.getData();

    expect(result.length).toBe(2);
    expect(result[0]!.type).toBe("aircraft");
    expect(result[0]!.id).toBe("Aabc123");
    expect((result[0]!.data as Record<string, unknown>).callsign).toBe(
      "UAL123",
    );
    expect((result[0]!.data as Record<string, unknown>).icao24).toBe("abc123");
  });

  test("returns cached data on second call without re-fetching", async () => {
    let dataFetchCount = 0;
    installFetchMock(() => {
      dataFetchCount++;
      return mockAircraftResponse();
    });

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    await provider.getData();
    expect(dataFetchCount).toBe(1);

    await provider.getData();
    expect(dataFetchCount).toBe(1);
  });

  test("deduplicates concurrent getData calls via fetchInProgress", async () => {
    let dataFetchCount = 0;
    installFetchMock(async () => {
      dataFetchCount++;
      await new Promise((r) => setTimeout(r, 50));
      return mockAircraftResponse();
    });

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });

    const [r1, r2] = await Promise.all([
      provider.getData(),
      provider.getData(),
    ]);

    expect(dataFetchCount).toBe(1);
    expect(r1).toBe(r2);
  });
});

// ── refresh ─────────────────────────────────────────────────────────

describe("AircraftProvider.refresh()", () => {
  test("falls back to mock aircraft on fetch error", async () => {
    installFetchMock(() => {
      throw new Error("Network down");
    });

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.refresh();

    expect(result.length).toBe(40);
    expect(result[0]!.type).toBe("aircraft");

    const snap = provider.getSnapshot();
    expect(snap.error).not.toBeNull();
    expect(snap.error!.message).toBe("Network down");
  });

  test("falls back to cached data on subsequent fetch error", async () => {
    let callNum = 0;
    installFetchMock(() => {
      callNum++;
      if (callNum === 1) return mockAircraftResponse();
      throw new Error("Network down");
    });

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const first = await provider.refresh();
    expect(first.length).toBe(2);

    const second = await provider.refresh();
    expect(second.length).toBe(2);
    expect(second[0]!.id).toBe("Aabc123");
  });

  test("handles non-ok response as error", async () => {
    installFetchMock(() => mockAircraftResponse([], false));

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.refresh();

    expect(result.length).toBe(40);
    const snap = provider.getSnapshot();
    expect(snap.error).not.toBeNull();
  });
});

// ── getSnapshot ─────────────────────────────────────────────────────

describe("AircraftProvider.getSnapshot()", () => {
  test("initial snapshot is empty", () => {
    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const snap = provider.getSnapshot();
    expect(snap.entities).toEqual([]);
    expect(snap.error).toBeNull();
    expect(snap.loading).toBe(false);
  });

  test("snapshot updates after successful fetch", async () => {
    installFetchMock(() => mockAircraftResponse());

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    await provider.refresh();

    const snap = provider.getSnapshot();
    expect(snap.entities.length).toBe(2);
    expect(snap.loading).toBe(false);
    expect(snap.error).toBeNull();
    expect(snap.lastUpdatedAt).not.toBeNull();
  });
});

// ── DataPoint shape ─────────────────────────────────────────────────

describe("AircraftProvider DataPoint shape", () => {
  test("produces correct DataPoint fields from adsb.fi v3 record", async () => {
    installFetchMock(() => mockAircraftResponse());

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.getData();
    const ac = result[0]!;

    expect(ac.type).toBe("aircraft");
    expect(ac.lat).toBe(40.7);
    expect(ac.lon).toBe(-73.9);
    expect(typeof ac.timestamp).toBe("string");

    const d = ac.data as Record<string, unknown>;
    expect(d.icao24).toBe("abc123");
    expect(d.callsign).toBe("UAL123");
    // Server-side enrichment derives originCountry from the icao24
    // hex-prefix block per ICAO Annex 10. The mock above includes
    // the attached value the real server would attach; the parser
    // passes it through unchanged.
    expect(d.originCountry).toBe("United States");
    expect(d.onGround).toBe(false);
    expect(typeof d.altitude).toBe("number");
    expect(typeof d.speed).toBe("number");
    expect(d.heading).toBeCloseTo(90, 5);
    expect(d.squawk).toBe("1200");
  });

  test("originCountry is '' when the server didn't attach one (hex outside the Annex 10 table)", async () => {
    // Hex 0x200000 lives in an unallocated gap of the EUR block —
    // server-side enrichment leaves originCountry empty for these,
    // so the parser must preserve the empty-string fallback that
    // every consumer currently treats as "Unknown".
    const unmapped = [
      {
        hex: "200000",
        flight: "TEST01 ",
        alt_baro: 1000,
        gs: 100,
        track: 0,
        lat: 0,
        lon: 0,
        // No originCountry — server didn't attach it.
      },
    ];
    installFetchMock(() => mockAircraftResponse(unmapped));
    const provider = new AircraftProvider({
      cacheKey: `ac-test-unmapped-${Math.random()}`,
    });
    const result = await provider.getData();
    const d = result[0]!.data as Record<string, unknown>;
    expect(d.icao24).toBe("200000");
    expect(d.originCountry).toBe("");
  });
});

// ── mute() / unmute() — mirrors BaseProvider for frontend.tsx batch ──

describe("AircraftProvider.mute() / unmute()", () => {
  test("mute() returns a restore token of type function", () => {
    const provider = new AircraftProvider({
      cacheKey: `ac-mute-${Math.random()}`,
    });
    const restore = provider.mute();
    expect(typeof restore).toBe("function");
    provider.unmute(restore);
  });

  test("unmute(restore) re-installs the prior callback and fires once", () => {
    const provider = new AircraftProvider({
      cacheKey: `ac-unmute-${Math.random()}`,
    });
    let calls = 0;
    provider.onChange(() => {
      calls++;
    });

    const restore = provider.mute();
    expect(calls).toBe(0);

    provider.unmute(restore);
    expect(calls).toBe(1);
  });

  test("after mute() no callback fires until unmute() runs", () => {
    const provider = new AircraftProvider({
      cacheKey: `ac-mute-noop-${Math.random()}`,
    });
    let calls = 0;
    provider.onChange(() => {
      calls++;
    });

    const restore = provider.mute();
    provider.unmute(restore);
    expect(calls).toBe(1);
  });
});
