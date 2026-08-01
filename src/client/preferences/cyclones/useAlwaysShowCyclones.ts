import { useSyncExternalStore } from "react";
import { cyclonePreferenceStore } from "./store";

export function useAlwaysShowCyclones(): boolean {
  return useSyncExternalStore(
    cyclonePreferenceStore.subscribe,
    cyclonePreferenceStore.get,
    cyclonePreferenceStore.get,
  );
}
