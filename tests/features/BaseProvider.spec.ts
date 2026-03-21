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
  } = {},
) {
  const points = [makePoint("p1"), makePoint("p2")];
  return new BaseProvider({
    id: "test-provider",
    cacheKey: "test-cache-" + Math.random(),
    maxCacheAgeMs: overrides.maxCacheAgeMs ?? 300_000,
    fetchFn: overrides.fetchFn ?? (async () => points),
    mergeFn: overrides.mergeFn,
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
