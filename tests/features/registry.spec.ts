import { describe, test, expect } from "bun:test";
import type { DataType } from "@/features/base/dataPoints";
import { featureList, featureRegistry } from "@/features/registry";
import { Domain } from "@shared/domain/identity";

describe("feature registry", () => {
  test("featureList includes the cyclone feature (added in step 7)", () => {
    const ids = featureList.map((f) => f.id).sort();
    expect(ids).toContain(Domain.Cyclones);
  });

  test("featureRegistry resolves 'cyclones' to a FeatureDefinition", () => {
    const def = featureRegistry.get(Domain.Cyclones);
    expect(def).toBeDefined();
    expect(def?.id).toBe(Domain.Cyclones);
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
    const expected: DataType[] = [
      Domain.Aircraft,
      Domain.Ships,
      Domain.Events,
      Domain.Quakes,
      Domain.Fires,
      Domain.Weather,
      Domain.Cyclones,
      Domain.CyclonesForecast,
      Domain.CyclonesWarning,
    ];
    expected.sort();
    const ids = featureList.map((f) => f.id).sort();
    expect(ids).toEqual(expected);
  });

  test("featureRegistry resolves 'cyclones-forecast' to a FeatureDefinition", () => {
    const def = featureRegistry.get(Domain.CyclonesForecast);
    expect(def).toBeDefined();
    expect(def?.id).toBe(Domain.CyclonesForecast);
    expect(def?.label.length).toBeGreaterThan(0);
  });
});
