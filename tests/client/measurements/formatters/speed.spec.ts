import { describe, expect, test } from "bun:test";
import { formatKtMph, formatKtShort } from "@/measurements";
import { UnitMode } from "@/preferences/units/model";
import {
  MeasurementFixtureConversionInput,
  MeasurementFixtureCopy,
} from "../fixtures";

describe("speed formatters", () => {
  test("formats the full and the short speed for every unit mode", () => {
    const cases: ReadonlyArray<readonly [UnitMode, MeasurementFixtureCopy, MeasurementFixtureCopy]> = [
      [UnitMode.Both, MeasurementFixtureCopy.SpeedBoth, MeasurementFixtureCopy.SpeedShortBoth],
      [UnitMode.Knots, MeasurementFixtureCopy.SpeedKnots, MeasurementFixtureCopy.SpeedShortKnots],
      [UnitMode.MilesPerHour, MeasurementFixtureCopy.SpeedMilesPerHour, MeasurementFixtureCopy.SpeedShortMilesPerHour],
      [UnitMode.KilometersPerHour, MeasurementFixtureCopy.SpeedKilometersPerHour, MeasurementFixtureCopy.SpeedShortKilometersPerHour],
    ];

    for (const [mode, full, short] of cases) {
      const formatted = [
        formatKtMph(MeasurementFixtureConversionInput.Knots, mode),
        formatKtShort(MeasurementFixtureConversionInput.Knots, mode),
      ];
      expect([mode, ...formatted]).toEqual([mode, full, short]);
    }
  });
});
