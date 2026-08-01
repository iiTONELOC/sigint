import {
  act,
  type ReactElement,
} from "react";
import {
  cacheDelete,
  cacheGet,
} from "@/lib/cache/storageService";
import {
  CacheKey,
} from "@shared/domain/cache";
import {
  UnitMode,
} from "@/preferences/units";
import {
  cleanupReactRoots,
  renderReact,
  type ReactRenderResult,
} from "../../../support/react";
import {
  PreferenceFixtureCount,
  PreferenceFixtureProbe,
  PreferenceFixtureTestError,
} from "./model";

import {
  getUnitsMode,
  setUnitsMode,
  useUnitsMode,
} from "@/preferences/units";
import {
  setAlwaysShowCyclones,
  useAlwaysShowCyclones,
} from "@/preferences/cyclones";

let cycloneRenderCount =
  PreferenceFixtureCount.Empty;
let unitRenderCount =
  PreferenceFixtureCount.Empty;

function CyclonePreferenceProbe():
  ReactElement {
  cycloneRenderCount +=
    PreferenceFixtureCount.Single;
  return (
    <output id={PreferenceFixtureProbe.Cyclones}>
      {String(useAlwaysShowCyclones())}
    </output>
  );
}

function UnitPreferenceProbe():
  ReactElement {
  unitRenderCount +=
    PreferenceFixtureCount.Single;
  return (
    <output id={PreferenceFixtureProbe.Units}>
      {useUnitsMode()}
    </output>
  );
}

function requireProbe(
  probe: PreferenceFixtureProbe,
): HTMLOutputElement {
  const output = document.getElementById(probe);
  if (!(output instanceof HTMLOutputElement)) {
    throw new TypeError(
      PreferenceFixtureTestError.ProbeMissing,
    );
  }
  return output;
}

export async function resetPreferenceFixture():
  Promise<void> {
  cleanupReactRoots();
  await setUnitsMode(UnitMode.Both);
  await setAlwaysShowCyclones(false);
  await cacheDelete(CacheKey.Units);
  await cacheDelete(CacheKey.AlwaysShowCyclones);
  cycloneRenderCount =
    PreferenceFixtureCount.Empty;
  unitRenderCount =
    PreferenceFixtureCount.Empty;
  document.body.replaceChildren();
}

export function cleanupPreferenceFixture():
  void {
  cleanupReactRoots();
  document.body.replaceChildren();
}

export async function preferenceStorageValue(
  key: string,
): Promise<unknown> {
  return cacheGet(key);
}

export function currentFixtureUnitMode():
  UnitMode {
  return getUnitsMode();
}

export function renderUnitPreferenceProbe():
  ReactRenderResult {
  return renderReact(<UnitPreferenceProbe />);
}

export function renderCyclonePreferenceProbe():
  ReactRenderResult {
  return renderReact(
    <CyclonePreferenceProbe />,
  );
}

export function preferenceProbeText(
  probe: PreferenceFixtureProbe,
): string {
  return requireProbe(probe).textContent ?? "";
}

export function preferenceProbeRenders(
  probe: PreferenceFixtureProbe,
): number {
  return probe === PreferenceFixtureProbe.Units
    ? unitRenderCount
    : cycloneRenderCount;
}

export async function setFixtureUnitMode(
  mode: UnitMode,
): Promise<void> {
  await act(async () => {
    await setUnitsMode(mode);
  });
}

export function beginFixtureUnitModeWrite(
  mode: UnitMode,
): Promise<void> {
  let write: Promise<void> | null = null;
  act(() => {
    write = setUnitsMode(mode);
  });
  if (!write) {
    throw new TypeError(
      PreferenceFixtureTestError.WriteMissing,
    );
  }
  return write;
}

export async function setFixtureCycloneMode(
  value: boolean,
): Promise<void> {
  await act(async () => {
    await setAlwaysShowCyclones(value);
  });
}

export function beginFixtureCycloneWrite(
  value: boolean,
): Promise<void> {
  let write: Promise<void> | null = null;
  act(() => {
    write = setAlwaysShowCyclones(value);
  });
  if (!write) {
    throw new TypeError(
      PreferenceFixtureTestError.WriteMissing,
    );
  }
  return write;
}

export function unitsPreferenceCacheKey():
  string {
  return CacheKey.Units;
}

export function cyclonePreferenceCacheKey():
  string {
  return CacheKey.AlwaysShowCyclones;
}
