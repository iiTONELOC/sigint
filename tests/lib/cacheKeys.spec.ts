import { describe, test, expect } from "bun:test";
import { CACHE_KEYS, CACHE_KEY_LABELS } from "@/lib/cacheKeys";

describe("cacheKeys", () => {
  test("all keys include version prefix", () => {
    for (const value of Object.values(CACHE_KEYS)) {
      expect(value).toContain(".v1");
    }
  });

  test("all keys are unique", () => {
    const values = Object.values(CACHE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  test("expected data keys exist", () => {
    expect(CACHE_KEYS.aircraft).toBeDefined();
    expect(CACHE_KEYS.earthquake).toBeDefined();
    expect(CACHE_KEYS.events).toBeDefined();
    expect(CACHE_KEYS.ships).toBeDefined();
    expect(CACHE_KEYS.fires).toBeDefined();
    expect(CACHE_KEYS.weather).toBeDefined();
    expect(CACHE_KEYS.trails).toBeDefined();
    expect(CACHE_KEYS.news).toBeDefined();
  });

  test("expected UI keys exist", () => {
    expect(CACHE_KEYS.layout).toBeDefined();
    expect(CACHE_KEYS.theme).toBeDefined();
    expect(CACHE_KEYS.colorOverrides).toBeDefined();
    expect(CACHE_KEYS.videoState).toBeDefined();
  });

  test("every key has a label", () => {
    for (const value of Object.values(CACHE_KEYS)) {
      const label = CACHE_KEY_LABELS[value];
      expect(label).toBeDefined();
      expect(label!.label.length).toBeGreaterThan(0);
      expect(["Data", "UI"]).toContain(label!.group);
    }
  });
});
