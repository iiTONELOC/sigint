import { describe, test, expect } from "bun:test";
import {
  themes,
  LAYER_COLOR_KEYS,
  LAYER_COLOR_LABELS,
  applyColorOverrides,
  getColorMap,
} from "@/config/theme";

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
    for (const mode of ["dark", "light"] as const) {
      for (const [key, value] of Object.entries(themes[mode].colors)) {
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("LAYER_COLOR_KEYS has 6 entries", () => {
    expect(LAYER_COLOR_KEYS.length).toBe(6);
    expect(LAYER_COLOR_KEYS).toContain("aircraft");
    expect(LAYER_COLOR_KEYS).toContain("ships");
    expect(LAYER_COLOR_KEYS).toContain("events");
    expect(LAYER_COLOR_KEYS).toContain("quakes");
    expect(LAYER_COLOR_KEYS).toContain("fires");
    expect(LAYER_COLOR_KEYS).toContain("weather");
  });

  test("every layer key has a label", () => {
    for (const key of LAYER_COLOR_KEYS) {
      expect(LAYER_COLOR_LABELS[key]).toBeDefined();
      expect(typeof LAYER_COLOR_LABELS[key]).toBe("string");
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

  test("getColorMap returns 6 layer colors", () => {
    const map = getColorMap(themes.dark);
    expect(Object.keys(map).length).toBe(6);
    expect(map.aircraft).toBe(themes.dark.colors.aircraft);
    expect(map.ships).toBe(themes.dark.colors.ships);
  });

  test("dark and light themes have different bg colors", () => {
    expect(themes.dark.colors.bg).not.toBe(themes.light.colors.bg);
  });
});
