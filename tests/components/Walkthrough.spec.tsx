import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { flushReactUpdates } from "../support/react";
import {
  installFetchMock,
  type RestoreFetch,
} from "../support/network";

// Mock storage and layout signals. Keep DataContext real.

let mockStorage = new Map<string, unknown>();

mock.module("@/lib/cache/storageService", () => ({
  cacheGet: async (key: string) => mockStorage.get(key) ?? null,
  cacheSet: async (key: string, value: unknown) => {
    mockStorage.set(key, value);
  },
  cacheDelete: async (key: string) => {
    mockStorage.delete(key);
  },
  cacheInit: async () => {},
}));

mock.module("@/lib/runtime/layoutSignals", () => ({
  requestWatchLayout: () => {},
}));

const {
  ESSENTIAL_STEPS,
  Walkthrough,
  onWalkthroughReset,
  setVideoPresetCount,
  setWalkthroughLayoutSnapshot,
  useWalkthroughStepId,
  WalkthroughStepId,
  WalkthroughStepMode,
} = await import("@/walkthrough");
const { PaneType } = await import("@/panes/workspace");
const { CacheKey } = await import("@shared/domain/cache");
const { ThemeProvider } = await import("@/context/ThemeContext");
const { DataProvider } = await import("@/context/DataContext");
const { LayoutModeProvider } = await import("@/layout-mode");

// ── Mock fetch for DataProvider ─────────────────────────────────────

let restoreFetch: RestoreFetch;

function mockAllFetch(): RestoreFetch {
  return installFetchMock(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/token"))
      return Response.json({ ok: true });
    if (url.includes("/api/aircraft/states"))
      return Response.json({ ac: [] });
    if (url.includes("earthquake.usgs.gov"))
      return Response.json({ features: [] });
    if (url.includes("api.weather.gov"))
      return Response.json({ type: "FeatureCollection", features: [] });
    if (url.includes("/api/"))
      return Response.json({ data: [], items: [] });
    return Response.json({});
  });
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

function CurrentStepId() {
  return <output data-testid="current-step-id">{useWalkthroughStepId()}</output>;
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
  setWalkthroughLayoutSnapshot(new Set([PaneType.Globe]), 1, 0);
  setVideoPresetCount(0);
  document.body.innerHTML = "";
  restoreFetch = mockAllFetch();
  addTourTargets();
});

afterEach(() => {
  restoreFetch();
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
    let resetCalls = 0;
    const unsubscribe = onWalkthroughReset(() => {
      resetCalls++;
    });
    const { unmount } = render();
    expect(resetCalls).toBeGreaterThanOrEqual(1);
    unmount();
    unsubscribe();
  });

  test("pushes step ID on mount", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<CurrentStepId />);
    });
    const walkthrough = render();
    expect(container.textContent).toBe("welcome");
    walkthrough.unmount();
    act(() => root.unmount());
    container.remove();
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
    expect(closeCalls).toHaveLength(1);
    unmount();
  });

  test("SKIP does NOT persist walkthroughComplete flag (session-only)", async () => {
    const { unmount } = render();
    clickButton("SKIP");
    await flushReactUpdates();
    expect(mockStorage.get(CacheKey.WalkthroughComplete)).toBeUndefined();
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
    expect(closeCalls).toHaveLength(1);
    await flushReactUpdates();
    expect(mockStorage.get(CacheKey.WalkthroughComplete)).toBe(true);
    unmount();
  });

  test("Escape key skips without persisting", async () => {
    const { unmount, closeCalls } = render();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(closeCalls).toHaveLength(1);
    await flushReactUpdates();
    expect(mockStorage.get(CacheKey.WalkthroughComplete)).toBeUndefined();
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
    expect(closeCalls).toHaveLength(1);
    unmount();
  });

  // ── Overlay behavior ──────────────────────────────────────────────

  test("overlay has correct z-index", () => {
    const { unmount } = render();
    const overlay = document.body.querySelector("[data-wt-overlay]");
    expect(overlay?.classList.contains("z-9999")).toBe(true);
    unmount();
  });

  test("overlay has backdrop dimming via SVG", () => {
    const { unmount } = render();
    const backdrop = document.body.querySelector("[data-wt-backdrop]");
    expect(backdrop).not.toBeNull();
    unmount();
  });

  test("info step overlay has pointer-events none for interactivity", () => {
    const { unmount } = render();
    const overlay = document.body.querySelector("[data-wt-overlay]");
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("pointer-events-none")).toBe(true);
    unmount();
  });

  test("action step overlay also has pointer-events none", () => {
    const { unmount } = render();
    advanceInfoSteps(2);
    const overlay = document.body.querySelector("[data-wt-overlay]");
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains("pointer-events-none")).toBe(true);
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
    const step = ESSENTIAL_STEPS.find(
      (candidate) => candidate.id === WalkthroughStepId.GlobeSelect,
    )!;
    expect(step).toBeDefined();
    expect(step.mode).toBe(WalkthroughStepMode.Action);
    expect(step.completionCheck?.(new Set(), 1, 0, null, false, 0)).toBe(false);
    expect(step.completionCheck?.(new Set(), 1, 0, "Aabc123", false, 0)).toBe(true);
  });

  test("globe-deselect completionCheck responds to selectedId null", () => {
    const step = ESSENTIAL_STEPS.find(
      (candidate) => candidate.id === WalkthroughStepId.GlobeDeselect,
    )!;
    expect(step.completionCheck?.(new Set(), 1, 0, "Aabc123", false, 0)).toBe(false);
    expect(step.completionCheck?.(new Set(), 1, 0, null, false, 0)).toBe(true);
  });

  test("focus-enter completionCheck responds to chromeHidden", () => {
    const step = ESSENTIAL_STEPS.find(
      (candidate) => candidate.id === WalkthroughStepId.FocusEnter,
    )!;
    expect(step.completionCheck?.(new Set(), 1, 0, null, false, 0)).toBe(false);
    expect(step.completionCheck?.(new Set(), 1, 0, null, true, 0)).toBe(true);
  });

  test("focus-exit completionCheck responds to chromeHidden false", () => {
    const step = ESSENTIAL_STEPS.find(
      (candidate) => candidate.id === WalkthroughStepId.FocusExit,
    )!;
    expect(step.completionCheck?.(new Set(), 1, 0, null, true, 0)).toBe(false);
    expect(step.completionCheck?.(new Set(), 1, 0, null, false, 0)).toBe(true);
  });

  test("save-preset action step description mentions VIEWS", () => {
    const step = ESSENTIAL_STEPS.find(
      (candidate) => candidate.id === WalkthroughStepId.SavePreset,
    )!;
    expect(step).toBeDefined();
    expect(step.description).toContain("VIEWS");
    expect(step.description).toContain("save");
    expect(step.mode).toBe(WalkthroughStepMode.Action);
  });
});
