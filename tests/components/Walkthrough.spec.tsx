import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// ── Mocks (storageService + paneLayoutContext only — NOT DataContext) ──

let mockStorage = new Map<string, unknown>();
let resetCalls = 0;
let lastStepId: string | null = null;

mock.module("@/lib/storageService", () => ({
  cacheGet: async (key: string) => mockStorage.get(key) ?? null,
  cacheSet: async (key: string, value: unknown) => {
    mockStorage.set(key, value);
  },
  cacheDelete: async (key: string) => {
    mockStorage.delete(key);
  },
  cacheInit: async () => {},
}));

mock.module("@/lib/layoutSignals", () => ({
  requestWalkthroughReset: () => {
    resetCalls++;
  },
  requestWalkthroughUndo: () => {},
  setWalkthroughStepId: (id: string | null) => {
    lastStepId = id;
  },
  useWalkthroughLeafTypes: () => new Set(["globe"]),
  useWalkthroughLeafCount: () => 1,
  useWalkthroughPresetCount: () => 0,
  useVideoPresetCount: () => 0,
}));

const { Walkthrough } = await import("@/components/Walkthrough");
const { CACHE_KEYS } = await import("@/lib/cacheKeys");
const { ThemeProvider } = await import("@/context/ThemeContext");
const { DataProvider } = await import("@/context/DataContext");
const { LayoutModeProvider } = await import("@/context/LayoutModeContext");

// ── Mock fetch for DataProvider ─────────────────────────────────────

const origFetch = globalThis.fetch;

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
        json: async () => ({ states: [] }),
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

// ── Helpers ─────────────────────────────────────────────────────────

function addTourTargets() {
  const targets = [
    "header-brand",
    "layer-toggles",
    "globe-pane",
    "search",
    "pane-toolbar",
    "ticker",
    "aircraft-filter",
    "globe-controls",
    "settings-button",
    "split-right-btn",
    "split-down-btn",
  ];
  for (const name of targets) {
    const el = document.createElement("div");
    el.setAttribute("data-tour", name);
    el.style.position = "fixed";
    el.style.top = "50px";
    el.style.left = "50px";
    el.style.width = "100px";
    el.style.height = "40px";
    document.body.appendChild(el);
  }
}

function render(props: Record<string, any> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const closeCalls: boolean[] = [];
  act(() => {
    root.render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          LayoutModeProvider,
          null,
          React.createElement(
            DataProvider,
            null,
            React.createElement(Walkthrough, {
              onComplete: () => closeCalls.push(true),
              ...props,
            }),
          ),
        ),
      ),
    );
  });
  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  return { container, unmount, closeCalls };
}

function clickButton(label: string): boolean {
  const btn = Array.from(document.body.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  );
  if (!btn) return false;
  act(() => {
    btn.click();
  });
  return true;
}

function advanceInfoSteps(count: number) {
  for (let i = 0; i < count; i++) {
    clickButton("NEXT") || clickButton("FINISH");
  }
}

// ── Setup/teardown ──────────────────────────────────────────────────

beforeEach(() => {
  mockStorage = new Map();
  resetCalls = 0;
  lastStepId = null;
  document.body.innerHTML = "";
  mockAllFetch();
  addTourTargets();
});

afterEach(() => {
  globalThis.fetch = origFetch;
  document.body.innerHTML = "";
});

// ── Tests ───────────────────────────────────────────────────────────

describe("Walkthrough", () => {
  test("renders overlay with first step title", () => {
    const { unmount } = render();
    expect(document.body.textContent).toContain("Welcome to SIGINT");
    unmount();
  });

  test("shows step counter 1 / 13 on first step", () => {
    const { unmount } = render();
    expect(document.body.textContent).toContain("1 / 13");
    unmount();
  });

  test("fires requestWalkthroughReset on mount", () => {
    const { unmount } = render();
    expect(resetCalls).toBeGreaterThanOrEqual(1);
    unmount();
  });

  test("pushes step ID on mount", () => {
    const { unmount } = render();
    expect(lastStepId).toBe("welcome");
    unmount();
  });

  test("has NEXT and SKIP buttons on info steps", () => {
    const { unmount } = render();
    const buttons = Array.from(document.body.querySelectorAll("button")).map(
      (b) => b.textContent?.trim(),
    );
    expect(buttons.some((t) => t?.includes("NEXT"))).toBe(true);
    expect(buttons.some((t) => t?.includes("SKIP"))).toBe(true);
    unmount();
  });

  test("NEXT advances to step 2 (layers)", () => {
    const { unmount } = render();
    clickButton("NEXT");
    expect(document.body.textContent).toContain("Data Layers");
    expect(document.body.textContent).toContain("2 / 13");
    unmount();
  });

  test("BACK appears from step 2 onward", () => {
    const { unmount } = render();
    expect(
      Array.from(document.body.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("BACK"),
      ),
    ).toBeUndefined();

    clickButton("NEXT");
    expect(
      Array.from(document.body.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("BACK"),
      ),
    ).not.toBeUndefined();
    unmount();
  });

  test("BACK goes to previous step", () => {
    const { unmount } = render();
    clickButton("NEXT");
    expect(document.body.textContent).toContain("2 / 13");
    clickButton("BACK");
    expect(document.body.textContent).toContain("1 / 13");
    expect(document.body.textContent).toContain("Welcome to SIGINT");
    unmount();
  });

  // ── Skip vs Dismiss ───────────────────────────────────────────────

  test("SKIP calls onComplete", () => {
    const { unmount, closeCalls } = render();
    clickButton("SKIP");
    expect(closeCalls.length).toBe(1);
    unmount();
  });

  test("SKIP does NOT persist walkthroughComplete flag (session-only)", async () => {
    const { unmount } = render();
    clickButton("SKIP");
    await new Promise((r) => setTimeout(r, 50));
    expect(mockStorage.get(CACHE_KEYS.walkthroughComplete)).toBeUndefined();
    unmount();
  });

  test("DON'T SHOW AGAIN button is visible", () => {
    const { unmount } = render();
    expect(document.body.textContent).toContain("DON'T SHOW AGAIN");
    unmount();
  });

  test("DON'T SHOW AGAIN calls onComplete and persists flag", async () => {
    const { unmount, closeCalls } = render();
    clickButton("DON'T SHOW AGAIN");
    expect(closeCalls.length).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockStorage.get(CACHE_KEYS.walkthroughComplete)).toBe(true);
    unmount();
  });

  test("Escape key skips without persisting", async () => {
    const { unmount, closeCalls } = render();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(closeCalls.length).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockStorage.get(CACHE_KEYS.walkthroughComplete)).toBeUndefined();
    unmount();
  });

  // ── Globe action sequence ─────────────────────────────────────────

  test("step 3 is globe-select action step", () => {
    const { unmount } = render();
    // welcome → layers → globe-select
    advanceInfoSteps(2);
    expect(document.body.textContent).toContain("Select a Target");
    expect(document.body.textContent).toContain("3 / 13");
    expect(document.body.textContent).toContain("WAITING FOR ACTION");
    unmount();
  });

  // ── Action step rendering ─────────────────────────────────────────

  test("action step shows DO THIS badge", () => {
    const { unmount } = render();
    advanceInfoSteps(2);
    expect(document.body.textContent).toContain("DO THIS");
    unmount();
  });

  test("action step has warn accent bar", () => {
    const { unmount } = render();
    advanceInfoSteps(2);
    const warnBar = document.body.querySelector("[class*='bg-sig-warn']");
    expect(warnBar).not.toBeNull();
    unmount();
  });

  test("SKIP works on action steps", () => {
    const { unmount, closeCalls } = render();
    advanceInfoSteps(2);
    clickButton("SKIP");
    expect(closeCalls.length).toBe(1);
    unmount();
  });

  // ── Overlay behavior ──────────────────────────────────────────────

  test("overlay has correct z-index", () => {
    const { unmount } = render();
    const overlay = document.body.querySelector("[class*='z-[9999]']");
    expect(overlay).not.toBeNull();
    unmount();
  });

  test("overlay has backdrop dimming via SVG", () => {
    const { unmount } = render();
    const html = document.body.innerHTML;
    expect(html).toContain("rgba(0,0,0,0.72)");
    unmount();
  });

  test("info step overlay has pointer-events none for interactivity", () => {
    const { unmount } = render();
    const overlay = document.body.querySelector("[class*='z-[9999]']");
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).style.pointerEvents).toBe("none");
    unmount();
  });

  test("action step overlay also has pointer-events none", () => {
    const { unmount } = render();
    advanceInfoSteps(2);
    const overlay = document.body.querySelector("[class*='z-[9999]']");
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).style.pointerEvents).toBe("none");
    unmount();
  });

  test("step description is visible", () => {
    const { unmount } = render();
    expect(document.body.textContent).toContain(
      "Real-time global intelligence dashboard",
    );
    unmount();
  });

  test("progress dots rendered for essential phase (13 dots)", () => {
    const { unmount } = render();
    const dots = document.body.querySelectorAll("[class*='rounded-full']");
    expect(dots.length).toBeGreaterThanOrEqual(13);
    unmount();
  });

  // ── CompletionCheck logic (tested directly on step objects) ────────

  test("globe-select completionCheck responds to selectedId", () => {
    const { ESSENTIAL_STEPS } = require("@/lib/walkthroughSteps");
    const step = ESSENTIAL_STEPS.find((s: any) => s.id === "globe-select");
    expect(step).toBeDefined();
    expect(step.mode).toBe("action");
    expect(step.completionCheck(new Set(), 1, 0, null, false)).toBe(false);
    expect(step.completionCheck(new Set(), 1, 0, "Aabc123", false)).toBe(true);
  });

  test("globe-deselect completionCheck responds to selectedId null", () => {
    const { ESSENTIAL_STEPS } = require("@/lib/walkthroughSteps");
    const step = ESSENTIAL_STEPS.find((s: any) => s.id === "globe-deselect");
    expect(step.completionCheck(new Set(), 1, 0, "Aabc123", false)).toBe(false);
    expect(step.completionCheck(new Set(), 1, 0, null, false)).toBe(true);
  });

  test("focus-enter completionCheck responds to chromeHidden", () => {
    const { ESSENTIAL_STEPS } = require("@/lib/walkthroughSteps");
    const step = ESSENTIAL_STEPS.find((s: any) => s.id === "focus-enter");
    expect(step.completionCheck(new Set(), 1, 0, null, false)).toBe(false);
    expect(step.completionCheck(new Set(), 1, 0, null, true)).toBe(true);
  });

  test("focus-exit completionCheck responds to chromeHidden false", () => {
    const { ESSENTIAL_STEPS } = require("@/lib/walkthroughSteps");
    const step = ESSENTIAL_STEPS.find((s: any) => s.id === "focus-exit");
    expect(step.completionCheck(new Set(), 1, 0, null, true)).toBe(false);
    expect(step.completionCheck(new Set(), 1, 0, null, false)).toBe(true);
  });

  test("save-preset action step description mentions VIEWS", () => {
    const { ESSENTIAL_STEPS } = require("@/lib/walkthroughSteps");
    const step = ESSENTIAL_STEPS.find((s: any) => s.id === "save-preset");
    expect(step).toBeDefined();
    expect(step.description).toContain("VIEWS");
    expect(step.description).toContain("save");
    expect(step.mode).toBe("action");
  });
});
