import { useSyncExternalStore } from "react";
import { CacheKey } from "@shared/domain/cache";
import { TickerSpeedPolicy } from "@/shell/ticker";
import { hydrateCyclonePreference } from "./cyclones/store";
import { hydrateUnitsPreference } from "./units/store";
import { createPersistedPreferenceStore } from "./utils/persistedPreference";

function isTickerSpeed(value: unknown): value is number {
  return typeof value === "number";
}

const tickerSpeedPreferenceStore = createPersistedPreferenceStore({
  cacheKey: CacheKey.TickerSpeed,
  defaultValue: TickerSpeedPolicy.Default,
  isValid: isTickerSpeed,
});

export async function hydratePreferences(): Promise<void> {
  await hydrateCyclonePreference();
  await tickerSpeedPreferenceStore.hydrate();
  await hydrateUnitsPreference();
}

export function setTickerSpeed(speed: number): Promise<void> {
  return tickerSpeedPreferenceStore.set(speed);
}

export function useTickerSpeed(): number {
  return useSyncExternalStore(
    tickerSpeedPreferenceStore.subscribe,
    tickerSpeedPreferenceStore.get,
    tickerSpeedPreferenceStore.get,
  );
}
