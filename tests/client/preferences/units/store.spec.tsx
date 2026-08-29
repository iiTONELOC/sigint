import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { UnitMode } from "@/preferences/units/model";
import {
  beginFixtureUnitModeWrite,
  cleanupPreferenceFixture,
  currentFixtureUnitMode,
  PreferenceFixtureCount,
  PreferenceFixtureProbe,
  preferenceProbeRenders,
  preferenceProbeText,
  preferenceStorageValue,
  renderUnitPreferenceProbe,
  resetPreferenceFixture,
  setFixtureUnitMode,
  unitsPreferenceCacheKey,
} from "../fixtures";

beforeEach(async () => {
  await resetPreferenceFixture();
});

afterEach(() => {
  cleanupPreferenceFixture();
});

describe("units preference store", () => {
  test("uses the default mode", () => {
    expect(currentFixtureUnitMode()).toBe(
      UnitMode.Both,
    );
  });

  test("persists every owned mode", async () => {
    for (const mode of Object.values(UnitMode)) {
      await setFixtureUnitMode(mode);
      expect(currentFixtureUnitMode()).toBe(mode);
      expect(
        await preferenceStorageValue(
          unitsPreferenceCacheKey(),
        ),
      ).toBe(mode);
    }
  });

  test("updates the synchronous read before persistence settles", async () => {
    const write = beginFixtureUnitModeWrite(
      UnitMode.MilesPerHour,
    );

    expect(currentFixtureUnitMode()).toBe(
      UnitMode.MilesPerHour,
    );
    await write;
    expect(
      await preferenceStorageValue(
        unitsPreferenceCacheKey(),
      ),
    ).toBe(UnitMode.MilesPerHour);
  });

  test("notifies a subscriber once and still persists duplicate writes", async () => {
    const rendered = renderUnitPreferenceProbe();
    expect(
      preferenceProbeText(
        PreferenceFixtureProbe.Units,
      ),
    ).toBe(UnitMode.Both);
    expect(
      preferenceProbeRenders(
        PreferenceFixtureProbe.Units,
      ),
    ).toBe(PreferenceFixtureCount.Single);

    await setFixtureUnitMode(UnitMode.Knots);
    await setFixtureUnitMode(UnitMode.Knots);

    expect(
      preferenceProbeText(
        PreferenceFixtureProbe.Units,
      ),
    ).toBe(UnitMode.Knots);
    expect(
      preferenceProbeRenders(
        PreferenceFixtureProbe.Units,
      ),
    ).toBe(PreferenceFixtureCount.Pair);
    expect(
      await preferenceStorageValue(
        unitsPreferenceCacheKey(),
      ),
    ).toBe(UnitMode.Knots);

    rendered.unmount();
    await setFixtureUnitMode(
      UnitMode.KilometersPerHour,
    );
    expect(
      preferenceProbeRenders(
        PreferenceFixtureProbe.Units,
      ),
    ).toBe(PreferenceFixtureCount.Pair);
    expect(
      await preferenceStorageValue(
        unitsPreferenceCacheKey(),
      ),
    ).toBe(UnitMode.KilometersPerHour);
  });
});
