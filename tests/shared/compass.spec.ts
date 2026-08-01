import { describe, expect, test } from "bun:test";
import {
  CompassPoint,
  cardinalCompassPointForDegrees,
  compassPointForDegrees,
} from "@shared/domain/compass";

enum CompassFixtureDegrees {
  North = 0,
  NorthNortheast = 22.5,
  Northwest = 315,
  WrappedNorth = 360,
  NegativeWest = -90,
}

describe("compass domain", () => {
  test("owns unique points", () => {
    const points = Object.values(CompassPoint);
    expect(new Set(points).size).toBe(points.length);
  });

  test("resolves compass sectors and wrapped bearings", () => {
    expect(
      compassPointForDegrees(CompassFixtureDegrees.North),
    ).toBe(CompassPoint.North);
    expect(
      compassPointForDegrees(CompassFixtureDegrees.NorthNortheast),
    ).toBe(CompassPoint.NorthNortheast);
    expect(
      compassPointForDegrees(CompassFixtureDegrees.Northwest),
    ).toBe(CompassPoint.Northwest);
    expect(
      compassPointForDegrees(CompassFixtureDegrees.WrappedNorth),
    ).toBe(CompassPoint.North);
    expect(
      compassPointForDegrees(CompassFixtureDegrees.NegativeWest),
    ).toBe(CompassPoint.West);
  });

  test("resolves only cardinal bearings for a four-point display", () => {
    expect(
      cardinalCompassPointForDegrees(CompassFixtureDegrees.North),
    ).toBe(CompassPoint.North);
    expect(
      cardinalCompassPointForDegrees(
        CompassFixtureDegrees.NorthNortheast,
      ),
    ).toBeNull();
  });
});
