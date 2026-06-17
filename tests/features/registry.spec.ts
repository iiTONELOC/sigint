import { describe, test, expect } from "bun:test";
import { featureList, featureRegistry } from "@/features/registry";

describe("feature registry", () => {
  test("featureList includes the cyclone feature (added in step 7)", () => {
    const ids = featureList.map((f) => f.id).sort();
    expect(ids).toContain("cyclones");
  });

  test("featureRegistry resolves 'cyclones' to a FeatureDefinition", () => {
    const def = featureRegistry.get("cyclones");
    expect(def).toBeDefined();
    expect(def?.id).toBe("cyclones");
    expect(def?.label.length).toBeGreaterThan(0);
  });

  test("featureRegistry size matches featureList length (no duplicates)", () => {
    expect(featureRegistry.size).toBe(featureList.length);
  });

  test("registry covers every DataPoint type in scope", () => {
    // "cyclones-forecast" (synthetic per-track-point) and "cyclones-warning"
    // (clicked watch/warning polygon) are registered so DetailPanel and other
    // featureRegistry consumers resolve them without null-coalescing every call
    // site, even though neither is a point layer in allData.
    const expected = [
      "aircraft",
      "ships",
      "events",
      "quakes",
      "fires",
      "weather",
      "cyclones",
      "cyclones-forecast",
      "cyclones-warning",
    ].sort();
    const ids = featureList.map((f) => f.id).sort();
    expect(ids).toEqual(expected);
  });

  test("featureRegistry resolves 'cyclones-forecast' to a FeatureDefinition", () => {
    const def = featureRegistry.get("cyclones-forecast");
    expect(def).toBeDefined();
    expect(def?.id).toBe("cyclones-forecast");
    expect(def?.label.length).toBeGreaterThan(0);
  });
});
