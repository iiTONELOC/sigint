import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/context/ThemeContext";
import { DataProvider } from "@/context/DataContext";

// ── Mock fetch for all endpoints ────────────────────────────────────

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
      title: "Test News",
      url: "https://example.com",
      source: "BBC",
      publishedAt: new Date().toISOString(),
      description: "Test description",
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
    if (url.includes("/api/dossier"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ dossier: null }),
      } as unknown as Response;
    if (url.includes("iptv-org"))
      return {
        ok: true,
        status: 200,
        json: async () => [],
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

function renderInProviders(element: React.ReactElement) {
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

// ── ErrorBoundary wrapping ──────────────────────────────────────────

describe("pane ErrorBoundary wrappers", () => {
  test("catches error and shows fallback with pane name", () => {
    function Broken(): React.ReactElement {
      throw new Error("pane crash");
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const origError = console.error;
    console.error = () => {};

    try {
      act(() => {
        root.render(
          React.createElement(
            ErrorBoundary,
            { name: "alert-log" },
            React.createElement(Broken),
          ),
        );
      });
    } catch {
      // Expected
    }

    console.error = origError;

    expect(container.textContent).toContain("ALERT-LOG ERROR");
    expect(container.textContent).toContain("pane crash");
    expect(container.textContent).toContain("RETRY");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("recovers on retry when error is resolved", () => {
    let shouldThrow = true;

    function MaybeBroken(): React.ReactElement {
      if (shouldThrow) throw new Error("temp crash");
      return React.createElement("div", null, "recovered");
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const origError = console.error;
    console.error = () => {};

    try {
      act(() => {
        root.render(
          React.createElement(
            ErrorBoundary,
            { name: "test-pane", autoRetryMs: 0 },
            React.createElement(MaybeBroken),
          ),
        );
      });
    } catch {
      // Expected
    }

    console.error = origError;

    shouldThrow = false;
    const retryBtn = container.querySelector("button");
    act(() => {
      retryBtn!.click();
    });

    expect(container.textContent).toContain("recovered");
    expect(container.textContent).not.toContain("ERROR");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

// ── Suspense skeleton fallback ──────────────────────────────────────

describe("pane Suspense skeletons", () => {
  test("renders skeleton while lazy component loads", async () => {
    let resolve: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    const NeverLoads = React.lazy(
      () =>
        promise.then(() => ({
          default: () => React.createElement("div", null, "loaded"),
        })) as any,
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        React.createElement(
          Suspense,
          {
            fallback: React.createElement(
              "div",
              { className: "animate-pulse" },
              "skeleton",
            ),
          },
          React.createElement(NeverLoads),
        ),
      );
    });

    expect(container.textContent).toContain("skeleton");
    expect(container.querySelector(".animate-pulse")).not.toBeNull();

    resolve!();
    await act(async () => {
      await promise;
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain("loaded");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

// ── Pane rendering in context ───────────────────────────────────────

describe("panes render in DataContext", () => {
  test("AlertLogPane renders", async () => {
    const { AlertLogPane } = await import("@/panes/alert-log/AlertLogPane");
    const { container, waitFor, unmount } = renderInProviders(
      React.createElement(AlertLogPane),
    );

    await waitFor(() => container.textContent!.length > 0, 3000);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("RawConsolePane renders", async () => {
    const { RawConsolePane } =
      await import("@/panes/raw-console/RawConsolePane");
    const { container, waitFor, unmount } = renderInProviders(
      React.createElement(RawConsolePane),
    );

    await waitFor(() => container.textContent!.length > 0, 3000);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("NewsFeedPane renders", async () => {
    const { NewsFeedPane } = await import("@/panes/news-feed/NewsFeedPane");
    const { container, waitFor, unmount } = renderInProviders(
      React.createElement(NewsFeedPane),
    );

    await waitFor(() => container.textContent!.length > 0, 3000);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("IntelFeedPane renders", async () => {
    const { IntelFeedPane } = await import("@/panes/intel-feed/IntelFeedPane");
    const { container, waitFor, unmount } = renderInProviders(
      React.createElement(IntelFeedPane),
    );

    await waitFor(() => container.textContent!.length > 0, 3000);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("DataTablePane renders", async () => {
    const { DataTablePane } = await import("@/panes/data-table/DataTablePane");
    const { container, waitFor, unmount } = renderInProviders(
      React.createElement(DataTablePane),
    );

    await waitFor(() => container.textContent!.length > 0, 3000);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });

  test("DossierPane renders", async () => {
    const { DossierPane } = await import("@/panes/dossier/DossierPane");
    const { container, waitFor, unmount } = renderInProviders(
      React.createElement(DossierPane),
    );

    await waitFor(() => container.textContent!.length > 0, 3000);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    unmount();
  });
});

// ── Mobile ──────────────────────────────────────────────────────────

describe("PaneMobile", () => {
  test("renders tab bar with pane labels", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf } = await import("@/panes/paneTree");

    const allLeaves = [leaf("globe"), leaf("data-table")];
    const paneMeta: any = {
      globe: { label: "GLOBE", icon: () => null },
      "data-table": { label: "DATA TABLE", icon: () => null },
    };
    const paneComponents: any = {
      globe: () => React.createElement("div", null, "globe"),
      "data-table": () => React.createElement("div", null, "table"),
    };

    const { container, unmount } = renderInProviders(
      React.createElement(PaneMobile, {
        allLeaves,
        layout: { root: allLeaves[0], minimized: [] } as any,
        activeMobilePane: 0,
        setActiveMobilePane: () => {},
        activeCount: 100,
        dataSources: [{ status: "live" }],
        counts: { aircraft: 50, quakes: 10 },
        paneMeta,
        paneComponents,
        closePane: () => {},
        restorePane: () => {},
      }),
    );

    expect(container.textContent).toContain("GLOBE");
    expect(container.textContent).toContain("DATA TABLE");

    unmount();
  });
});
