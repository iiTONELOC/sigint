import { CacheKey } from "@shared/domain/cache";
import { createPersistedPreferenceStore } from "../utils";
import { isUnitMode, UnitMode } from "./model";

export const unitsPreferenceStore = createPersistedPreferenceStore({
  cacheKey: CacheKey.Units,
  defaultValue: UnitMode.Both,
  isValid: isUnitMode,
});

export function getUnitsMode(): UnitMode {
  return unitsPreferenceStore.get();
}

export function hydrateUnitsPreference(): Promise<void> {
  return unitsPreferenceStore.hydrate();
}

export function setUnitsMode(mode: UnitMode): Promise<void> {
  return unitsPreferenceStore.set(mode);
}
