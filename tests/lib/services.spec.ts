import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { DataPoint } from "@/features/base/dataPoints";

// ── Helpers ─────────────────────────────────────────────────────────

function pt(
  id: string,
  type: string,
  lat: number,
  lon: number,
  data?: any,
): DataPoint {
  return {
    id,
    type,
    lat,
    lon,
    timestamp: new Date().toISOString(),
    data: data ?? {},
  } as DataPoint;
}

// ── timeFormat ──────────────────────────────────────────────────────

describe("relativeAge", () => {
  let relativeAge: typeof import("@/lib/timeFormat").relativeAge;

  beforeEach(async () => {
    relativeAge = (await import("@/lib/timeFormat")).relativeAge;
  });

  test("null/undefined returns LIVE (compact)", () => {
    expect(relativeAge(null)).toBe("LIVE");
    expect(relativeAge(undefined)).toBe("LIVE");
  });

  test("null/undefined returns just now (verbose)", () => {
    expect(relativeAge(null, "verbose")).toBe("just now");
  });

  test("recent timestamp returns LIVE", () => {
    expect(relativeAge(Date.now() - 10_000)).toBe("LIVE");
  });

  test("5 minutes ago", () => {
    expect(relativeAge(Date.now() - 5 * 60_000)).toBe("5m");
    expect(relativeAge(Date.now() - 5 * 60_000, "verbose")).toBe("5m ago");
  });

  test("2 hours ago", () => {
    expect(relativeAge(Date.now() - 2 * 3600_000)).toBe("2h");
  });

  test("3 days ago", () => {
    expect(relativeAge(Date.now() - 3 * 86400_000)).toBe("3d");
  });

  test("accepts ISO string", () => {
    const ts = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(relativeAge(ts)).toBe("10m");
  });

  test("invalid input returns LIVE", () => {
    expect(relativeAge("garbage")).toBe("LIVE");
  });
});

// ── sourceHealth ────────────────────────────────────────────────────

describe("sourceHealth", () => {
  let isSourceDown: typeof import("@/lib/sourceHealth").isSourceDown;
  let buildSourceStatusMap: typeof import("@/lib/sourceHealth").buildSourceStatusMap;

  beforeEach(async () => {
    const mod = await import("@/lib/sourceHealth");
    isSourceDown = mod.isSourceDown;
    buildSourceStatusMap = mod.buildSourceStatusMap;
  });

  test("error with 0 count is down", () => {
    expect(isSourceDown("error", 0)).toBe(true);
  });

  test("unavailable with 0 count is down", () => {
    expect(isSourceDown("unavailable", 0)).toBe(true);
  });

  test("error with data is NOT down", () => {
    expect(isSourceDown("error", 5)).toBe(false);
  });

  test("empty is NOT down", () => {
    expect(isSourceDown("empty", 0)).toBe(false);
  });

  test("live is NOT down", () => {
    expect(isSourceDown("live", 100)).toBe(false);
  });

  test("undefined status is NOT down", () => {
    expect(isSourceDown(undefined, 0)).toBe(false);
  });

  test("buildSourceStatusMap creates lookup", () => {
    const map = buildSourceStatusMap([
      { id: "aircraft", label: "AIRCRAFT", status: "live" },
      { id: "ships", label: "SHIPS", status: "cached" },
    ]);
    expect(map.get("aircraft")).toBe("live");
    expect(map.get("ships")).toBe("cached");
    expect(map.get("fires")).toBeUndefined();
  });
});

// ── spatialIndex ────────────────────────────────────────────────────

describe("spatialIndex", () => {
  let buildSpatialGrid: typeof import("@/lib/spatialIndex").buildSpatialGrid;
  let queryNearest: typeof import("@/lib/spatialIndex").queryNearest;
  let screenToLatLonFlat: typeof import("@/lib/spatialIndex").screenToLatLonFlat;
  let screenToLatLonGlobe: typeof import("@/lib/spatialIndex").screenToLatLonGlobe;

  beforeEach(async () => {
    const mod = await import("@/lib/spatialIndex");
    buildSpatialGrid = mod.buildSpatialGrid;
    queryNearest = mod.queryNearest;
    screenToLatLonFlat = mod.screenToLatLonFlat;
    screenToLatLonGlobe = mod.screenToLatLonGlobe;
  });

  test("buildSpatialGrid indexes all points", () => {
    const data = [pt("a", "quakes", 35, 139), pt("b", "quakes", -33, 151)];
    const grid = buildSpatialGrid(data);
    expect(grid.size).toBe(2);
  });

  test("queryNearest finds nearby points", () => {
    const data = [
      pt("a", "quakes", 35, 139),
      pt("b", "quakes", 35.5, 139.5),
      pt("c", "quakes", -33, 151),
    ];
    const grid = buildSpatialGrid(data);
    const results = queryNearest(grid, 35.2, 139.2, 2);
    expect(results.length).toBe(2);
    expect(results.some((r) => r.id === "a")).toBe(true);
    expect(results.some((r) => r.id === "b")).toBe(true);
  });

  test("queryNearest excludes distant points", () => {
    const data = [pt("a", "quakes", 35, 139), pt("b", "quakes", -33, 151)];
    const grid = buildSpatialGrid(data);
    const results = queryNearest(grid, 35, 139, 1);
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("a");
  });

  test("empty grid returns empty results", () => {
    const grid = buildSpatialGrid([]);
    expect(grid.size).toBe(0);
    expect(queryNearest(grid, 0, 0, 10).length).toBe(0);
  });

  test("screenToLatLonFlat returns center at center", () => {
    const result = screenToLatLonFlat(500, 250, 500, 250, 1000, 500);
    expect(result.lat).toBeCloseTo(0, 1);
    expect(result.lon).toBeCloseTo(0, 1);
  });

  test("screenToLatLonGlobe returns null outside sphere", () => {
    const result = screenToLatLonGlobe(0, 0, 500, 250, 200, 0, 0);
    expect(result).toBeNull();
  });

  test("screenToLatLonGlobe returns coords at center", () => {
    const result = screenToLatLonGlobe(500, 250, 500, 250, 200, 0, 0);
    expect(result).not.toBeNull();
    expect(typeof result!.lat).toBe("number");
    expect(typeof result!.lon).toBe("number");
  });
});

// ── tickerFeed ──────────────────────────────────────────────────────

describe("buildTickerItems", () => {
  let buildTickerItems: typeof import("@/lib/tickerFeed").buildTickerItems;

  beforeEach(async () => {
    buildTickerItems = (await import("@/lib/tickerFeed")).buildTickerItems;
  });

  test("returns empty for empty data", () => {
    const result = buildTickerItems([], {}, {});
    expect(result).toHaveLength(0);
  });

  test("includes airborne aircraft", () => {
    const data = [
      pt("a1", "aircraft", 35, 139, { onGround: false, callsign: "UAL123" }),
    ];
    const result = buildTickerItems(data, {}, {});
    expect(result.length).toBe(1);
  });

  test("excludes grounded aircraft", () => {
    const data = [
      pt("a1", "aircraft", 35, 139, { onGround: true, callsign: "UAL123" }),
    ];
    const result = buildTickerItems(data, {}, {});
    expect(result.length).toBe(0);
  });

  test("excludes moored ships (sog < 0.5)", () => {
    const data = [pt("s1", "ships", 51, -0.1, { sog: 0.1, name: "TEST" })];
    const result = buildTickerItems(data, {}, {});
    expect(result.length).toBe(0);
  });

  test("includes moving ships", () => {
    const data = [pt("s1", "ships", 51, -0.1, { sog: 5.0, name: "TEST" })];
    const result = buildTickerItems(data, {}, {});
    expect(result.length).toBe(1);
  });

  test("emergency aircraft appear first", () => {
    const data = [
      pt("a1", "aircraft", 35, 139, { onGround: false, squawk: "1200" }),
      pt("a2", "aircraft", 36, 140, { onGround: false, squawk: "7700" }),
      pt("q1", "quakes", 10, 20, { magnitude: 5.0 }),
    ];
    const result = buildTickerItems(data, {}, {});
    expect(result[0]!.id).toBe("a2");
  });

  test("caps at 80 items", () => {
    const data: DataPoint[] = [];
    for (let i = 0; i < 200; i++) {
      data.push(pt(`q${i}`, "quakes", i % 90, i % 180, { magnitude: 3 }));
    }
    const result = buildTickerItems(data, {}, {});
    expect(result.length).toBeLessThanOrEqual(80);
  });

  test("interleaves across types", () => {
    const data = [
      pt("a1", "aircraft", 35, 139, { onGround: false }),
      pt("a2", "aircraft", 36, 140, { onGround: false }),
      pt("s1", "ships", 51, -0.1, { sog: 5 }),
      pt("q1", "quakes", 10, 20, {}),
    ];
    const result = buildTickerItems(data, {}, {});
    const types = result.map((r) => r.type);
    // Not all same type in a row
    expect(new Set(types).size).toBeGreaterThan(1);
  });
});

// ── uiSelectors ─────────────────────────────────────────────────────

describe("uiSelectors", () => {
  let selectLayerCounts: typeof import("@/lib/uiSelectors").selectLayerCounts;
  let selectActiveCount: typeof import("@/lib/uiSelectors").selectActiveCount;
  let selectAvailableAircraftCountries: typeof import("@/lib/uiSelectors").selectAvailableAircraftCountries;

  beforeEach(async () => {
    const mod = await import("@/lib/uiSelectors");
    selectLayerCounts = mod.selectLayerCounts;
    selectActiveCount = mod.selectActiveCount;
    selectAvailableAircraftCountries = mod.selectAvailableAircraftCountries;
  });

  test("selectLayerCounts counts per type with filter", () => {
    const data = [
      pt("a1", "aircraft", 35, 139, { onGround: false }),
      pt("a2", "aircraft", 36, 140, { onGround: false }),
      pt("q1", "quakes", 10, 20, { magnitude: 5 }),
    ];
    const filters = {
      aircraft: {
        enabled: true,
        showAirborne: true,
        showGround: true,
        squawks: new Set(),
        countries: new Set(),
        milFilter: "all",
      },
      quakes: { enabled: true, minMagnitude: 0 },
    };
    const counts = selectLayerCounts(data, filters);
    expect(counts.aircraft).toBe(2);
    expect(counts.quakes).toBe(1);
  });

  test("selectActiveCount totals all visible", () => {
    const data = [
      pt("a1", "aircraft", 35, 139, {}),
      pt("q1", "quakes", 10, 20, {}),
    ];
    const filters = {
      aircraft: {
        enabled: true,
        showAirborne: true,
        showGround: true,
        squawks: new Set(),
        countries: new Set(),
        milFilter: "all",
      },
      quakes: { enabled: true, minMagnitude: 0 },
    };
    const count = selectActiveCount(data, filters);
    expect(count).toBe(2);
  });

  test("selectAvailableAircraftCountries sorted by frequency", () => {
    const data = [
      pt("a1", "aircraft", 35, 139, { originCountry: "United States" }),
      pt("a2", "aircraft", 36, 140, { originCountry: "United States" }),
      pt("a3", "aircraft", 37, 141, { originCountry: "Japan" }),
      pt("q1", "quakes", 10, 20, {}),
    ];
    const countries = selectAvailableAircraftCountries(data);
    expect(countries[0]).toBe("United States");
    expect(countries[1]).toBe("Japan");
    expect(countries.length).toBe(2);
  });

  test("ignores non-aircraft for countries", () => {
    const data = [pt("q1", "quakes", 10, 20, { originCountry: "Chile" })];
    expect(selectAvailableAircraftCountries(data)).toHaveLength(0);
  });
});

// ── authService (client) ────────────────────────────────────────────

describe("authenticatedFetch (client)", () => {
  let originalFetch: typeof globalThis.fetch;
  let authenticatedFetch: typeof import("@/lib/authService").authenticatedFetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    authenticatedFetch = (await import("@/lib/authService?t=" + Math.random()))
      .authenticatedFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sends request with credentials", async () => {
    let capturedInit: RequestInit | undefined;
    // @ts-ignore
    globalThis.fetch = async (url: string, init?: RequestInit) => {
      capturedInit = init;
      if (url.includes("/api/auth/token")) {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    };

    await authenticatedFetch("/api/test");
    expect(capturedInit?.credentials).toBe("same-origin");
  });

  test("retries on 401", async () => {
    let callCount = 0;
    // @ts-ignore
    globalThis.fetch = async (url: string, init?: RequestInit) => {
      if (url.includes("/api/auth/token")) {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 401 } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    };

    const res = await authenticatedFetch("/api/test");
    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
  });
});
