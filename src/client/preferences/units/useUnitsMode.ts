import { useSyncExternalStore } from "react";
import { unitsPreferenceStore } from "./store";
import type { UnitMode } from "./model";

export function useUnitsMode(): UnitMode {
  return useSyncExternalStore(
    unitsPreferenceStore.subscribe,
    unitsPreferenceStore.get,
    unitsPreferenceStore.get,
  );
}
