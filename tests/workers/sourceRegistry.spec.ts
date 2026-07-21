import { describe, expect, test } from "bun:test";
import {
  POINT_SOURCE_DEFINITIONS,
  getPointSourceDefinition,
} from "@/workers/data/sources/registry";
import { RENDER_SOURCE_IDS } from "@/workers/data/sourceIds";

describe("point source registry", () => {
  test("defines each render source one time", () => {
    expect(
      POINT_SOURCE_DEFINITIONS.map((definition) => definition.id),
    ).toEqual(Array.from(RENDER_SOURCE_IDS));
    expect(
      new Set(
        POINT_SOURCE_DEFINITIONS.map((definition) => definition.cacheKey),
      ).size,
    ).toBe(POINT_SOURCE_DEFINITIONS.length);
  });

  test("keeps source policy in the registry", () => {
    const aircraft = getPointSourceDefinition("aircraft");
    expect(aircraft.pollIntervalMs).toBeGreaterThan(0);
    expect(aircraft.emptyResultIsComplete).toBe(true);

    const events = getPointSourceDefinition("events");
    expect(events.completeness).toBe("partial");
  });
});
