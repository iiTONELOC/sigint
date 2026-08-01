import {
  describe,
  expect,
  test,
} from "bun:test";
import {
  isUnitMode,
  UnitMode,
} from "@/preferences/units";
import {
  PreferenceFixtureInvalid,
} from "../fixtures";

describe("unit mode model", () => {
  test("owns unique values", () => {
    const values = Object.values(UnitMode);
    expect(new Set(values).size).toBe(values.length);
  });

  test("accepts every owned unit mode", () => {
    for (const mode of Object.values(UnitMode)) {
      expect(isUnitMode(mode)).toBe(true);
    }
  });

  test("rejects an invalid persisted value", () => {
    expect(
      isUnitMode(
        PreferenceFixtureInvalid.UnitMode,
      ),
    ).toBe(false);
  });
});
