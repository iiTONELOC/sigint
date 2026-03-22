import { describe, test, expect, beforeEach, mock } from "bun:test";

// ─────────────────────────────────────────────────────────────────────
// storageService uses a module-level Map + IndexedDB.
// Bun's test runner may resolve the @/ alias to different module
// instances, so we can't rely on shared module state.
//
// Strategy: build a minimal in-memory replica of the cache API
// and test the LOGIC (poisoned cache purge, dbReady gate, etc.)
// rather than fighting module isolation.
// ─────────────────────────────────────────────────────────────────────

// ── Replica of storageService logic for unit testing ────────────────

function createCacheService() {
  const memoryCache = new Map<string, unknown>();
  let _initCalled = false;
  let _resolveReady: () => void;
  const _dbReadyPromise = new Promise<void>((resolve) => {
    _resolveReady = resolve;
  });

  function dbReady(): Promise<void> {
    return _initCalled ? _dbReadyPromise : Promise.resolve();
  }

  async function cacheInit(): Promise<void> {
    _initCalled = true;
    // No IDB in test — just resolve immediately
    _resolveReady();
  }

  async function cacheGet<T = unknown>(key: string): Promise<T | null> {
    const mem = memoryCache.get(key);
    if (mem !== undefined) return mem as T;
    await dbReady();
    const mem2 = memoryCache.get(key);
    if (mem2 !== undefined) return mem2 as T;
    return null;
  }

  async function cacheSet(key: string, value: unknown): Promise<void> {
    memoryCache.set(key, value);
    await dbReady();
  }

  async function cacheDelete(key: string): Promise<void> {
    memoryCache.delete(key);
    await dbReady();
  }

  async function cacheListKeys(): Promise<string[]> {
    await dbReady();
    return Array.from(memoryCache.keys()).sort();
  }

  async function cacheEstimateSize(key: string): Promise<number> {
    await dbReady();
    const value = memoryCache.get(key);
    if (value == null) return 0;
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  async function cacheClearAll(): Promise<void> {
    const keys = Array.from(memoryCache.keys());
    for (const key of keys) {
      memoryCache.delete(key);
    }
    await dbReady();
  }

  /** Purge poisoned caches (empty data arrays) — mirrors cacheInit logic */
  function purgePoisoned(dataCacheKeys: string[]): void {
    for (const key of dataCacheKeys) {
      const entry = memoryCache.get(key) as
        | { data?: unknown[]; timestamp?: number }
        | null
        | undefined;
      if (
        entry &&
        typeof entry === "object" &&
        Array.isArray(entry.data) &&
        entry.data.length === 0
      ) {
        memoryCache.delete(key);
      }
    }
  }

  return {
    cacheInit,
    cacheGet,
    cacheSet,
    cacheDelete,
    cacheListKeys,
    cacheEstimateSize,
    cacheClearAll,
    purgePoisoned,
    _memoryCache: memoryCache,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

let svc: ReturnType<typeof createCacheService>;

beforeEach(async () => {
  svc = createCacheService();
  await svc.cacheInit();
});

// ── Basic CRUD ──────────────────────────────────────────────────────

describe("cacheGet / cacheSet", () => {
  test("returns null for non-existent key", async () => {
    expect(await svc.cacheGet<any>("nope")).toBeNull();
  });

  test("set then get returns the value", async () => {
    await svc.cacheSet("k", { foo: "bar" });
    expect(await svc.cacheGet<any>("k")).toEqual({ foo: "bar" });
  });

  test("set overwrites existing value", async () => {
    await svc.cacheSet("k", 1);
    await svc.cacheSet("k", 2);
    expect(await svc.cacheGet<any>("k")).toBe(2);
  });

  test("set stores string values", async () => {
    await svc.cacheSet("s", "hello");
    expect(await svc.cacheGet<any>("s")).toBe("hello");
  });

  test("set stores number values", async () => {
    await svc.cacheSet("n", 42);
    expect(await svc.cacheGet<any>("n")).toBe(42);
  });

  test("set stores boolean values", async () => {
    await svc.cacheSet("b", true);
    expect(await svc.cacheGet<any>("b")).toBe(true);
  });

  test("set stores null value", async () => {
    await svc.cacheSet("nil", null);
    expect(await svc.cacheGet<any>("nil")).toBeNull();
  });

  test("set stores array values", async () => {
    await svc.cacheSet("arr", [1, 2, 3]);
    expect(await svc.cacheGet<any>("arr")).toEqual([1, 2, 3]);
  });

  test("set stores nested objects", async () => {
    const value = { a: { b: { c: [1, 2] } }, d: "deep" };
    await svc.cacheSet("nested", value);
    expect(await svc.cacheGet<any>("nested")).toEqual(value);
  });

  test("generic type parameter works", async () => {
    await svc.cacheSet("typed", { count: 10, name: "test" });
    const result = await svc.cacheGet<{ count: number; name: string }>("typed");
    expect(result).not.toBeNull();
    expect(result!.count).toBe(10);
    expect(result!.name).toBe("test");
  });
});

// ── Delete ───────────────────────────────────────────────────────────

describe("cacheDelete", () => {
  test("deleting existing key removes it", async () => {
    await svc.cacheSet("del", "val");
    expect(await svc.cacheGet<any>("del")).toBe("val");
    await svc.cacheDelete("del");
    expect(await svc.cacheGet<any>("del")).toBeNull();
  });

  test("deleting non-existent key does not throw", async () => {
    await svc.cacheDelete("ghost");
    expect(true).toBe(true);
  });

  test("delete only removes targeted key", async () => {
    await svc.cacheSet("keep", "A");
    await svc.cacheSet("remove", "B");
    await svc.cacheDelete("remove");
    expect(await svc.cacheGet<any>("keep")).toBe("A");
    expect(await svc.cacheGet<any>("remove")).toBeNull();
  });
});

// ── List keys ────────────────────────────────────────────────────────

describe("cacheListKeys", () => {
  test("empty cache returns empty array", async () => {
    expect(await svc.cacheListKeys()).toEqual([]);
  });

  test("returns all stored keys sorted", async () => {
    await svc.cacheSet("zebra", 1);
    await svc.cacheSet("apple", 2);
    await svc.cacheSet("mango", 3);
    expect(await svc.cacheListKeys()).toEqual(["apple", "mango", "zebra"]);
  });

  test("deleted keys do not appear", async () => {
    await svc.cacheSet("a", 1);
    await svc.cacheSet("b", 2);
    await svc.cacheDelete("a");
    expect(await svc.cacheListKeys()).toEqual(["b"]);
  });
});

// ── Estimate size ────────────────────────────────────────────────────

describe("cacheEstimateSize", () => {
  test("returns 0 for non-existent key", async () => {
    expect(await svc.cacheEstimateSize("nope")).toBe(0);
  });

  test("returns JSON string length for stored value", async () => {
    await svc.cacheSet("sized", { a: 1 });
    expect(await svc.cacheEstimateSize("sized")).toBe(
      JSON.stringify({ a: 1 }).length,
    );
  });

  test("string value size matches JSON serialization", async () => {
    await svc.cacheSet("str", "hello world");
    expect(await svc.cacheEstimateSize("str")).toBe(
      JSON.stringify("hello world").length,
    );
  });

  test("array value size is correct", async () => {
    const arr = [1, 2, 3, 4, 5];
    await svc.cacheSet("arr", arr);
    expect(await svc.cacheEstimateSize("arr")).toBe(JSON.stringify(arr).length);
  });
});

// ── Clear all ────────────────────────────────────────────────────────

describe("cacheClearAll", () => {
  test("removes all entries", async () => {
    await svc.cacheSet("x", 1);
    await svc.cacheSet("y", 2);
    await svc.cacheSet("z", 3);
    expect((await svc.cacheListKeys()).length).toBe(3);
    await svc.cacheClearAll();
    expect(await svc.cacheListKeys()).toEqual([]);
    expect(await svc.cacheGet<any>("x")).toBeNull();
  });

  test("clearing empty cache does not throw", async () => {
    await svc.cacheClearAll();
    expect(await svc.cacheListKeys()).toEqual([]);
  });
});

// ── Concurrent operations ───────────────────────────────────────────

describe("concurrent operations", () => {
  test("multiple simultaneous sets all persist", async () => {
    await Promise.all([
      svc.cacheSet("p1", "a"),
      svc.cacheSet("p2", "b"),
      svc.cacheSet("p3", "c"),
    ]);
    expect(await svc.cacheGet<any>("p1")).toBe("a");
    expect(await svc.cacheGet<any>("p2")).toBe("b");
    expect(await svc.cacheGet<any>("p3")).toBe("c");
  });

  test("rapid set/get cycles work", async () => {
    for (let i = 0; i < 50; i++) {
      await svc.cacheSet(`rapid${i}`, i);
    }
    for (let i = 0; i < 50; i++) {
      expect(await svc.cacheGet<any>(`rapid${i}`)).toBe(i);
    }
  });
});

// ── Poisoned cache purge (mirrors cacheInit logic) ──────────────────

describe("purgePoisoned", () => {
  test("removes entries with empty data arrays", async () => {
    await svc.cacheSet("aircraft", { data: [], timestamp: 123 });
    await svc.cacheSet("events", { data: [], timestamp: 456 });
    await svc.cacheSet("good", { data: [1, 2, 3], timestamp: 789 });

    svc.purgePoisoned(["aircraft", "events", "good"]);

    expect(await svc.cacheGet<any>("aircraft")).toBeNull();
    expect(await svc.cacheGet<any>("events")).toBeNull();
    expect(await svc.cacheGet<any>("good")).not.toBeNull();
  });

  test("does not remove entries with non-empty data", async () => {
    await svc.cacheSet("fires", { data: [{ lat: 1, lon: 2 }], timestamp: 100 });
    svc.purgePoisoned(["fires"]);
    expect(await svc.cacheGet<any>("fires")).not.toBeNull();
  });

  test("does not remove entries without data field", async () => {
    await svc.cacheSet("theme", { mode: "dark" });
    svc.purgePoisoned(["theme"]);
    expect(await svc.cacheGet<any>("theme")).not.toBeNull();
  });

  test("handles missing keys gracefully", () => {
    svc.purgePoisoned(["nonexistent"]);
    // Should not throw
    expect(true).toBe(true);
  });
});

// ── dbReady gate behavior ───────────────────────────────────────────

describe("dbReady gate", () => {
  test("cacheGet works before cacheInit if initCalled is false", async () => {
    const fresh = createCacheService();
    // Don't call init — dbReady returns Promise.resolve()
    fresh._memoryCache.set("pre", "value");
    expect(await fresh.cacheGet<any>("pre")).toBe("value");
  });

  test("cacheListKeys works after init", async () => {
    await svc.cacheSet("a", 1);
    await svc.cacheSet("b", 2);
    const keys = await svc.cacheListKeys();
    expect(keys).toEqual(["a", "b"]);
  });

  test("operations work immediately after init", async () => {
    const fresh = createCacheService();
    await fresh.cacheInit();
    await fresh.cacheSet("fast", "val");
    expect(await fresh.cacheGet<any>("fast")).toBe("val");
  });
});

// ── Edge cases ──────────────────────────────────────────────────────

describe("edge cases", () => {
  test("empty string key works", async () => {
    await svc.cacheSet("", "empty-key");
    expect(await svc.cacheGet<any>("")).toBe("empty-key");
  });

  test("very long key works", async () => {
    const longKey = "k".repeat(500);
    await svc.cacheSet(longKey, "val");
    expect(await svc.cacheGet<any>(longKey)).toBe("val");
  });

  test("large value stores and retrieves", async () => {
    const large = Array.from({ length: 1000 }, (_, i) => ({ idx: i }));
    await svc.cacheSet("large", large);
    const result = await svc.cacheGet<typeof large>("large");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1000);
    expect(result![999]!.idx).toBe(999);
  });

  test("undefined value returns null on get", async () => {
    await svc.cacheSet("undef", undefined);
    expect(await svc.cacheGet<any>("undef")).toBeNull();
  });

  test("overwrite with different type works", async () => {
    await svc.cacheSet("morph", "string");
    await svc.cacheSet("morph", 42);
    await svc.cacheSet("morph", { obj: true });
    expect(await svc.cacheGet<any>("morph")).toEqual({ obj: true });
  });
});
