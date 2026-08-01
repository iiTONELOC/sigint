import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  beginFixtureCycloneWrite,
  cleanupPreferenceFixture,
  cyclonePreferenceCacheKey,
  PreferenceFixtureCount,
  PreferenceFixtureProbe,
  preferenceProbeRenders,
  preferenceProbeText,
  preferenceStorageValue,
  renderCyclonePreferenceProbe,
  resetPreferenceFixture,
  setFixtureCycloneMode,
} from "../fixtures";

beforeEach(async () => {
  await resetPreferenceFixture();
});

afterEach(() => {
  cleanupPreferenceFixture();
});

describe("cyclone preference store", () => {
  test("uses the default value", () => {
    const rendered = renderCyclonePreferenceProbe();

    expect(
      preferenceProbeText(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(String(false));
    rendered.unmount();
  });

  test("updates the synchronous read and persists both values", async () => {
    const rendered = renderCyclonePreferenceProbe();
    const enabledWrite =
      beginFixtureCycloneWrite(true);
    expect(
      preferenceProbeText(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(String(true));
    await enabledWrite;
    expect(
      await preferenceStorageValue(
        cyclonePreferenceCacheKey(),
      ),
    ).toBe(true);

    await setFixtureCycloneMode(false);
    expect(
      preferenceProbeText(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(String(false));
    expect(
      await preferenceStorageValue(
        cyclonePreferenceCacheKey(),
      ),
    ).toBe(false);
    rendered.unmount();
  });

  test("notifies a subscriber once and still persists duplicate writes", async () => {
    const rendered =
      renderCyclonePreferenceProbe();
    expect(
      preferenceProbeText(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(String(false));
    expect(
      preferenceProbeRenders(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(PreferenceFixtureCount.Single);

    await setFixtureCycloneMode(true);
    await setFixtureCycloneMode(true);

    expect(
      preferenceProbeText(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(String(true));
    expect(
      preferenceProbeRenders(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(PreferenceFixtureCount.Pair);
    expect(
      await preferenceStorageValue(
        cyclonePreferenceCacheKey(),
      ),
    ).toBe(true);

    rendered.unmount();
    await setFixtureCycloneMode(false);
    expect(
      preferenceProbeRenders(
        PreferenceFixtureProbe.Cyclones,
      ),
    ).toBe(PreferenceFixtureCount.Pair);
    expect(
      await preferenceStorageValue(
        cyclonePreferenceCacheKey(),
      ),
    ).toBe(false);
  });
});
