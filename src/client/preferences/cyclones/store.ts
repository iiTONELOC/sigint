import { CacheKey } from "@shared/domain/cache";
import { createPersistedPreferenceStore } from "../utils";

function isAlwaysShowCyclones(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export const cyclonePreferenceStore = createPersistedPreferenceStore({
  cacheKey: CacheKey.AlwaysShowCyclones,
  defaultValue: false,
  isValid: isAlwaysShowCyclones,
});

export function hydrateCyclonePreference(): Promise<void> {
  return cyclonePreferenceStore.hydrate();
}

export function setAlwaysShowCyclones(value: boolean): Promise<void> {
  return cyclonePreferenceStore.set(value);
}
