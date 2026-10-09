import { describe, expect, test } from "bun:test";
import type { CycloneHazards } from "@shared/domain/cyclones";
import { cyclonePointsEqual } from "@/workers/data/sources/cyclones";
import { testCyclonePoint } from "../_support/cyclone";

const NO_HAZARDS: CycloneHazards = { threats: [], peakSurge: [], windChances: [], arrival: {} };
const NEW_SURGE: CycloneHazards = {
  ...NO_HAZARDS,
  peakSurge: [{ area: "Pensacola Bay", range: "4-6 ft", rings: [[[-87.2, 30.3], [-87.1, 30.4], [-87.0, 30.3]]] }],
};

describe("cyclonePointsEqual", () => {
  test("a hazard update alone counts as a change, so the map redraws without a reload", () => {
    const before = testCyclonePoint({ hazards: NO_HAZARDS });
    const after = testCyclonePoint({ hazards: NEW_SURGE });
    expect(cyclonePointsEqual(before, after)).toBe(false);
  });

  test("identical hazards are not a change", () => {
    expect(cyclonePointsEqual(testCyclonePoint({ hazards: NEW_SURGE }), testCyclonePoint({ hazards: NEW_SURGE }))).toBe(true);
  });
});
