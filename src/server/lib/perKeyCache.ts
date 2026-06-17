// Per-key in-memory cache with TTL + stale-while-revalidate + background purge.
// The cyclone cone / ATCF wind-radii / dossier caches were three copies of the
// same Map<stormId, {value, expiresAt, fetchedAt}> + setInterval purge + "fresh?
// → fetch → cache; on failure serve stale" logic. This is the one copy.

export type PerKeyCacheResult<T> = { value: T; fetchedAt: number };

export type PerKeyCacheOptions<T> = {
  ttlMs: number;
  purgeIntervalMs: number;
  /** Returned on a fetch failure when nothing was ever cached. */
  emptyValue: T;
  fetch: (key: string) => Promise<T>;
  /** When a fresh fetch resolves to a value matching this, don't overwrite a
   *  good cached entry — keep serving stale (dossier outage semantics). When
   *  omitted, every resolved value is cached (cone/atcf cache nulls for the TTL). */
  isEmpty?: (value: T) => boolean;
};

export type PerKeyCache<T> = {
  get: (key: string) => Promise<PerKeyCacheResult<T>>;
  reset: () => void;
};

export function createPerKeyCache<T>(opts: PerKeyCacheOptions<T>): PerKeyCache<T> {
  type Entry = { value: T; expiresAt: number; fetchedAt: number };
  const cache = new Map<string, Entry>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) cache.delete(key);
    }
  }, opts.purgeIntervalMs);

  async function get(key: string): Promise<PerKeyCacheResult<T>> {
    const now = Date.now();
    const existing = cache.get(key);

    if (existing && existing.expiresAt > now) {
      return { value: existing.value, fetchedAt: existing.fetchedAt };
    }

    try {
      const value = await opts.fetch(key);
      if (opts.isEmpty?.(value)) {
        // Don't cache the empty result — keep the last good entry if present.
        if (existing) return { value: existing.value, fetchedAt: existing.fetchedAt };
        return { value, fetchedAt: now };
      }
      cache.set(key, { value, expiresAt: now + opts.ttlMs, fetchedAt: now });
      return { value, fetchedAt: now };
    } catch {
      if (existing) return { value: existing.value, fetchedAt: existing.fetchedAt };
      return { value: opts.emptyValue, fetchedAt: now };
    }
  }

  return { get, reset: () => cache.clear() };
}
