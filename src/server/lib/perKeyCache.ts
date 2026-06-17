// Per-key in-memory cache with revalidation + stale-while-revalidate + access-
// based retention. The cyclone cone / ATCF / dossier caches were three copies of
// the same Map<key, {value, expiresAt, fetchedAt}> + purge + "fresh? → fetch →
// cache; on failure serve stale" logic. This is the one copy.
//
// Retention is decoupled from freshness: `ttlMs` controls when an entry is
// REVALIDATED on access; `retentionMs` controls when an UNACCESSED entry is
// evicted. So an actively-polled key (e.g. a live storm) is never dropped — its
// value is refreshed in place and kept — while a key nothing has asked for in a
// while (a dissipated storm) is eventually purged. `fetch` receives the previous
// value so it can revalidate cheaply (e.g. a conditional GET that 304s).

export type PerKeyCacheResult<T> = { value: T; fetchedAt: number };

export type PerKeyCacheOptions<T> = {
  /** Revalidate (re-`fetch`) once an entry is older than this when next accessed. */
  ttlMs: number;
  /** Evict an entry only after this long with no access. Defaults to 6×ttlMs. */
  retentionMs?: number;
  purgeIntervalMs: number;
  /** Returned on a fetch failure when nothing was ever cached. */
  emptyValue: T;
  /** `prev` is the currently-cached value (if any), for conditional revalidation. */
  fetch: (key: string, prev: T | undefined) => Promise<T>;
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
  type Entry = {
    value: T;
    expiresAt: number;
    fetchedAt: number;
    lastAccess: number;
  };
  const cache = new Map<string, Entry>();
  const retentionMs = opts.retentionMs ?? opts.ttlMs * 6;

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.lastAccess > retentionMs) cache.delete(key);
    }
  }, opts.purgeIntervalMs);

  async function get(key: string): Promise<PerKeyCacheResult<T>> {
    const now = Date.now();
    const existing = cache.get(key);
    if (existing) existing.lastAccess = now;

    if (existing && existing.expiresAt > now) {
      return { value: existing.value, fetchedAt: existing.fetchedAt };
    }

    try {
      const value = await opts.fetch(key, existing?.value);
      if (opts.isEmpty?.(value)) {
        // Don't cache the empty result — keep the last good entry if present.
        if (existing) return { value: existing.value, fetchedAt: existing.fetchedAt };
        return { value, fetchedAt: now };
      }
      cache.set(key, {
        value,
        expiresAt: now + opts.ttlMs,
        fetchedAt: now,
        lastAccess: now,
      });
      return { value, fetchedAt: now };
    } catch {
      if (existing) return { value: existing.value, fetchedAt: existing.fetchedAt };
      return { value: opts.emptyValue, fetchedAt: now };
    }
  }

  return { get, reset: () => cache.clear() };
}
