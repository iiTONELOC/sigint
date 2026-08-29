import { describe, expect, test } from "bun:test";
import {
  formatNmKm,
  formatPressureMb,
} from "@/features/environmental/cyclones/formatters/units";
import {
  MeasurementFixtureCopy,
  MeasurementFixtureCycloneInput,
} from "../../../../measurements/fixtures";

describe("cyclone unit formatters", () => {
  test("formats pressure and nautical distance", () => {
    expect(
      formatPressureMb(
        MeasurementFixtureCycloneInput
          .PressureMillibars,
      ),
    ).toBe(MeasurementFixtureCopy.Pressure);
    expect(
      formatNmKm(
        MeasurementFixtureCycloneInput
          .NauticalMiles,
      ),
    ).toBe(
      MeasurementFixtureCopy.NauticalDistance,
    );
  });
});
