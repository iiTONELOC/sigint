import { describe, test, expect } from "bun:test";
import {
  LAYER_COLOR_METADATA,
  themes,
  applyColorOverrides,
  getColorMap,
} from "@/theme";
import { Domain } from "@shared/domain/identity";

// ── WCAG contrast helpers (Hard Rule 15) ───────────────────────────
// Inline, not added to production code. Computes WCAG 2.x relative
// luminance and the contrast ratio between two sRGB hex colors.

function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(c1: string, c2: string): number {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme config", () => {
  test("dark and light themes exist", () => {
    expect(themes.dark).toBeDefined();
    expect(themes.light).toBeDefined();
  });

  test("both themes have all required color keys", () => {
    const requiredKeys = [
      "bg",
      "panel",
      "border",
      "accent",
      "coast",
      "coastFill",
      "ocean",
      "oceanDeep",
      "grid",
      "ships",
      "aircraft",
      "events",
      "quakes",
      "fires",
      "weather",
      "cyclones",
      "text",
      "dim",
      "bright",
      "danger",
      "warn",
    ];
    for (const key of requiredKeys) {
      expect((themes.dark.colors as any)[key]).toBeDefined();
      expect((themes.light.colors as any)[key]).toBeDefined();
    }
  });

  test("all color values are valid hex strings", () => {
    for (const theme of Object.values(themes)) {
      for (const [key, value] of Object.entries(theme.colors)) {
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("layer color metadata owns all 7 configurable layers", () => {
    const keys = Object.keys(LAYER_COLOR_METADATA);
    expect(keys).toHaveLength(7);
    expect(keys).toContain(Domain.Aircraft);
    expect(keys).toContain(Domain.Ships);
    expect(keys).toContain(Domain.Events);
    expect(keys).toContain(Domain.Quakes);
    expect(keys).toContain(Domain.Fires);
    expect(keys).toContain(Domain.Weather);
    expect(keys).toContain(Domain.Cyclones);
  });

  test("every layer key has a label", () => {
    for (const metadata of Object.values(LAYER_COLOR_METADATA)) {
      expect(metadata.label).toBeDefined();
      expect(typeof metadata.label).toBe("string");
    }
  });

  test("applyColorOverrides returns base when no overrides", () => {
    const result = applyColorOverrides(themes.dark.colors, undefined);
    expect(result).toBe(themes.dark.colors);
  });

  test("applyColorOverrides merges overrides", () => {
    const result = applyColorOverrides(themes.dark.colors, {
      aircraft: "#ff0000",
    });
    expect(result.aircraft).toBe("#ff0000");
    expect(result.ships).toBe(themes.dark.colors.ships);
  });

  test("getColorMap returns the 7 layer colors plus the cyclone render aliases", () => {
    const map = getColorMap(themes.dark);
    // 7 user-customizable layers + 2 render aliases ("cyclones-forecast" and
    // "cyclones-warning") that mirror the cyclones color so forecast-track
    // points and warning areas (read by raw type) never resolve to undefined.
    expect(Object.keys(map)).toHaveLength(9);
    expect(map.aircraft).toBe(themes.dark.colors.aircraft);
    expect(map.ships).toBe(themes.dark.colors.ships);
    expect(map.cyclones).toBe(themes.dark.colors.cyclones);
    expect(map["cyclones-forecast"]).toBe(themes.dark.colors.cyclones);
    expect(map["cyclones-warning"]).toBe(themes.dark.colors.cyclones);
  });

  test("dark and light themes have different bg colors", () => {
    expect(themes.dark.colors.bg).not.toBe(themes.light.colors.bg);
  });

  // ── Cyclone layer color (step 2) ────────────────────────────────

  test("cyclone color uses hurricane red, distinct from events magenta", () => {
    // Original spec used magenta (#ff66cc / #a31a6a) but it collided with
    // events (#dd44aa / #e62e8a), only 2-9° hue separation. Hurricane red
    // gives ~150° separation and matches the meteorological convention for
    // tropical cyclones on radar/satellite displays.
    expect(themes.dark.colors.cyclones).toBe("#ff2b3d");
    expect(themes.light.colors.cyclones).toBe("#a3001a");
  });

  test("cyclone color label is human-readable", () => {
    const label = LAYER_COLOR_METADATA[Domain.Cyclones].label;
    expect(label).toBeDefined();
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  // ── WCAG 2.2 AA contrast (Hard Rule 15) ─────────────────────────
  // Verify the new cyclone color clears 4.5:1 against bg and panel in
  // both themes. Helpers are at module scope above.

  const cyclonePairs: Array<{ label: string; fg: () => string; bg: () => string }> = [
    {
      label: "dark theme bg",
      fg: () => themes.dark.colors.cyclones,
      bg: () => themes.dark.colors.bg,
    },
    {
      label: "dark theme panel",
      fg: () => themes.dark.colors.cyclones,
      bg: () => themes.dark.colors.panel,
    },
    {
      label: "light theme bg",
      fg: () => themes.light.colors.cyclones,
      bg: () => themes.light.colors.bg,
    },
    {
      label: "light theme panel",
      fg: () => themes.light.colors.cyclones,
      bg: () => themes.light.colors.panel,
    },
  ];

  for (const { label, fg, bg } of cyclonePairs) {
    test(`cyclone color clears WCAG AA 4.5:1 against ${label}`, () => {
      expect(contrast(fg(), bg())).toBeGreaterThanOrEqual(4.5);
    });
  }
});
