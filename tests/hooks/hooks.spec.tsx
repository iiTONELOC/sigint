import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { renderHook } from "../hookHelper";
import type { DataPoint } from "@/features/base/dataPoints";
import type { DataProvider, ProviderSnapshot } from "@/features/base/types";

// ── Minimal renderHook helper ───────────────────────────────────────
// bun:test + happy-dom doesn't have @testing-library/react.
// We import from a shared helper below.

// ── Mock provider factory ───────────────────────────────────────────

function makePoint(id: string): DataPoint {
  return {
    id,
    type: "quakes",
    lat: 35,
    lon: 139,
    timestamp: new Date().toISOString(),
    data: { magnitude: 5.0 },
  } as DataPoint;
}

function makeMockProvider(opts?: {
  getDataResult?: DataPoint[];
  refreshResult?: DataPoint[];
  error?: Error | null;
}): DataProvider<DataPoint> & { simulateBoot(): Promise<void> } {
  const data = opts?.getDataResult ?? [makePoint("p1")];
  const refreshData = opts?.refreshResult ?? data;
  const error = opts?.error ?? null;

  let hydrated = false;
  let _onChange: (() => void) | null = null;
  let lastError: Error | null = null;

  const provider = {
    id: "test-provider",
    onChange(cb: (() => void) | null) {
      _onChange = cb;
    },
    mute() {
      const saved = _onChange;
      _onChange = null;
      return () => {
        _onChange = saved;
      };
    },
    unmute(restore: () => void) {
      restore();
      _onChange?.();
    },
    async hydrate() {
      return data;
    },
    async refresh() {
      if (error) {
        lastError = error;
        throw error;
      }
      hydrated = true;
      lastError = null;
      return refreshData;
    },
    async getData() {
      if (error) throw error;
      hydrated = true;
      return data;
    },
    getSnapshot(): ProviderSnapshot<DataPoint> {
      return {
        entities: hydrated ? data : [],
        version: 0,
        lastUpdatedAt: hydrated ? Date.now() : null,
        loading: !hydrated && !lastError,
        error: lastError,
      };
    },
    /** Simulate what frontend.tsx boot sequence does */
    async simulateBoot() {
      try {
        await provider.refresh();
      } catch {}
      if (_onChange) _onChange();
    },
  };

  return provider;
}

// ── useProviderData ─────────────────────────────────────────────────

describe("useProviderData", () => {
  let useProviderData: typeof import("@/features/base/useProviderData").useProviderData;

  beforeEach(async () => {
    const mod = await import("@/features/base/useProviderData");
    useProviderData = mod.useProviderData;
  });

  test("starts in loading state", async () => {
    const provider = makeMockProvider();
    const { result, waitFor } = renderHook(() =>
      useProviderData(provider, 60_000),
    );

    // Initial render
    expect(result.current.loading).toBe(true);
    expect(result.current.dataSource).toBe("loading");

    // Simulate boot sequence pushing data
    await provider.simulateBoot();
    await waitFor(() => result.current.loading === false);
    expect(result.current.data.length).toBe(1);
    expect(result.current.dataSource).toBe("live");
  });

  test("returns data after initial poll", async () => {
    const points = [makePoint("a"), makePoint("b")];
    const provider = makeMockProvider({ getDataResult: points });
    const { result, waitFor } = renderHook(() =>
      useProviderData(provider, 60_000),
    );

    await provider.simulateBoot();
    await waitFor(() => result.current.data.length === 2);
    expect(result.current.data[0]!.id).toBe("a");
    expect(result.current.data[1]!.id).toBe("b");
    expect(result.current.error).toBeNull();
  });

  test("sets error state on failure", async () => {
    const provider = makeMockProvider({
      getDataResult: [],
      error: new Error("fetch failed"),
    });
    const { result, waitFor } = renderHook(() =>
      useProviderData(provider, 60_000),
    );

    await provider.simulateBoot();
    await waitFor(() => result.current.loading === false);
    expect(result.current.dataSource).toBe("error");
  });

  test("resolves cached when error with data", async () => {
    const provider = makeMockProvider({
      getDataResult: [makePoint("cached")],
      error: new Error("stale"),
    });
    // Override getSnapshot to return data with error
    provider.getSnapshot = () => ({
      entities: [makePoint("cached")],
      version: 0,
      lastUpdatedAt: Date.now(),
      loading: false,
      error: new Error("stale"),
    });

    const { result, waitFor } = renderHook(() =>
      useProviderData(provider, 60_000),
    );

    await waitFor(() => result.current.loading === false);
    expect(result.current.data.length).toBe(1);
    expect(result.current.dataSource).toBe("cached");
  });
});

// ── useAircraftData ─────────────────────────────────────────────────

describe("useAircraftData", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns live data on successful fetch", async () => {
    const mockAircraft = [
      {
        hex: "abc123",
        flight: "UAL123 ",
        alt_baro: 10000,
        gs: 250,
        track: 90,
        baro_rate: 0,
        squawk: "1200",
        lat: 40.7,
        lon: -73.9,
      },
    ];

    // @ts-ignore
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/aircraft/states")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ac: mockAircraft }),
        } as unknown as Response;
      }
      if (url.includes("/api/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as unknown as Response;
      }
      throw new Error(`Unmocked: ${url}`);
    };

    const { useAircraftData, aircraftProvider } =
      //@ts-ignore
      await import("@/features/tracking/aircraft/hooks/useAircraftData?t=live");
    const { result, waitFor } = renderHook(() => useAircraftData(60_000));

    // Simulate boot: refresh + notify
    await aircraftProvider.refresh().catch(() => {});
    (aircraftProvider as any)._onChange?.();

    await waitFor(() => result.current.dataSource === "live", 3000);
    expect(
      result.current.data.some((d: any) => (d.data as any).icao24 === "abc123"),
    ).toBe(true);
    expect(result.current.error).toBeNull();
  });

  test("exposes requestAircraftEnrichment function", async () => {
    // @ts-ignore
    globalThis.fetch = async () => {
      throw new Error("down");
    };

    const { useAircraftData, aircraftProvider } =
      //@ts-ignore
      await import("@/features/tracking/aircraft/hooks/useAircraftData?t=enrich");
    const { result, waitFor } = renderHook(() => useAircraftData(60_000));

    // Simulate boot with failure — provider falls back to mock data
    await aircraftProvider.refresh().catch(() => {});
    (aircraftProvider as any)._onChange?.();

    await waitFor(() => result.current.loading === false);
    expect(typeof result.current.requestAircraftEnrichment).toBe("function");
  });
});

// ── useNewsData ─────────────────────────────────────────────────────

describe("useNewsData", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("starts empty and loads data", async () => {
    const mockArticles = [
      {
        id: "n1",
        title: "Test",
        url: "https://example.com",
        source: "BBC",
        publishedAt: new Date().toISOString(),
        description: "desc",
      },
    ];

    // @ts-ignore
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as unknown as Response;
      }
      if (url.includes("/api/news/latest")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: mockArticles }),
        } as unknown as Response;
      }
      throw new Error(`Unmocked: ${url}`);
    };

    const { useNewsData } = await import("@/features/news");
    const { newsProvider } = await import("@/features/news");
    const { result, waitFor } = renderHook(() => useNewsData());

    // Simulate boot: refresh + notify
    await newsProvider.refresh().catch(() => {});
    (newsProvider as any)._onChange?.();

    await waitFor(() => result.current.loading === false);
    expect(result.current.data.length).toBeGreaterThan(0);
    expect(result.current.dataSource).toBe("live");
  });
});
