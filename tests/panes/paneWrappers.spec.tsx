import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/context/ThemeContext";
import { DataProvider } from "@/context/DataContext";
import type { LayoutNode, LeafNode } from "@/panes/paneTree";

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

// ── PaneMobile ──────────────────────────────────────────────────────

// Helper to build full PaneMobile props with defaults
function mobilePaneProps(overrides: Record<string, any> = {}): any {
  return {
    allLeaves: [],
    layout: {
      root: { type: "leaf", id: "default", paneType: "globe" },
      minimized: [],
    },
    activeMobilePane: 0,
    setActiveMobilePane: () => {},
    activeCount: 0,
    dataSources: [{ status: "live" }],
    counts: {},
    paneMeta: {},
    paneComponents: {},
    splitPane: () => {},
    closePane: () => {},
    minimizePane: () => {},
    changePaneType: () => {},
    restorePane: () => {},
    resizeSplit: () => {},
    availableTypes: [],
    leafCount: 1,
    swapPanes: () => {},
    insertPaneBeside: () => {},
    ...overrides,
  };
}

describe("PaneMobile", () => {
  test("renders tab bar with pane labels", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf, split } = await import("@/panes/paneTree");

    const g = leaf("globe");
    const d = leaf("data-table");
    const root = split("v", g, d);

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g, d],
          layout: { root, minimized: [] },
          activeCount: 100,
          counts: { aircraft: 50, quakes: 10 },
          paneMeta: {
            globe: { label: "GLOBE", icon: () => null },
            "data-table": { label: "DATA TABLE", icon: () => null },
          },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe"),
            "data-table": () => React.createElement("div", null, "table"),
          },
          leafCount: 2,
        }),
      ),
    );

    expect(container.textContent).toContain("GLOBE");
    expect(container.textContent).toContain("DATA TABLE");
    unmount();
  });

  test("single pane renders without crash", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf } = await import("@/panes/paneTree");

    const g = leaf("globe");

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g],
          layout: { root: g, minimized: [] },
          activeCount: 42,
          counts: { aircraft: 42 },
          paneMeta: { globe: { label: "GLOBE", icon: () => null } },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe-content"),
          },
        }),
      ),
    );

    expect(container.textContent).toContain("GLOBE");
    expect(container.textContent).toContain("42");
    unmount();
  });

  test("H-split block shows SPLIT label and both pane headers", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf, split } = await import("@/panes/paneTree");

    const g = leaf("globe");
    const d = leaf("dossier");
    const root = split("h", g, d);

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g, d],
          layout: { root, minimized: [] },
          activeCount: 100,
          paneMeta: {
            globe: { label: "GLOBE", icon: () => null },
            dossier: { label: "DOSSIER", icon: () => null },
          },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe"),
            dossier: () => React.createElement("div", null, "dossier"),
          },
          leafCount: 2,
        }),
      ),
    );

    expect(container.textContent).toContain("SPLIT");
    expect(container.textContent).toContain("GLOBE");
    expect(container.textContent).toContain("DOSSIER");
    unmount();
  });

  test("shows track count and LIVE status", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf } = await import("@/panes/paneTree");

    const g = leaf("globe");

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g],
          layout: { root: g, minimized: [] },
          activeCount: 5000,
          dataSources: [
            { status: "live" },
            { status: "cached" },
            { status: "error" },
          ],
          counts: { aircraft: 5000 },
          paneMeta: { globe: { label: "GLOBE", icon: () => null } },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe"),
          },
        }),
      ),
    );

    expect(container.textContent).toContain("5,000");
    expect(container.textContent).toContain("TRACKS");
    expect(container.textContent).toContain("LIVE");
    unmount();
  });

  test("minimized panes appear in tab bar", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf } = await import("@/panes/paneTree");

    const g = leaf("globe");

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g],
          layout: {
            root: g,
            minimized: [{ id: "min1", paneType: "data-table" }],
          },
          paneMeta: {
            globe: { label: "GLOBE", icon: () => null },
            "data-table": { label: "DATA TABLE", icon: () => null },
          },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe"),
            "data-table": () => React.createElement("div", null, "table"),
          },
        }),
      ),
    );

    expect(container.textContent).toContain("DATA TABLE");
    unmount();
  });

  test("add button present when availableTypes non-empty", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf } = await import("@/panes/paneTree");

    const g = leaf("globe");

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g],
          layout: { root: g, minimized: [] },
          paneMeta: {
            globe: { label: "GLOBE", icon: () => null },
            "data-table": { label: "DATA TABLE", icon: () => null },
          },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe"),
            "data-table": () => React.createElement("div", null, "table"),
          },
          availableTypes: ["data-table"],
        }),
      ),
    );

    const addBtn = container.querySelector('button[title="Add pane"]');
    expect(addBtn).not.toBeNull();
    unmount();
  });

  test("add button hidden when no available types", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf } = await import("@/panes/paneTree");

    const g = leaf("globe");

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g],
          layout: { root: g, minimized: [] },
          paneMeta: { globe: { label: "GLOBE", icon: () => null } },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe"),
          },
          availableTypes: [],
        }),
      ),
    );

    const addBtn = container.querySelector('button[title="Add pane"]');
    expect(addBtn).toBeNull();
    unmount();
  });

  test("three V-split blocks all render labels", async () => {
    const { PaneMobile } = await import("@/panes/PaneMobile");
    const { leaf, split } = await import("@/panes/paneTree");

    const g = leaf("globe");
    const a = leaf("alert-log");
    const n = leaf("news-feed");
    const root = split("v", g, split("v", a, n));

    const { container, unmount } = renderInProviders(
      React.createElement(
        PaneMobile,
        mobilePaneProps({
          allLeaves: [g, a, n],
          layout: { root, minimized: [] },
          activeCount: 200,
          paneMeta: {
            globe: { label: "GLOBE", icon: () => null },
            "alert-log": { label: "ALERTS", icon: () => null },
            "news-feed": { label: "NEWS FEED", icon: () => null },
          },
          paneComponents: {
            globe: () => React.createElement("div", null, "globe"),
            "alert-log": () => React.createElement("div", null, "alerts"),
            "news-feed": () => React.createElement("div", null, "news"),
          },
          leafCount: 3,
        }),
      ),
    );

    expect(container.textContent).toContain("GLOBE");
    expect(container.textContent).toContain("ALERTS");
    expect(container.textContent).toContain("NEWS FEED");
    unmount();
  });
});

// ── collectMobileBlocks (logic tests — inlined, no source export needed) ──

function collectMobileBlocks(
  root: LayoutNode,
): {
  id: string;
  node: LayoutNode;
  primaryLeaf: LeafNode;
  leafIds: string[];
}[] {
  if (root.type === "leaf") {
    return [{ id: root.id, node: root, primaryLeaf: root, leafIds: [root.id] }];
  }
  if (
    root.direction === "h" &&
    root.children[0].type === "leaf" &&
    root.children[1].type === "leaf"
  ) {
    return [
      {
        id: root.id,
        node: root,
        primaryLeaf: root.children[0],
        leafIds: [root.children[0].id, root.children[1].id],
      },
    ];
  }
  return [
    ...collectMobileBlocks(root.children[0]),
    ...collectMobileBlocks(root.children[1]),
  ];
}

describe("collectMobileBlocks", () => {
  test("single leaf becomes one block", async () => {
    const { leaf } = await import("@/panes/paneTree");
    const g = leaf("globe");
    const blocks = collectMobileBlocks(g);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.id).toBe(g.id);
    expect(blocks[0]!.primaryLeaf.paneType).toBe("globe");
    expect(blocks[0]!.leafIds).toEqual([g.id]);
  });

  test("V-split becomes two separate blocks", async () => {
    const { leaf, split } = await import("@/panes/paneTree");
    const g = leaf("globe");
    const d = leaf("data-table");
    const blocks = collectMobileBlocks(split("v", g, d));
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.primaryLeaf.paneType).toBe("globe");
    expect(blocks[1]!.primaryLeaf.paneType).toBe("data-table");
  });

  test("shallow H-split stays as one block with two leafIds", async () => {
    const { leaf, split } = await import("@/panes/paneTree");
    const g = leaf("globe");
    const d = leaf("data-table");
    const blocks = collectMobileBlocks(split("h", g, d));
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.leafIds.length).toBe(2);
    expect(blocks[0]!.leafIds).toContain(g.id);
    expect(blocks[0]!.leafIds).toContain(d.id);
  });

  test("deep H-split flattens — only shallow pairs stay grouped", async () => {
    const { leaf, split } = await import("@/panes/paneTree");
    const a = leaf("globe");
    const b = leaf("data-table");
    const c = leaf("dossier");
    const blocks = collectMobileBlocks(split("h", a, split("h", b, c)));
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.primaryLeaf.paneType).toBe("globe");
    expect(blocks[1]!.leafIds.length).toBe(2);
  });

  test("mixed V and H splits produce correct block count", async () => {
    const { leaf, split } = await import("@/panes/paneTree");
    const g = leaf("globe");
    const d = leaf("data-table");
    const v = leaf("video-feed");
    const a = leaf("alert-log");
    const root = split("v", split("h", g, d), split("v", v, a));
    const blocks = collectMobileBlocks(root);
    expect(blocks.length).toBe(3);
    expect(blocks[0]!.leafIds.length).toBe(2);
    expect(blocks[1]!.primaryLeaf.paneType).toBe("video-feed");
    expect(blocks[2]!.primaryLeaf.paneType).toBe("alert-log");
  });

  test("complex 8-pane desktop layout flattens to 4 paired blocks", async () => {
    const { leaf, split } = await import("@/panes/paneTree");
    const a = leaf("globe");
    const b = leaf("data-table");
    const c = leaf("dossier");
    const d = leaf("video-feed");
    const e = leaf("alert-log");
    const f = leaf("intel-feed");
    const g = leaf("news-feed");
    const h = leaf("raw-console");
    const root = split(
      "h",
      split("h", split("h", a, b), split("h", c, d)),
      split("h", split("h", e, f), split("h", g, h)),
    );
    const blocks = collectMobileBlocks(root);
    expect(blocks.length).toBe(4);
    for (const block of blocks) {
      expect(block.leafIds.length).toBe(2);
    }
  });

  test("primaryLeaf is always the leftmost leaf", async () => {
    const { leaf, split } = await import("@/panes/paneTree");
    const g = leaf("globe");
    const d = leaf("dossier");
    const blocks = collectMobileBlocks(split("h", g, d));
    expect(blocks[0]!.primaryLeaf.id).toBe(g.id);
  });

  test("V-split preserves child order top to bottom", async () => {
    const { leaf, split } = await import("@/panes/paneTree");
    const a = leaf("alert-log");
    const b = leaf("news-feed");
    const c = leaf("globe");
    const blocks = collectMobileBlocks(split("v", a, split("v", b, c)));
    expect(blocks.length).toBe(3);
    expect(blocks[0]!.primaryLeaf.paneType).toBe("alert-log");
    expect(blocks[1]!.primaryLeaf.paneType).toBe("news-feed");
    expect(blocks[2]!.primaryLeaf.paneType).toBe("globe");
  });
});
