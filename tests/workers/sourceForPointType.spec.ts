import { describe, expect, test } from "bun:test";
import {
  POINT_SOURCE_DEFINITIONS,
  sourceForPointType,
} from "@/workers/data/sources/registry";

// The hit test returns a rendered point type and the selection path has to turn
// that back into the source that owns the record. This mapping was hand-written
// and covered only quakes and fires, so clicking an aircraft, ship, event,
// weather alert or storm resolved to no source and cleared the selection.
describe("sourceForPointType", () => {
  test("every rendered point type resolves to its owning source", () => {
    for (const definition of POINT_SOURCE_DEFINITIONS) {
      expect(sourceForPointType(definition.pointType)).toBe(definition.id);
    }
  });

  test("aircraft and ships resolve, not just the packed sources", () => {
    expect(sourceForPointType("aircraft")).toBe("aircraft");
    expect(sourceForPointType("ships")).toBe("ships");
    expect(sourceForPointType("quakes")).toBe("earthquake");
    expect(sourceForPointType("fires")).toBe("fire");
  });

  test("an unowned or absent point type resolves to null", () => {
    expect(sourceForPointType(null)).toBeNull();
    expect(sourceForPointType("cyclones-warning")).toBeNull();
    expect(sourceForPointType("not-a-layer")).toBeNull();
  });
});
