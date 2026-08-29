import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { canonicalEntityId } from "@/features/base/dataPoints";
import {
  getPointSourceDefinition,
  sourceForPointType,
} from "@shared/domain/pointSource";
import { RENDER_SOURCE_IDS } from "@shared/source";
import {
  cycloneForecastPoint,
} from "@/features/environmental/cyclones/data/forecastProjection";
import {
  TEST_CYCLONE_FORECAST,
  testCyclonePoint,
} from "../_support/cyclone";

// The hit test returns a rendered point type and the selection path has to turn
// that back into the source that owns the record. This mapping was hand-written
// and covered only quakes and fires, so clicking an aircraft, ship, event,
// weather alert or storm resolved to no source and cleared the selection.
describe("sourceForPointType", () => {
  test("every rendered point type resolves to its owning source", () => {
    for (const source of RENDER_SOURCE_IDS) {
      const definition = getPointSourceDefinition(source);
      expect(sourceForPointType(definition.pointType)).toBe(source);
    }
  });

  test("aircraft and ships resolve, not just the packed sources", () => {
    expect(sourceForPointType("aircraft")).toBe(Domain.Aircraft);
    expect(sourceForPointType("ships")).toBe(Domain.Ships);
    expect(sourceForPointType("quakes")).toBe(Domain.Earthquake);
    expect(sourceForPointType("fires")).toBe(Domain.Fire);
    expect(sourceForPointType("cyclones-warning")).toBe(
      Domain.CycloneWarnings,
    );
  });

  test("an unowned or absent point type resolves to null", () => {
    expect(sourceForPointType(null)).toBeNull();
    expect(sourceForPointType("not-a-layer")).toBeNull();
  });

  test("forecast interactions resolve through the cyclone source", () => {
    expect(sourceForPointType(Domain.CyclonesForecast)).toBe(Domain.Cyclones);
  });
});

describe("canonicalEntityId", () => {
  test("uses the parent source entity for a forecast point", () => {
    const cyclone = testCyclonePoint();
    const forecast = cycloneForecastPoint(
      cyclone,
      TEST_CYCLONE_FORECAST,
    );

    expect(canonicalEntityId(forecast)).toBe(cyclone.id);
  });

  test("uses the point identity for other sources", () => {
    const cyclone = testCyclonePoint();

    expect(canonicalEntityId(cyclone)).toBe(cyclone.id);
  });
});
