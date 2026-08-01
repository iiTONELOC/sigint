import { describe, expect, test } from "bun:test";
import { CacheKey } from "@shared/domain/cache";
import { mainThreadCacheEntries } from "@/workers/data/cacheOwnership";

describe("DataWorker cache ownership", () => {
  test("does not clone worker-owned point data to the main thread", () => {
    const entries = mainThreadCacheEntries([
      { key: CacheKey.Earthquake, value: { data: ["quake"] } },
      { key: CacheKey.Fires, value: { data: ["fire"] } },
      { key: CacheKey.Weather, value: { data: ["weather"] } },
      {
        key: CacheKey.CycloneWarnings,
        value: { data: ["warning"] },
      },
      { key: CacheKey.Theme, value: "dark" },
    ]);

    expect(entries).toEqual([{ key: CacheKey.Theme, value: "dark" }]);
  });
});
