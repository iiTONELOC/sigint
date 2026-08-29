// Each cache module owns module-level state that bleeds between tests
// when state-mutating paths (websocket handlers, fetch pipelines) are
// exercised. `__resetXxxCacheForTests()` resets that state to the
// documented initial empty shape. Cyclones already shipped this helper;
// these specs cover ais / firms / gdelt / news.

import { describe, test, expect, afterEach } from "bun:test";
import {
  getAisCache,
  __resetAisCacheForTests,
} from "../../../src/server/api/aisCache";
import {
  getFirmsCache,
  __resetFirmsCacheForTests,
} from "../../../src/server/api/firmsCache";
import {
  getGdeltCache,
  __resetGdeltCacheForTests,
} from "../../../src/server/api/gdeltCache";
import {
  getNewsCache,
  __resetNewsCacheForTests,
} from "../../../src/server/api/newsCache";

describe("__resetAisCacheForTests", () => {
  afterEach(() => {
    __resetAisCacheForTests();
  });

  test("is callable without throwing", () => {
    expect(() => __resetAisCacheForTests()).not.toThrow();
  });

  test("after reset, getAisCache returns the initial empty shape", () => {
    __resetAisCacheForTests();
    const c = getAisCache();
    expect(c.data).toBeNull();
    expect(c.vesselCount).toBe(0);
    expect(c.messageCount).toBe(0);
    expect(c.error).toBeNull();
  });
});

describe("__resetFirmsCacheForTests", () => {
  afterEach(() => {
    __resetFirmsCacheForTests();
  });

  test("is callable without throwing", () => {
    expect(() => __resetFirmsCacheForTests()).not.toThrow();
  });

  test("after reset, getFirmsCache returns the initial empty shape", () => {
    __resetFirmsCacheForTests();
    const c = getFirmsCache();
    expect(c.data).toBeNull();
    expect(c.fetchedAt).toBe(0);
    expect(c.fireCount).toBe(0);
    expect(c.error).toBeNull();
  });
});

describe("__resetGdeltCacheForTests", () => {
  afterEach(() => {
    __resetGdeltCacheForTests();
  });

  test("is callable without throwing", () => {
    expect(() => __resetGdeltCacheForTests()).not.toThrow();
  });

  test("after reset, getGdeltCache returns the initial empty shape", () => {
    __resetGdeltCacheForTests();
    const c = getGdeltCache();
    expect(c.data).toBeNull();
    expect(c.fetchedAt).toBe(0);
    expect(c.error).toBeNull();
  });
});

describe("__resetNewsCacheForTests", () => {
  afterEach(() => {
    __resetNewsCacheForTests();
  });

  test("is callable without throwing", () => {
    expect(() => __resetNewsCacheForTests()).not.toThrow();
  });

  test("after reset, getNewsCache returns the initial empty shape", () => {
    __resetNewsCacheForTests();
    const c = getNewsCache();
    expect(Array.isArray(c.items)).toBe(true);
    expect(c.items).toHaveLength(0);
    expect(c.fetchedAt).toBe(0);
    expect(c.itemCount).toBe(0);
    expect(c.error).toBeNull();
  });
});
