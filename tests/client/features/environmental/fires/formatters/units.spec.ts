import { describe, expect, test } from "bun:test";
import { formatPixelKm, formatTempCF } from "@/features/environmental/fires/formatters/units";
import { UnitMode } from "@/preferences/units/model";
import {
  MeasurementFixtureCopy,
  MeasurementFixtureFireInput,
} from "../../../../measurements/fixtures";

describe("fire unit formatters", () => {
  test("formats the footprint and the temperature for every unit mode", () => {
    const cases: ReadonlyArray<readonly [UnitMode, MeasurementFixtureCopy, MeasurementFixtureCopy]> = [
      [UnitMode.Both, MeasurementFixtureCopy.FootprintBoth, MeasurementFixtureCopy.TemperatureBoth],
      [UnitMode.MilesPerHour, MeasurementFixtureCopy.FootprintImperial, MeasurementFixtureCopy.TemperatureImperial],
      [UnitMode.Knots, MeasurementFixtureCopy.FootprintMetric, MeasurementFixtureCopy.TemperatureMetric],
      [UnitMode.KilometersPerHour, MeasurementFixtureCopy.FootprintMetric, MeasurementFixtureCopy.TemperatureMetric],
    ];

    for (const [mode, footprint, temperature] of cases) {
      const formatted = [
        formatPixelKm(MeasurementFixtureFireInput.ScanKilometers, MeasurementFixtureFireInput.TrackKilometers, mode),
        formatTempCF(MeasurementFixtureFireInput.BrightnessKelvin, mode),
      ];
      expect([mode, ...formatted]).toEqual([mode, footprint, temperature]);
    }
  });
});
