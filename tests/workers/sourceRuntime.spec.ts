import { SourceCompleteness } from "@shared/source";
import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import {
  PointSourceCacheSchema,
  createPointSourceRuntime,
  type PointSourceFetchSnapshot,
} from "@/workers/data/sourceRuntime";

type TestEntity = Readonly<{
  id: string;
  value: number;
}>;

function parseCache(value: unknown): readonly TestEntity[] | null {
  if (!Array.isArray(value)) return null;
  if (
    !value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        typeof item.id === "string" &&
        "value" in item &&
        typeof item.value === "number",
    )
  ) {
    return null;
  }
  return value;
}

describe("point source runtime", () => {
  test("hydrates in the worker and publishes status without full data", async () => {
    const statuses: unknown[] = [];
    const patches: unknown[] = [];
    const runtime = createPointSourceRuntime<TestEntity>({
      id: Domain.Events,
      cacheKey: "events",
      pollIntervalMs: 1_000,
      maxQueryItems: 20,
      readCache: async () => ({
        schema: PointSourceCacheSchema.Current,
        timestamp: 10,
        version: 4,
        entities: [{ id: "cached", value: 1 }],
      }),
      parseCache,
      persistCache: async () => undefined,
      fetchSnapshot: async () => ({
        completeness: SourceCompleteness.Complete,
        entities: [],
        observedAt: 20,
      }),
      publishStatus: (status) => statuses.push(status),
      publishPatch: (patch) => patches.push(patch),
    });

    await runtime.hydrate();

    expect(runtime.get("cached")).toEqual({ id: "cached", value: 1 });
    expect(statuses.at(-1)).toEqual({
      source: Domain.Events,
      version: 4,
      status: "cached",
      loading: false,
      count: 1,
      lastUpdatedAt: 10,
      error: null,
    });
    expect(statuses.at(-1)).not.toHaveProperty("entities");
    expect(patches).toHaveLength(1);
  });

  test("keeps absent entities after a partial refresh", async () => {
    const snapshots: PointSourceFetchSnapshot<TestEntity>[] = [
      {
        completeness: SourceCompleteness.Complete,
        entities: [
          { id: "first", value: 1 },
          { id: "second", value: 2 },
        ],
        observedAt: 10,
      },
      {
        completeness: SourceCompleteness.Partial,
        entities: [{ id: "first", value: 3 }],
        observedAt: 20,
      },
    ];
    const runtime = createPointSourceRuntime<TestEntity>({
      id: Domain.Events,
      cacheKey: "events",
      pollIntervalMs: 1_000,
      maxQueryItems: 1,
      readCache: async () => null,
      parseCache,
      persistCache: async () => undefined,
      fetchSnapshot: async () => {
        const snapshot = snapshots.shift();
        if (!snapshot) throw new Error("No source snapshot");
        return snapshot;
      },
      publishStatus: () => undefined,
      publishPatch: () => undefined,
    });

    await runtime.refresh();
    await runtime.refresh();

    expect(runtime.get("second")).toEqual({ id: "second", value: 2 });
    const result = await runtime.query({
      offset: 0,
      limit: 10,
      match: () => true,
      compare: (left, right) => left.id.localeCompare(right.id),
    });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
  });
});
