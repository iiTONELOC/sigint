import { describe, expect, test } from "bun:test";
import { formatKmMi } from "@/measurements";
import { UnitMode } from "@/preferences/units/model";
import {
  MeasurementFixtureConversionInput,
  MeasurementFixtureCopy,
} from "../../../../measurements/fixtures";

describe("earthquake distance formatter", () => {
  test("formats the distance for every unit mode", () => {
    const cases: ReadonlyArray<readonly [UnitMode, MeasurementFixtureCopy]> = [
      [UnitMode.Both, MeasurementFixtureCopy.DistanceBoth],
      [UnitMode.MilesPerHour, MeasurementFixtureCopy.DistanceImperial],
      [UnitMode.Knots, MeasurementFixtureCopy.DistanceMetric],
      [UnitMode.KilometersPerHour, MeasurementFixtureCopy.DistanceMetric],
    ];

    for (const [mode, copy] of cases) {
      expect([mode, formatKmMi(MeasurementFixtureConversionInput.DistanceKilometers, mode)]).toEqual([mode, copy]);
    }
  });
});
