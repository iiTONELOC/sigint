import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// ── Mock all fetch endpoints ────────────────────────────────────────

const MOCK_OPENSKY = {
  states: [
    [
      "abc123",
      "UAL123 ",
      "US",
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
  ],
};
const MOCK_USGS = {
  features: [
    {
      id: "q1",
      properties: {
        mag: 5.2,
        place: "Tokyo",
        time: Date.now(),
        felt: null,
        tsunami: 0,
        alert: null,
        sig: 450,
        magType: "mww",
        type: "earthquake",
        status: "reviewed",
        url: "",
      },
      geometry: { coordinates: [139.7, 35.7, 30] },
    },
  ],
};
const MOCK_NWS = { type: "FeatureCollection", features: [] };
const MOCK_SHIPS = { data: [], vesselCount: 0, connected: true };
const MOCK_FIRES = { data: [], fetchedAt: Date.now(), fireCount: 0 };
const MOCK_EVENTS = {
  data: { type: "FeatureCollection", features: [] },
  fetchedAt: Date.now(),
};
const MOCK_NEWS = {
  items: [
    {
      id: "n1",
      title: "Test",
      url: "https://example.com",
      source: "BBC",
      publishedAt: new Date().toISOString(),
      description: "desc",
    },
  ],
};

let originalFetch: typeof globalThis.fetch;

function mockAllFetch() {
  // @ts-ignore
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/token"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as unknown as Response;
    if (url.includes("opensky"))
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_OPENSKY,
      } as unknown as Response;
    if (url.includes("earthquake.usgs.gov"))
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_USGS,
      } as unknown as Response;
    if (url.includes("api.weather.gov"))
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_NWS,
      } as unknown as Response;
    if (url.includes("/api/ships"))
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_SHIPS,
      } as unknown as Response;
    if (url.includes("/api/fires"))
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_FIRES,
      } as unknown as Response;
    if (url.includes("/api/events"))
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_EVENTS,
      } as unknown as Response;
    if (url.includes("/api/news"))
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_NEWS,
      } as unknown as Response;
    if (url.includes("/api/aircraft"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ item: null }),
      } as unknown as Response;
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response;
  };
}

// ── Render helper using ref to always get latest context ────────────

async function renderDataContext() {
  const { DataProvider, useData } = await import(
    "@/context/DataContext?t=" + Math.random()
  );
  const { ThemeProvider } = await import("@/context/ThemeContext");

  const ref = { current: null as any };

  function Consumer() {
    ref.current = useData();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(DataProvider, null, React.createElement(Consumer)),
      ),
    );
  });

  const waitFor = async (pred: () => boolean, timeout = 5000) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > timeout) throw new Error("waitFor timed out");
      await new Promise((r) => setTimeout(r, 20));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  };

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { ref, waitFor, unmount };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("DataContext", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockAllFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("provides context value with all expected keys", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    await waitFor(() => ref.current.allData.length > 0);

    const ctx = ref.current;
    expect(Array.isArray(ctx.allData)).toBe(true);
    expect(Array.isArray(ctx.newsArticles)).toBe(true);
    expect(Array.isArray(ctx.tickerItems)).toBe(true);
    expect(Array.isArray(ctx.dataSources)).toBe(true);
    expect(ctx.spatialGrid).toBeDefined();
    expect(ctx.filteredIds).toBeInstanceOf(Set);
    expect(typeof ctx.activeCount).toBe("number");
    expect(typeof ctx.flat).toBe("boolean");
    expect(typeof ctx.autoRotate).toBe("boolean");
    expect(typeof ctx.chromeHidden).toBe("boolean");
    expect(ctx.colorMap).toBeDefined();
    expect(ctx.correlation).toBeDefined();

    unmount();
  });

  test("allData merges all data sources", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    await waitFor(() => ref.current.allData.length > 0);

    const types = new Set(ref.current.allData.map((d: any) => d.type));
    expect(types.has("aircraft")).toBe(true);

    unmount();
  });

  test("selected starts null", async () => {
    const { ref, unmount } = await renderDataContext();
    expect(ref.current.selected).toBeNull();
    expect(ref.current.selectedCurrent).toBeNull();
    unmount();
  });

  test("setSelected updates selection", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    await waitFor(() => ref.current.allData.length > 0);

    const item = ref.current.allData[0]!;
    act(() => {
      ref.current.setSelected(item);
    });

    await waitFor(() => ref.current.selected !== null);
    expect(ref.current.selected!.id).toBe(item.id);

    unmount();
  });

  test("selectedCurrent tracks fresh data", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    await waitFor(() => ref.current.allData.length > 0);

    const item = ref.current.allData[0]!;
    act(() => {
      ref.current.setSelected(item);
    });

    await waitFor(() => ref.current.selectedCurrent !== null);
    expect(ref.current.selectedCurrent!.id).toBe(item.id);

    unmount();
  });

  test("isolateMode starts null", async () => {
    const { ref, unmount } = await renderDataContext();
    expect(ref.current.isolateMode).toBeNull();
    unmount();
  });

  test("setIsolateMode changes mode", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    act(() => {
      ref.current.setIsolateMode("focus");
    });
    await waitFor(() => ref.current.isolateMode === "focus");
    expect(ref.current.isolateMode).toBe("focus");

    act(() => {
      ref.current.setIsolateMode("solo");
    });
    await waitFor(() => ref.current.isolateMode === "solo");
    expect(ref.current.isolateMode).toBe("solo");

    act(() => {
      ref.current.setIsolateMode(null);
    });
    await waitFor(() => ref.current.isolateMode === null);
    expect(ref.current.isolateMode).toBeNull();

    unmount();
  });

  test("layers default all enabled", async () => {
    const { ref, unmount } = await renderDataContext();
    expect(ref.current.layers.ships).toBe(true);
    expect(ref.current.layers.events).toBe(true);
    expect(ref.current.layers.quakes).toBe(true);
    expect(ref.current.layers.fires).toBe(true);
    expect(ref.current.layers.weather).toBe(true);
    unmount();
  });

  test("toggleLayer flips layer state", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    expect(ref.current.layers.ships).toBe(true);
    act(() => {
      ref.current.toggleLayer("ships");
    });
    await waitFor(() => ref.current.layers.ships === false);
    expect(ref.current.layers.ships).toBe(false);

    act(() => {
      ref.current.toggleLayer("ships");
    });
    await waitFor(() => ref.current.layers.ships === true);
    expect(ref.current.layers.ships).toBe(true);

    unmount();
  });

  test("filters object includes all feature types", async () => {
    const { ref, unmount } = await renderDataContext();
    expect(ref.current.filters.aircraft).toBeDefined();
    expect(ref.current.filters.ships).toBeDefined();
    expect(ref.current.filters.events).toBeDefined();
    expect(ref.current.filters.quakes).toBeDefined();
    expect(ref.current.filters.fires).toBeDefined();
    expect(ref.current.filters.weather).toBeDefined();
    unmount();
  });

  test("dataSources includes all 7 sources", async () => {
    const { ref, unmount } = await renderDataContext();
    const ids = ref.current.dataSources.map((s: any) => s.id);
    expect(ids).toContain("aircraft");
    expect(ids).toContain("quakes");
    expect(ids).toContain("events");
    expect(ids).toContain("ships");
    expect(ids).toContain("fires");
    expect(ids).toContain("weather");
    expect(ids).toContain("news");
    unmount();
  });

  test("selectAndZoom sets selected and zoomToId", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    await waitFor(() => ref.current.allData.length > 0);

    const item = ref.current.allData[0]!;
    act(() => {
      ref.current.selectAndZoom(item);
    });

    await waitFor(() => ref.current.selected !== null);
    expect(ref.current.selected!.id).toBe(item.id);
    expect(ref.current.zoomToId).toBe(item.id);

    unmount();
  });

  test("chromeHidden toggles", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    expect(ref.current.chromeHidden).toBe(false);
    act(() => {
      ref.current.setChromeHidden(true);
    });
    await waitFor(() => ref.current.chromeHidden === true);
    expect(ref.current.chromeHidden).toBe(true);

    unmount();
  });

  test("flat and autoRotate toggle", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    expect(ref.current.flat).toBe(false);
    act(() => {
      ref.current.setFlat(true);
    });
    await waitFor(() => ref.current.flat === true);
    expect(ref.current.flat).toBe(true);

    expect(ref.current.autoRotate).toBe(false);
    act(() => {
      ref.current.setAutoRotate(true);
    });
    await waitFor(() => ref.current.autoRotate === true);
    expect(ref.current.autoRotate).toBe(true);

    unmount();
  });

  test("correlation result has products and alerts", async () => {
    const { ref, waitFor, unmount } = await renderDataContext();

    await waitFor(() => ref.current.allData.length > 0);

    expect(Array.isArray(ref.current.correlation.products)).toBe(true);
    expect(Array.isArray(ref.current.correlation.alerts)).toBe(true);
    expect(ref.current.correlation.baseline).toBeDefined();

    unmount();
  });

  test("useData throws outside DataProvider", async () => {
    const { useData } = await import("@/context/DataContext");
    const { ThemeProvider } = await import("@/context/ThemeContext");

    function Orphan() {
      useData();
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      try {
        act(() => {
          root.render(
            React.createElement(
              ThemeProvider,
              null,
              React.createElement(Orphan),
            ),
          );
        });
      } catch (e) {
        throw e;
      }
    }).toThrow("useData must be used within DataProvider");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("watch mode starts inactive", async () => {
    const { ref, unmount } = await renderDataContext();
    expect(ref.current.watchActive).toBe(false);
    expect(ref.current.watchPaused).toBe(false);
    expect(ref.current.watchProgress).toBe(0);
    unmount();
  });

  test("searchMatchIds starts null", async () => {
    const { ref, unmount } = await renderDataContext();
    expect(ref.current.searchMatchIds).toBeNull();
    unmount();
  });
});
