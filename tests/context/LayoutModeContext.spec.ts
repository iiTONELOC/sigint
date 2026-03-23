// ── Layout mode tests ───────────────────────────────────────────────
// Tests the computeIsMobile logic and LayoutMode cycling.
// The context provider wraps React state + IndexedDB persistence,
// but the core decision logic is a pure function we can test directly.
// We also test the cycle order and persistence key.

import { describe, test, expect } from "bun:test";
import { CACHE_KEYS } from "@/lib/cacheKeys";

// ── Replicate computeIsMobile from LayoutModeContext.tsx ─────────────

type LayoutMode = "auto" | "mobile" | "desktop";

function computeIsMobile(mode: LayoutMode, width: number): boolean {
  if (mode === "mobile") return true;
  if (mode === "desktop") return false;
  return width < 768;
}

// ── Replicate cycle logic ───────────────────────────────────────────

const CYCLE_ORDER: LayoutMode[] = ["auto", "mobile", "desktop"];

function cycleMode(current: LayoutMode): LayoutMode {
  const idx = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!;
}

// ── Tests: computeIsMobile ──────────────────────────────────────────

describe("computeIsMobile", () => {
  test("auto mode: narrow viewport (< 768) returns true", () => {
    expect(computeIsMobile("auto", 375)).toBe(true);
    expect(computeIsMobile("auto", 767)).toBe(true);
  });

  test("auto mode: wide viewport (>= 768) returns false", () => {
    expect(computeIsMobile("auto", 768)).toBe(false);
    expect(computeIsMobile("auto", 1024)).toBe(false);
    expect(computeIsMobile("auto", 1920)).toBe(false);
  });

  test("auto mode: exact breakpoint 768 returns false", () => {
    expect(computeIsMobile("auto", 768)).toBe(false);
  });

  test("mobile mode: always returns true regardless of viewport", () => {
    expect(computeIsMobile("mobile", 375)).toBe(true);
    expect(computeIsMobile("mobile", 768)).toBe(true);
    expect(computeIsMobile("mobile", 1024)).toBe(true);
    expect(computeIsMobile("mobile", 1920)).toBe(true);
    expect(computeIsMobile("mobile", 2560)).toBe(true);
  });

  test("desktop mode: always returns false regardless of viewport", () => {
    expect(computeIsMobile("desktop", 320)).toBe(false);
    expect(computeIsMobile("desktop", 375)).toBe(false);
    expect(computeIsMobile("desktop", 767)).toBe(false);
    expect(computeIsMobile("desktop", 768)).toBe(false);
    expect(computeIsMobile("desktop", 1024)).toBe(false);
  });

  test("iPad viewport (1024) in auto mode renders desktop", () => {
    expect(computeIsMobile("auto", 1024)).toBe(false);
  });

  test("iPad viewport (1024) in mobile mode renders mobile", () => {
    expect(computeIsMobile("mobile", 1024)).toBe(true);
  });

  test("narrow desktop (600px) in auto mode renders mobile", () => {
    expect(computeIsMobile("auto", 600)).toBe(true);
  });

  test("narrow desktop (600px) in desktop mode renders desktop", () => {
    expect(computeIsMobile("desktop", 600)).toBe(false);
  });
});

// ── Tests: cycle logic ──────────────────────────────────────────────

describe("cycleMode", () => {
  test("auto → mobile", () => {
    expect(cycleMode("auto")).toBe("mobile");
  });

  test("mobile → desktop", () => {
    expect(cycleMode("mobile")).toBe("desktop");
  });

  test("desktop → auto", () => {
    expect(cycleMode("desktop")).toBe("auto");
  });

  test("full cycle returns to start", () => {
    let mode: LayoutMode = "auto";
    mode = cycleMode(mode); // mobile
    mode = cycleMode(mode); // desktop
    mode = cycleMode(mode); // auto
    expect(mode).toBe("auto");
  });
});

// ── Tests: persistence key ──────────────────────────────────────────

describe("layout mode persistence", () => {
  test("cache key exists and is versioned", () => {
    expect(CACHE_KEYS.layoutMode).toBeDefined();
    expect(CACHE_KEYS.layoutMode).toContain(".v1");
  });

  test("cache key is unique among all keys", () => {
    const values = Object.values(CACHE_KEYS);
    const count = values.filter((v) => v === CACHE_KEYS.layoutMode).length;
    expect(count).toBe(1);
  });
});

// ── Tests: valid mode values ────────────────────────────────────────

describe("mode validation", () => {
  test("only 3 valid modes exist", () => {
    expect(CYCLE_ORDER).toEqual(["auto", "mobile", "desktop"]);
    expect(CYCLE_ORDER).toHaveLength(3);
  });

  test("invalid saved value should not be accepted", () => {
    // Simulates the hydration guard in the provider
    const isValid = (saved: unknown): saved is LayoutMode =>
      saved === "mobile" || saved === "desktop" || saved === "auto";

    expect(isValid("auto")).toBe(true);
    expect(isValid("mobile")).toBe(true);
    expect(isValid("desktop")).toBe(true);
    expect(isValid("")).toBe(false);
    expect(isValid("tablet")).toBe(false);
    expect(isValid(null)).toBe(false);
    expect(isValid(undefined)).toBe(false);
    expect(isValid(42)).toBe(false);
  });
});

// ── Tests: layout key selection ─────────────────────────────────────
// When mode changes, PaneManager should load from the correct device key.

describe("layout key selection by mode", () => {
  function layoutKeyForMode(mode: LayoutMode, viewportWidth: number): string {
    const isMobile = computeIsMobile(mode, viewportWidth);
    return isMobile ? CACHE_KEYS.layoutMobile : CACHE_KEYS.layoutDesktop;
  }

  test("auto + wide viewport loads desktop layout", () => {
    expect(layoutKeyForMode("auto", 1024)).toBe(CACHE_KEYS.layoutDesktop);
  });

  test("auto + narrow viewport loads mobile layout", () => {
    expect(layoutKeyForMode("auto", 375)).toBe(CACHE_KEYS.layoutMobile);
  });

  test("forced mobile on wide viewport loads mobile layout", () => {
    expect(layoutKeyForMode("mobile", 1920)).toBe(CACHE_KEYS.layoutMobile);
  });

  test("forced desktop on narrow viewport loads desktop layout", () => {
    expect(layoutKeyForMode("desktop", 375)).toBe(CACHE_KEYS.layoutDesktop);
  });

  test("mobile and desktop layout keys are independent", () => {
    expect(CACHE_KEYS.layoutMobile).not.toBe(CACHE_KEYS.layoutDesktop);
  });

  test("mobile and desktop preset keys are independent", () => {
    expect(CACHE_KEYS.layoutPresetsMobile).not.toBe(
      CACHE_KEYS.layoutPresetsDesktop,
    );
  });
});

// ── Tests: default state ────────────────────────────────────────────

describe("default layout mode", () => {
  test("default mode is auto", () => {
    // The provider initializes with "auto" before any cache hydration
    const defaultMode: LayoutMode = "auto";
    expect(defaultMode).toBe("auto");
  });

  test("auto mode on typical desktop (1280px) renders desktop", () => {
    expect(computeIsMobile("auto", 1280)).toBe(false);
  });

  test("auto mode on typical phone (390px) renders mobile", () => {
    expect(computeIsMobile("auto", 390)).toBe(true);
  });
});

// ── Tests: preset key isolation per mode ────────────────────────────

describe("preset isolation", () => {
  function presetsKeyForMode(mode: LayoutMode, viewportWidth: number): string {
    const isMobile = computeIsMobile(mode, viewportWidth);
    return isMobile
      ? CACHE_KEYS.layoutPresetsMobile
      : CACHE_KEYS.layoutPresetsDesktop;
  }

  test("forced mobile uses mobile presets even on wide screen", () => {
    expect(presetsKeyForMode("mobile", 1920)).toBe(
      CACHE_KEYS.layoutPresetsMobile,
    );
  });

  test("forced desktop uses desktop presets even on narrow screen", () => {
    expect(presetsKeyForMode("desktop", 375)).toBe(
      CACHE_KEYS.layoutPresetsDesktop,
    );
  });

  test("auto uses viewport-appropriate presets", () => {
    expect(presetsKeyForMode("auto", 375)).toBe(
      CACHE_KEYS.layoutPresetsMobile,
    );
    expect(presetsKeyForMode("auto", 1024)).toBe(
      CACHE_KEYS.layoutPresetsDesktop,
    );
  });
});
