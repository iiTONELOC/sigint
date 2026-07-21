import { describe, expect, test } from "bun:test";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { mainThreadCacheEntries } from "@/workers/data/cacheOwnership";

describe("DataWorker cache ownership", () => {
  test("does not clone worker-owned point data to the main thread", () => {
    const entries = mainThreadCacheEntries([
      { key: CACHE_KEYS.earthquake, value: { data: ["quake"] } },
      { key: CACHE_KEYS.fires, value: { data: ["fire"] } },
      { key: CACHE_KEYS.theme, value: "dark" },
    ]);

    expect(entries).toEqual([{ key: CACHE_KEYS.theme, value: "dark" }]);
  });
});
