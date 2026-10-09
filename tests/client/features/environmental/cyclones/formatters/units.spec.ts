import { describe, expect, test } from "bun:test";
import { formatPressureMb } from "@/features/environmental/cyclones/formatters/units";
import { formatNauticalMiles } from "@/measurements";
import { UnitMode } from "@/preferences/units/model";
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
      formatNauticalMiles(
        MeasurementFixtureCycloneInput
          .NauticalMiles,
        UnitMode.Both,
      ),
    ).toBe(
      MeasurementFixtureCopy.NauticalDistance,
    );
  });
});
