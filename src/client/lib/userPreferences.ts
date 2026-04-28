import { useSyncExternalStore } from "react";
import { cacheGet, cacheSet } from "./storageService";
import { CACHE_KEYS } from "./cacheKeys";

// ── User preferences ────────────────────────────────────────────────
// Persistent UI flags that survive reload. Persistence is via the
// same IndexedDB-backed storageService every other setting in the
// app uses (theme, ticker speed, layout mode, walkthrough completion)
// — read at module load, written on every set.
//
// React subscribers use the useSyncExternalStore hook so a setting
// flip in SettingsModal propagates to every consumer (e.g. Header's
// cyclones-toggle filter) within the same React tick. Pattern
// mirrors layoutSignals.ts — lightweight signal store, no Provider.

let alwaysShowCyclones = false;
let hydrated = false;
const alwaysShowCyclonesListeners = new Set<() => void>();

function subscribeAlwaysShowCyclones(cb: () => void): () => void {
  alwaysShowCyclonesListeners.add(cb);
  return () => alwaysShowCyclonesListeners.delete(cb);
}

function getAlwaysShowCyclonesSnapshot(): boolean {
  return alwaysShowCyclones;
}

/** Sync read of the cached value. Initial value is false until the
 *  one-shot async hydration completes; consumers that mount before
 *  hydration finishes re-render via the listener once it lands. */
export function getAlwaysShowCyclones(): boolean {
  return alwaysShowCyclones;
}

/** Persist the new value and notify subscribers immediately. The
 *  cacheSet write is fire-and-forget — UI updates synchronously off
 *  the in-memory value while the IDB write settles in the background. */
export async function setAlwaysShowCyclones(value: boolean): Promise<void> {
  if (alwaysShowCyclones !== value) {
    alwaysShowCyclones = value;
    alwaysShowCyclonesListeners.forEach((cb) => cb());
  }
  await cacheSet(CACHE_KEYS.alwaysShowCyclones, value);
}

/** React hook — current value, re-renders the consumer on every flip. */
export function useAlwaysShowCyclones(): boolean {
  return useSyncExternalStore(
    subscribeAlwaysShowCyclones,
    getAlwaysShowCyclonesSnapshot,
    getAlwaysShowCyclonesSnapshot,
  );
}

/** Hydrate the in-memory value from IDB once at module load. Idempotent. */
async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const saved = await cacheGet<boolean>(CACHE_KEYS.alwaysShowCyclones);
    if (saved === true && alwaysShowCyclones !== true) {
      alwaysShowCyclones = true;
      alwaysShowCyclonesListeners.forEach((cb) => cb());
    }
  } catch {
    /* hydrate is best-effort; fall back to default false */
  }
}

/** TEST-ONLY: reset cached value + hydration flag so unit tests can
 *  start each case from a known clean state without process restart. */
export function __resetUserPreferencesForTests(): void {
  alwaysShowCyclones = false;
  hydrated = false;
  alwaysShowCyclonesListeners.forEach((cb) => cb());
}

// Kick off hydration immediately at module load. Consumers that mount
// before the IDB read settles see `false` first, then re-render once
// the listener fires. SSR-safe: cacheGet short-circuits when window
// is undefined (storageService handles that).
void hydrate();
