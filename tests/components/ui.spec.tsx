import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { Globe } from "lucide-react";
import { ThemeProvider } from "@/context/ThemeContext";
import { DataProvider } from "@/context/DataContext";
import type { DataPoint } from "@/features/base/dataPoints";

// ── Mock fetch ──────────────────────────────────────────────────────

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
        json: async () => ({
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
        }),
      } as unknown as Response;
    if (url.includes("earthquake.usgs.gov"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ features: [] }),
      } as unknown as Response;
    if (url.includes("api.weather.gov"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ type: "FeatureCollection", features: [] }),
      } as unknown as Response;
    if (url.includes("/api/"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [], items: [] }),
      } as unknown as Response;
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response;
  };
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  mockAllFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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

function renderWithTheme(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(ThemeProvider, null, element));
  });
  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return { container, unmount };
}

function renderWithProviders(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(DataProvider, null, element),
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
  return { container, waitFor, unmount };
}

// ── Header ──────────────────────────────────────────────────────────

describe("Header", () => {
  test("renders SIGINT branding and layer toggles", async () => {
    const { Header } = await import("@/components/Header");
    const { container, unmount } = renderWithTheme(
      React.createElement(Header, {
        layers: {
          ships: true,
          events: true,
          quakes: true,
          fires: true,
          weather: true,
        },
        toggleLayer: () => {},
        counts: { aircraft: 10, ships: 5 },
        dataSources: [{ id: "aircraft", label: "AIRCRAFT", status: "live" }],
        aircraftFilter: {
          enabled: true,
          showAirborne: true,
          showGround: true,
          squawks: new Set<string>(),
          countries: new Set<string>(),
          milFilter: "all" as const,
        },
        setAircraftFilter: () => {},
        availableCountries: [],
      }),
    );
    expect(container.textContent).toContain("SIGINT");
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    unmount();
  });
});

// ── Search ──────────────────────────────────────────────────────────

describe("Search", () => {
  test("renders search UI", async () => {
    const { Search } = await import("@/components/Search");
    const { container, unmount } = renderWithTheme(
      React.createElement(Search, {
        data: [pt("a1", "aircraft", 35, 139, { callsign: "UAL123" })],
        onSelect: () => {},
        onZoomTo: () => {},
        onMatchingIdsChange: () => {},
      }),
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("renders with empty data", async () => {
    const { Search } = await import("@/components/Search");
    const { container, unmount } = renderWithTheme(
      React.createElement(Search, {
        data: [],
        onSelect: () => {},
        onZoomTo: () => {},
        onMatchingIdsChange: () => {},
      }),
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });
});

// ── DetailPanel ─────────────────────────────────────────────────────

describe("DetailPanel", () => {
  test("renders nothing when item is null", async () => {
    const { DetailPanel } = await import("@/components/DetailPanel");
    const { container, unmount } = renderWithTheme(
      React.createElement(DetailPanel, {
        item: null,
        isolateMode: null,
        onSetIsolateMode: () => {},
        onClose: () => {},
      }),
    );
    expect(container.textContent).toBe("");
    unmount();
  });

  test("renders aircraft detail rows", async () => {
    const { DetailPanel } = await import("@/components/DetailPanel");
    const aircraft = pt("a1", "aircraft", 35, 139, {
      callsign: "UAL123",
      icao24: "abc123",
      acType: "B738",
      altitude: 35000,
      speed: 450,
      heading: 90,
    });
    const { container, unmount } = renderWithTheme(
      React.createElement(DetailPanel, {
        item: aircraft,
        isolateMode: null,
        onSetIsolateMode: () => {},
        onClose: () => {},
      }),
    );
    expect(container.textContent).toContain("UAL123");
    unmount();
  });

  test("shows FOCUS and SOLO controls", async () => {
    const { DetailPanel } = await import("@/components/DetailPanel");
    const item = pt("q1", "quakes", 35, 139, { magnitude: 5.2 });
    const { container, unmount } = renderWithTheme(
      React.createElement(DetailPanel, {
        item,
        isolateMode: null,
        onSetIsolateMode: () => {},
        onClose: () => {},
        onZoomTo: () => {},
      }),
    );
    expect(container.textContent).toContain("FOCUS");
    expect(container.textContent).toContain("SOLO");
    unmount();
  });
});

// ── PaneHeader ──────────────────────────────────────────────────────

describe("PaneHeader", () => {
  test("renders label and buttons", async () => {
    const { PaneHeader } = await import("@/panes/PaneHeader");
    const { container, unmount } = renderWithProviders(
      React.createElement(PaneHeader, {
        label: "DATA TABLE",
        icon: Globe,
        leafId: "test-leaf",
        onMinimize: () => {},
        onClose: () => {},
      }),
    );
    expect(container.textContent).toContain("DATA TABLE");
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    unmount();
  });

  test("has draggable grip handle", async () => {
    const { PaneHeader } = await import("@/panes/PaneHeader");
    const { container, unmount } = renderWithProviders(
      React.createElement(PaneHeader, {
        label: "GLOBE",
        icon: Globe,
        leafId: "test-leaf",
        onMinimize: () => {},
        onDragStart: () => {},
        onDragEnd: () => {},
      }),
    );
    const draggable = container.querySelector("[draggable='true']");
    expect(draggable).not.toBeNull();
    unmount();
  });

  test("split buttons present when handlers provided", async () => {
    const { PaneHeader } = await import("@/panes/PaneHeader");
    const { container, unmount } = renderWithProviders(
      React.createElement(PaneHeader, {
        label: "TEST",
        icon: Globe,
        leafId: "test-leaf",
        onMinimize: () => {},
        onSplitH: () => {},
        onSplitV: () => {},
      }),
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    unmount();
  });
});

// ── Ticker ──────────────────────────────────────────────────────────

describe("Ticker", () => {
  test("renders with items", async () => {
    const { Ticker } = await import("@/components/Ticker");
    const { container, waitFor, unmount } = renderWithProviders(
      React.createElement(Ticker, {
        items: [
          pt("a1", "aircraft", 35, 139, {
            callsign: "UAL123",
            onGround: false,
          }),
          pt("q1", "quakes", 10, 20, { magnitude: 5.2 }),
        ],
      }),
    );
    await waitFor(() => container.innerHTML.length > 50, 3000);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("renders with empty items", async () => {
    const { Ticker } = await import("@/components/Ticker");
    const { container, unmount } = renderWithProviders(
      React.createElement(Ticker, { items: [] }),
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });
});
