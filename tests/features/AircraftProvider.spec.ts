import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { AircraftProvider } from "@/features/tracking/aircraft/data/provider";
import type { DataPoint } from "@/features/base/dataPoints";

// ── Mock OpenSky response ───────────────────────────────────────────

const MOCK_STATES = [
  // [icao24, callsign, origin, ?, ?, lon, lat, ?, onGround, velocity, heading, vertRate, ?, geoAlt, squawk]
  [
    "abc123",
    "UAL123 ",
    "United States",
    null,
    null,
    -73.9,
    40.7,
    null,
    false,
    250,
    90,
    0,
    null,
    10000,
    "1200",
  ],
  [
    "def456",
    "BAW456 ",
    "United Kingdom",
    null,
    null,
    -0.1,
    51.5,
    null,
    false,
    200,
    180,
    -5,
    null,
    35000,
    null,
  ],
];

function mockOpenSkyResponse(states: any[] = MOCK_STATES, ok = true) {
  return {
    ok,
    status: ok ? 200 : 503,
    json: async () => ({ states }),
  } as unknown as Response;
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
  test("fetches from OpenSky and returns DataPoints", async () => {
    //@ts-ignore
    globalThis.fetch = async () => mockOpenSkyResponse();

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.getData();

    expect(result.length).toBe(2);
    expect(result[0]!.type).toBe("aircraft");
    expect(result[0]!.id).toBe("Aabc123");
    expect((result[0]!.data as any).callsign).toBe("UAL123");
    expect((result[0]!.data as any).icao24).toBe("abc123");
  });

  test("returns cached data on second call without re-fetching", async () => {
    let fetchCount = 0;
    //@ts-ignore
    globalThis.fetch = async () => {
      fetchCount++;
      return mockOpenSkyResponse();
    };

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    await provider.getData();
    expect(fetchCount).toBe(1);

    await provider.getData();
    expect(fetchCount).toBe(1);
  });

  test("deduplicates concurrent getData calls via fetchInProgress", async () => {
    let fetchCount = 0;
    //@ts-ignore
    globalThis.fetch = async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 50));
      return mockOpenSkyResponse();
    };

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });

    // Fire two concurrent calls
    const [r1, r2] = await Promise.all([
      provider.getData(),
      provider.getData(),
    ]);

    expect(fetchCount).toBe(1);
    expect(r1).toBe(r2);
  });
});

// ── refresh ─────────────────────────────────────────────────────────

describe("AircraftProvider.refresh()", () => {
  test("falls back to mock aircraft on fetch error", async () => {
    //@ts-ignore
    globalThis.fetch = async () => {
      throw new Error("Network down");
    };

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.refresh();

    // Should return generateMockAircraft() — 40 items
    expect(result.length).toBe(40);
    expect(result[0]!.type).toBe("aircraft");

    const snap = provider.getSnapshot();
    expect(snap.error).not.toBeNull();
    expect(snap.error!.message).toBe("Network down");
  });

  test("falls back to cached data on subsequent fetch error", async () => {
    let callNum = 0;
    //@ts-ignore
    globalThis.fetch = async () => {
      callNum++;
      if (callNum === 1) return mockOpenSkyResponse();
      throw new Error("Network down");
    };

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const first = await provider.refresh();
    expect(first.length).toBe(2);

    const second = await provider.refresh();
    // Falls back to cached real data, not mock
    expect(second.length).toBe(2);
    expect(second[0]!.id).toBe("Aabc123");
  });

  test("handles non-ok response as error", async () => {
    //@ts-ignore
    globalThis.fetch = async () => mockOpenSkyResponse([], false);

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.refresh();

    // No cache, falls back to mock
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
    //@ts-ignore
    globalThis.fetch = async () => mockOpenSkyResponse();

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
  test("produces correct DataPoint fields from OpenSky state vector", async () => {
    //@ts-ignore
    globalThis.fetch = async () => mockOpenSkyResponse();

    const provider = new AircraftProvider({
      cacheKey: `ac-test-${Math.random()}`,
    });
    const result = await provider.getData();
    const ac = result[0]!;

    expect(ac.type).toBe("aircraft");
    expect(ac.lat).toBe(40.7);
    expect(ac.lon).toBe(-73.9);
    expect(typeof ac.timestamp).toBe("string");

    const d = ac.data as any;
    expect(d.icao24).toBe("abc123");
    expect(d.callsign).toBe("UAL123");
    expect(d.originCountry).toBe("United States");
    expect(d.onGround).toBe(false);
    expect(typeof d.altitude).toBe("number");
    expect(typeof d.speed).toBe("number");
    expect(d.heading).toBe(90);
    expect(d.squawk).toBe("1200");
  });
});
