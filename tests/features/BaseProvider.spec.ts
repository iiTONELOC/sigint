import { describe, test, expect } from "bun:test";
import { BaseProvider } from "@/features/base/BaseProvider";
import type { DataPoint } from "@/features/base/dataPoints";

// ── Mock data ───────────────────────────────────────────────────────

function makePoint(id: string, type: string = "events"): DataPoint {
  return {
    id,
    type: type as any,
    lat: 40.0,
    lon: -74.0,
    timestamp: new Date().toISOString(),
    data: {} as any,
  };
}

function makeProvider(
  overrides: {
    fetchFn?: () => Promise<DataPoint[]>;
    mergeFn?: (existing: DataPoint[], incoming: DataPoint[]) => DataPoint[];
    maxCacheAgeMs?: number;
    allowEmptyResult?: boolean;
  } = {},
) {
  const points = [makePoint("p1"), makePoint("p2")];
  return new BaseProvider({
    id: "test-provider",
    cacheKey: "test-cache-" + Math.random(),
    maxCacheAgeMs: overrides.maxCacheAgeMs ?? 300_000,
    fetchFn: overrides.fetchFn ?? (async () => points),
    mergeFn: overrides.mergeFn,
    allowEmptyResult: overrides.allowEmptyResult,
  });
}

// ── hydrate ─────────────────────────────────────────────────────────

describe("BaseProvider.hydrate()", () => {
  test("returns null when no cache exists", async () => {
    const provider = makeProvider();
    const result = await provider.hydrate();
    expect(result).toBeNull();
  });

  test("returns cached data after getData populates cache", async () => {
    const provider = makeProvider();
    await provider.getData();
    const result = await provider.hydrate();
    expect(result).not.toBeNull();
    expect(result!.data.length).toBe(2);
  });
});

// ── getData ─────────────────────────────────────────────────────────

describe("BaseProvider.getData()", () => {
  test("returns data from fetchFn on first call", async () => {
    const provider = makeProvider();
    const result = await provider.getData();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("p1");
  });

  test("returns cached data on subsequent calls without re-fetching", async () => {
    let fetchCount = 0;
    const provider = makeProvider({
      fetchFn: async () => {
        fetchCount++;
        return [makePoint("p1")];
      },
    });

    await provider.getData();
    expect(fetchCount).toBe(1);

    const result = await provider.getData(60_000);
    expect(fetchCount).toBe(1);
    expect(result).toHaveLength(1);
  });

  test("triggers background refresh when cache is stale", async () => {
    let fetchCount = 0;
    const provider = makeProvider({
      fetchFn: async () => {
        fetchCount++;
        return [makePoint("p1")];
      },
    });

    await provider.getData();
    expect(fetchCount).toBe(1);

    // Wait for cache to become stale
    await new Promise((r) => setTimeout(r, 10));
    const result = await provider.getData(1);
    expect(result).toHaveLength(1);
    // Background refresh fires
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCount).toBe(2);
  });
});

// ── refresh ─────────────────────────────────────────────────────────

describe("BaseProvider.refresh()", () => {
  test("fetches fresh data", async () => {
    let counter = 0;
    const provider = makeProvider({
      fetchFn: async () => {
        counter++;
        return [makePoint(`p${counter}`)];
      },
    });

    const first = await provider.refresh();
    expect(first[0]!.id).toBe("p1");

    const second = await provider.refresh();
    expect(second[0]!.id).toBe("p2");
  });

  test("retains stale cache when upstream returns empty", async () => {
    let callNum = 0;
    const provider = makeProvider({
      fetchFn: async () => {
        callNum++;
        if (callNum === 1) return [makePoint("p1"), makePoint("p2")];
        return [];
      },
    });

    const first = await provider.refresh();
    expect(first).toHaveLength(2);

    const second = await provider.refresh();
    expect(second).toHaveLength(2);
    expect(second[0]!.id).toBe("p1");
  });

  test("falls back to cache on fetch error", async () => {
    let callNum = 0;
    const provider = makeProvider({
      fetchFn: async () => {
        callNum++;
        if (callNum === 1) return [makePoint("p1")];
        throw new Error("Network error");
      },
    });

    await provider.refresh();
    const result = await provider.refresh();
    expect(result).toHaveLength(1);

    const snapshot = provider.getSnapshot();
    expect(snapshot.error).not.toBeNull();
    expect(snapshot.error!.message).toBe("Network error");
  });
});

// ── getSnapshot ─────────────────────────────────────────────────────

describe("BaseProvider.getSnapshot()", () => {
  test("initial snapshot has no data and no error", () => {
    const provider = makeProvider();
    const snap = provider.getSnapshot();
    expect(snap.entities).toEqual([]);
    expect(snap.error).toBeNull();
    expect(snap.loading).toBe(false);
    expect(snap.lastUpdatedAt).toBeNull();
  });

  test("snapshot reflects fetched data", async () => {
    const provider = makeProvider();
    await provider.refresh();
    const snap = provider.getSnapshot();
    expect(snap.entities).toHaveLength(2);
    expect(snap.error).toBeNull();
    expect(snap.lastUpdatedAt).not.toBeNull();
  });
});

// ── mergeFn ─────────────────────────────────────────────────────────

describe("BaseProvider with mergeFn", () => {
  test("uses mergeFn to combine existing and incoming data", async () => {
    let callNum = 0;
    const provider = makeProvider({
      fetchFn: async () => {
        callNum++;
        return [makePoint(`incoming-${callNum}`)];
      },
      mergeFn: (existing, incoming) => [...existing, ...incoming],
    });

    await provider.refresh();
    const second = await provider.refresh();
    expect(second).toHaveLength(2);
    expect(second[0]!.id).toBe("incoming-1");
    expect(second[1]!.id).toBe("incoming-2");
  });
});

// ── allowEmptyResult (cyclones / out-of-season truth) ──────────────

describe("BaseProvider with allowEmptyResult", () => {
  test("allowEmptyResult: true persists empty incoming as the truth", async () => {
    let callNum = 0;
    const provider = makeProvider({
      allowEmptyResult: true,
      fetchFn: async () => {
        callNum++;
        if (callNum === 1) return [makePoint("p1"), makePoint("p2")];
        return [];
      },
    });

    const first = await provider.refresh();
    expect(first).toHaveLength(2);

    const second = await provider.refresh();
    expect(second).toHaveLength(0);

    const snapshot = provider.getSnapshot();
    expect(snapshot.entities).toHaveLength(0);
    expect(snapshot.error).toBeNull();
  });

  test("allowEmptyResult: false (default) retains stale cache on empty", async () => {
    let callNum = 0;
    const provider = makeProvider({
      fetchFn: async () => {
        callNum++;
        if (callNum === 1) return [makePoint("p1"), makePoint("p2")];
        return [];
      },
    });

    await provider.refresh();
    const second = await provider.refresh();
    expect(second).toHaveLength(2);
    expect(second[0]!.id).toBe("p1");
  });

  test("allowEmptyResult: true still respects fetch errors (falls back to cache)", async () => {
    let callNum = 0;
    const provider = makeProvider({
      allowEmptyResult: true,
      fetchFn: async () => {
        callNum++;
        if (callNum === 1) return [makePoint("p1")];
        throw new Error("Network error");
      },
    });

    await provider.refresh();
    const second = await provider.refresh();
    expect(second).toHaveLength(1);
    expect(provider.getSnapshot().error).not.toBeNull();
  });
});

// ── mute() / unmute() — drops the as-any cast in frontend.tsx ──────

describe("BaseProvider mute() / unmute()", () => {
  test("mute() suspends onChange notifications", async () => {
    const provider = makeProvider({ maxCacheAgeMs: 1 });
    let onChangeCalls = 0;
    provider.onChange(() => {
      onChangeCalls++;
    });

    await provider.getData();
    onChangeCalls = 0;

    const restore = provider.mute();
    await new Promise((r) => setTimeout(r, 10));
    await provider.getData(1); // would notify if not muted
    await new Promise((r) => setTimeout(r, 50));
    expect(onChangeCalls).toBe(0);

    restore();
  });

  test("unmute(restore) restores the prior callback and fires it once", async () => {
    const provider = makeProvider();
    let onChangeCalls = 0;
    provider.onChange(() => {
      onChangeCalls++;
    });

    const restore = provider.mute();
    expect(onChangeCalls).toBe(0);

    provider.unmute(restore);
    expect(onChangeCalls).toBe(1);
  });

  test("mute/unmute round-trip preserves the callback for later notifications", async () => {
    const provider = makeProvider({ maxCacheAgeMs: 1 });
    let onChangeCalls = 0;
    provider.onChange(() => {
      onChangeCalls++;
    });

    const restore = provider.mute();
    provider.unmute(restore); // fires once
    expect(onChangeCalls).toBe(1);

    await provider.getData();
    onChangeCalls = 0;
    await new Promise((r) => setTimeout(r, 10));
    await provider.getData(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(onChangeCalls).toBeGreaterThanOrEqual(1);
  });

  test("mute() returns a no-op when no callback is registered", () => {
    const provider = makeProvider();
    const restore = provider.mute();
    expect(typeof restore).toBe("function");
    provider.unmute(restore);
    // No throw, no leak.
  });
});
