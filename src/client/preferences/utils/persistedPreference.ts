import { cacheGet, cacheSet } from "@/lib/cache";
import type { CacheKey } from "@shared/domain/cache";

type PreferenceListener = () => void;

type PersistedPreferenceStore<TValue> = Readonly<{
  get: () => TValue;
  hydrate: () => Promise<void>;
  set: (value: TValue) => Promise<void>;
  subscribe: (listener: PreferenceListener) => () => void;
}>;

type PersistedPreferenceOptions<TValue> = Readonly<{
  cacheKey: CacheKey;
  defaultValue: TValue;
  isValid: (value: unknown) => value is TValue;
}>;

export function createPersistedPreferenceStore<TValue>(
  options: PersistedPreferenceOptions<TValue>,
): PersistedPreferenceStore<TValue> {
  const listeners = new Set<PreferenceListener>();
  let currentValue = options.defaultValue;
  let hydration: Promise<void> | null = null;

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const update = (value: TValue): void => {
    if (Object.is(currentValue, value)) {
      return;
    }
    currentValue = value;
    notify();
  };

  return {
    get: () => currentValue,
    hydrate: () => {
      hydration ??= cacheGet<unknown>(options.cacheKey).then((stored) => {
        if (options.isValid(stored)) {
          update(stored);
        }
      });
      return hydration;
    },
    set: async (value) => {
      update(value);
      await cacheSet(options.cacheKey, value);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
