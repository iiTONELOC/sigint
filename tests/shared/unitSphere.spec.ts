import { describe, expect, test } from "bun:test";
import {
  advanceGeographicMotion,
  advanceUnitMotion,
  createGeographicMotion,
  createGlobeRotationMatrix,
  geographicToUnitVector,
  projectGeographicPoint,
  projectUnitVector,
  projectUnitVectorInto,
} from "@/lib/geo/unitSphere";

describe("unit sphere projection", () => {
  test("converts canonical coordinates to the existing globe orientation", () => {
    expect(geographicToUnitVector(0, 0)).toEqual({ x: 1, y: 0, z: -0 });

    const northPole = geographicToUnitVector(90, 0);
    expect(northPole.x).toBeCloseTo(0, 12);
    expect(northPole.y).toBeCloseTo(1, 12);
    expect(northPole.z).toBeCloseTo(0, 12);

    const front = geographicToUnitVector(0, -90);
    expect(front.x).toBeCloseTo(0, 12);
    expect(front.y).toBeCloseTo(0, 12);
    expect(front.z).toBeCloseTo(1, 12);
  });

  test("keeps converted coordinates normalized", () => {
    const unit = geographicToUnitVector(28.6, -86);
    const length = Math.hypot(unit.x, unit.y, unit.z);
    expect(length).toBeCloseTo(1, 12);
  });

  test("composes one camera matrix with retained unit vectors", () => {
    const unit = geographicToUnitVector(28.6, -86);
    const matrix = createGlobeRotationMatrix(0.7, -0.25);
    const projected = projectUnitVector(unit, matrix, 400, 300, 240);
    const output = { x: 0, y: 0, z: 0 };
    projectUnitVectorInto(unit, matrix, 400, 300, 240, output);
    expect(output).toEqual(projected);
    const direct = projectGeographicPoint(
      28.6,
      -86,
      400,
      300,
      240,
      0.7,
      -0.25,
    );

    expect(projected.x).toBeCloseTo(direct.x, 12);
    expect(projected.y).toBeCloseTo(direct.y, 12);
    expect(projected.z).toBeCloseTo(direct.z, 12);
  });
  test("advances moving entities without frame-path trigonometry", () => {
    const motion = createGeographicMotion(0, 0, 90, 250);
    const position = advanceGeographicMotion(motion, 60);
    const unit = advanceUnitMotion(motion, 60);

    expect(position.latitude).toBeCloseTo(0, 12);
    expect(position.longitude).toBeGreaterThan(0);
    expect(unit.z).toBeLessThan(0);
    expect(Math.hypot(unit.x, unit.y, unit.z)).toBeCloseTo(1, 12);
  });

});
