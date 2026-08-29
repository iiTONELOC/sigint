/** How often unaccessed entries are swept. Shared by every per-key cache. */
export const PURGE_INTERVAL_MS = 10 * 60_000;
const DEFAULT_RETENTION_MULTIPLIER = 6;

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
  /** Keep a prior value when a fetch returns an empty value. */
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
  const retentionMs =
    opts.retentionMs ?? opts.ttlMs * DEFAULT_RETENTION_MULTIPLIER;

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
