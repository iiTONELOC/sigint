import { describe, expect, test } from "bun:test";
import { settingsCacheMetadata } from "@/settings/model/cache";
import { CacheKey, isCacheKey } from "@shared/domain/cache";

enum CacheKeyFixture {
  Unknown = "sigint.unknown.v1",
}

describe("CacheKey", () => {
  test("keeps every persisted key versioned", () => {
    for (const key of Object.values(CacheKey)) {
      expect(key).toEndWith(".v1");
    }
  });

  test("owns one unique value per key", () => {
    const keys = Object.values(CacheKey);

    expect(new Set(keys).size).toBe(keys.length);
  });

  test("validates only registered keys", () => {
    for (const key of Object.values(CacheKey)) {
      expect(isCacheKey(key)).toBe(true);
    }
    expect(isCacheKey(CacheKeyFixture.Unknown)).toBe(false);
  });

  test("gives Settings metadata for every key", () => {
    for (const key of Object.values(CacheKey)) {
      const metadata = settingsCacheMetadata(key);

      expect(metadata).not.toBeNull();
      expect(metadata?.label.length).toBeGreaterThan(0);
    }
  });
});
