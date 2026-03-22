import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// ── Mocks ───────────────────────────────────────────────────────────

let mockStorage: Map<string, unknown>;
let resetCalls: number;

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

mock.module("@/panes/paneLayoutContext", () => ({
  requestWalkthroughReset: () => {
    resetCalls++;
  },
  useWalkthroughLeafTypes: () => new Set(["globe"]),
  useWalkthroughLeafCount: () => 1,
  useWalkthroughPresetCount: () => 0,
}));

const { Walkthrough } = await import("@/components/Walkthrough");
const { CACHE_KEYS } = await import("@/lib/cacheKeys");

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
      React.createElement(Walkthrough, {
        onComplete: () => closeCalls.push(true),
        ...props,
      }),
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
  document.body.innerHTML = "";
  addTourTargets();
});

afterEach(() => {
  document.body.innerHTML = "";
});

// ── Tests ───────────────────────────────────────────────────────────

describe("Walkthrough", () => {
  test("renders overlay with first step title", () => {
    const { unmount } = render();
    expect(document.body.textContent).toContain("Welcome to SIGINT");
    unmount();
  });

  test("shows step counter 1 / 8 on first step", () => {
    const { unmount } = render();
    expect(document.body.textContent).toContain("1 / 8");
    unmount();
  });

  test("fires requestWalkthroughReset on mount", () => {
    const { unmount } = render();
    expect(resetCalls).toBeGreaterThanOrEqual(1);
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

  test("NEXT advances to step 2", () => {
    const { unmount } = render();
    clickButton("NEXT");
    expect(document.body.textContent).toContain("Data Layers");
    expect(document.body.textContent).toContain("2 / 8");
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
    expect(document.body.textContent).toContain("2 / 8");
    clickButton("BACK");
    expect(document.body.textContent).toContain("1 / 8");
    expect(document.body.textContent).toContain("Welcome to SIGINT");
    unmount();
  });

  test("SKIP calls onComplete", () => {
    const { unmount, closeCalls } = render();
    clickButton("SKIP");
    expect(closeCalls.length).toBe(1);
    unmount();
  });

  test("SKIP persists walkthroughComplete flag", async () => {
    const { unmount } = render();
    clickButton("SKIP");
    await new Promise((r) => setTimeout(r, 50));
    expect(mockStorage.get(CACHE_KEYS.walkthroughComplete)).toBe(true);
    unmount();
  });

  test("first action step (split-right) shows WAITING FOR ACTION", () => {
    const { unmount } = render();
    // 4 info steps before first action
    advanceInfoSteps(4);
    expect(document.body.textContent).toContain("Split Right");
    expect(document.body.textContent).toContain("WAITING FOR ACTION");
    const nextBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("NEXT"),
    );
    expect(nextBtn).toBeUndefined();
    unmount();
  });

  test("action step shows DO THIS badge", () => {
    const { unmount } = render();
    advanceInfoSteps(4);
    expect(document.body.textContent).toContain("DO THIS");
    unmount();
  });

  test("action step has warn accent bar", () => {
    const { unmount } = render();
    advanceInfoSteps(4);
    const warnBar = document.body.querySelector("[class*='bg-sig-warn']");
    expect(warnBar).not.toBeNull();
    unmount();
  });

  test("SKIP works on action steps", () => {
    const { unmount, closeCalls } = render();
    advanceInfoSteps(4);
    clickButton("SKIP");
    expect(closeCalls.length).toBe(1);
    unmount();
  });

  test("overlay has correct z-index", () => {
    const { unmount } = render();
    const overlay = document.body.querySelector("[class*='z-[9997]']");
    expect(overlay).not.toBeNull();
    unmount();
  });

  test("overlay has backdrop dimming via SVG", () => {
    const { unmount } = render();
    const html = document.body.innerHTML;
    expect(html).toContain("rgba(0,0,0,0.72)");
    unmount();
  });

  test("step description is visible", () => {
    const { unmount } = render();
    expect(document.body.textContent).toContain(
      "Real-time global intelligence dashboard",
    );
    unmount();
  });

  test("Escape key closes walkthrough", () => {
    const { unmount, closeCalls } = render();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(closeCalls.length).toBe(1);
    unmount();
  });

  test("progress dots rendered for essential phase (8 dots)", () => {
    const { unmount } = render();
    const dots = document.body.querySelectorAll("[class*='rounded-full']");
    expect(dots.length).toBeGreaterThanOrEqual(8);
    unmount();
  });

  test("action step overlay has pointer-events none for click-through", () => {
    const { unmount } = render();
    advanceInfoSteps(4);
    const overlay = document.body.querySelector("[class*='z-[9997]']");
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).style.pointerEvents).toBe("none");
    unmount();
  });

  test("save-preset action step description mentions VIEWS", () => {
    // Can't navigate to step 7 (save-preset) because steps 5-6 are action
    // steps that never complete with mocked leafTypes. Test via step data.
    const { ESSENTIAL_STEPS } = require("@/lib/walkthroughSteps");
    const step = ESSENTIAL_STEPS.find(
      (s: any) => s.id === "save-preset",
    );
    expect(step).toBeDefined();
    expect(step.description).toContain("VIEWS");
    expect(step.description).toContain("save");
    expect(step.mode).toBe("action");
  });
});
