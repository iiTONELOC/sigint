import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { SourceStatus } from "@shared/domain/sourceStatus";

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
  let relativeAge: typeof import("@/lib/format/timeFormat").relativeAge;

  beforeEach(async () => {
    relativeAge = (await import("@/lib/format/timeFormat")).relativeAge;
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
  let isSourceDown: typeof import("@shared/domain/sourceStatus").isSourceDown;
  let isSourceDelivering: typeof import("@shared/domain/sourceStatus").isSourceDelivering;
  let buildSourceStatusMap: typeof import("@/lib/net/sourceHealth").buildSourceStatusMap;

  beforeEach(async () => {
    const statusModule = await import("@shared/domain/sourceStatus");
    isSourceDown = statusModule.isSourceDown;
    isSourceDelivering = statusModule.isSourceDelivering;
    const healthModule = await import("@/lib/net/sourceHealth");
    buildSourceStatusMap = healthModule.buildSourceStatusMap;
  });

  test("error is down", () => {
    expect(isSourceDown(SourceStatus.Error)).toBe(true);
  });

  test("unavailable is down", () => {
    expect(isSourceDown(SourceStatus.Unavailable)).toBe(true);
  });

  test("cached is NOT down, which is how a failed refresh over retained data reads", () => {
    expect(isSourceDown(SourceStatus.Cached)).toBe(false);
  });

  test("empty is NOT down", () => {
    expect(isSourceDown(SourceStatus.Empty)).toBe(false);
  });

  test("live is NOT down", () => {
    expect(isSourceDown(SourceStatus.Live)).toBe(false);
  });

  test("loading is NOT down", () => {
    expect(isSourceDown(SourceStatus.Loading)).toBe(false);
  });

  test("undefined status is NOT down", () => {
    expect(isSourceDown(undefined)).toBe(false);
  });

  test("down never depends on a count the UI failed to fetch", () => {
    // The regression: a query timeout left the count at 0 and the chip read
    // offline while the source was live.
    expect(isSourceDown(SourceStatus.Live)).toBe(false);
    expect(isSourceDelivering(SourceStatus.Live)).toBe(true);
  });

  test("live and cached are delivering, nothing else is", () => {
    expect(isSourceDelivering(SourceStatus.Live)).toBe(true);
    expect(isSourceDelivering(SourceStatus.Cached)).toBe(true);
    expect(isSourceDelivering(SourceStatus.Empty)).toBe(false);
    expect(isSourceDelivering(SourceStatus.Loading)).toBe(false);
    expect(isSourceDelivering(SourceStatus.Error)).toBe(false);
    expect(isSourceDelivering(SourceStatus.Unavailable)).toBe(false);
  });

  test("buildSourceStatusMap keeps the reason a down source published", () => {
    const map = buildSourceStatusMap([
      { id: Domain.Aircraft, status: SourceStatus.Live, error: null },
      {
        id: Domain.Ships,
        status: SourceStatus.Error,
        error: "Duplicate dataset id: S1",
      },
    ]);
    expect(map.get(Domain.Aircraft)?.status).toBe(SourceStatus.Live);
    expect(map.get(Domain.Ships)?.error).toBe("Duplicate dataset id: S1");
    expect(map.get(Domain.Fires)).toBeUndefined();
  });
});

// ── spatialIndex ────────────────────────────────────────────────────

describe("spatialIndex", () => {
  let screenToLatLonFlat: typeof import("@/lib/geo/spatialIndex").screenToLatLonFlat;
  let screenToLatLonGlobe: typeof import("@/lib/geo/spatialIndex").screenToLatLonGlobe;

  beforeEach(async () => {
    const mod = await import("@/lib/geo/spatialIndex");
    screenToLatLonFlat = mod.screenToLatLonFlat;
    screenToLatLonGlobe = mod.screenToLatLonGlobe;
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

describe("mergeTickerPages", () => {
  let mergeTickerPages: typeof import("@/lib/ui/tickerFeed").mergeTickerPages;

  beforeEach(async () => {
    mergeTickerPages = (await import("@/lib/ui/tickerFeed")).mergeTickerPages;
  });

  function page(items: DataPoint[], priorityCount = 0) {
    return { items, priorityCount };
  }

  test("returns empty for no pages", () => {
    expect(mergeTickerPages([])).toHaveLength(0);
  });

  test("returns empty when every page is empty", () => {
    expect(mergeTickerPages([page([]), page([])])).toHaveLength(0);
  });

  test("escalated items lead, whatever page they came from", () => {
    const emergency = pt("a2", "aircraft", 36, 140, { squawk: "7700" });
    const result = mergeTickerPages([
      page([pt("q1", "quakes", 10, 20, { magnitude: 5 })]),
      page([emergency, pt("a1", "aircraft", 35, 139, { squawk: "1200" })], 1),
    ]);
    expect(result[0]!.id).toBe("a2");
  });

  test("caps at 80 items", () => {
    const items: DataPoint[] = [];
    for (let i = 0; i < 200; i++) {
      items.push(pt(`q${i}`, "quakes", i % 90, i % 180, { magnitude: 3 }));
    }
    expect(mergeTickerPages([page(items)])).toHaveLength(80);
  });

  test("round-robins across pages so one source cannot flood", () => {
    const result = mergeTickerPages([
      page([
        pt("a1", "aircraft", 35, 139, {}),
        pt("a2", "aircraft", 36, 140, {}),
      ]),
      page([pt("s1", "ships", 51, -0.1, { sog: 5 })]),
    ]);
    expect(result).toHaveLength(3);
    expect(new Set(result.map((item) => item.type)).size).toBe(2);
  });

  test("drains a longer page once the shorter ones run out", () => {
    const result = mergeTickerPages([
      page([
        pt("a1", "aircraft", 35, 139, {}),
        pt("a2", "aircraft", 36, 140, {}),
        pt("a3", "aircraft", 37, 141, {}),
      ]),
      page([pt("s1", "ships", 51, -0.1, { sog: 5 })]),
    ]);
    expect(result.map((item) => item.id).toSorted()).toEqual([
      "a1",
      "a2",
      "a3",
      "s1",
    ]);
  });
});


// ── authService (client) ────────────────────────────────────────────

describe("authenticatedFetch (client)", () => {
  let originalFetch: typeof globalThis.fetch;
  let authenticatedFetch: typeof import("@/lib/net/authService").authenticatedFetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    authenticatedFetch = (await import("@/lib/net/authService?t=" + Math.random()))
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
