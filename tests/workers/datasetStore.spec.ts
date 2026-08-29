import { describe, expect, test } from "bun:test";
import {
  createDatasetStore,
  DatasetPatchKind,
} from "@/workers/data/datasetStore";
import { SourceCompleteness } from "@shared/source";

type TestEntity = Readonly<{
  id: string;
  value: number;
}>;

const first: TestEntity = { id: "first", value: 1 };
const second: TestEntity = { id: "second", value: 2 };

describe("dataset store", () => {
  test("applies complete and partial source semantics", async () => {
    const store = createDatasetStore<TestEntity>({});

    const initial = await store.applySnapshot({
      version: 1,
      completeness: SourceCompleteness.Complete,
      entities: [first, second],
    });
    expect(initial.kind).toBe(DatasetPatchKind.Rebase);
    expect(store.size()).toBe(2);

    const partial = await store.applySnapshot({
      version: 2,
      completeness: SourceCompleteness.Partial,
      entities: [{ id: "first", value: 3 }],
    });
    expect(partial.kind).toBe(DatasetPatchKind.Patch);
    expect(partial.deletedIds).toEqual([]);
    expect(store.get("second")).toBe(second);

    const complete = await store.applySnapshot({
      version: 3,
      completeness: SourceCompleteness.Complete,
      entities: [{ id: "first", value: 4 }],
    });
    expect(complete.deletedIds).toEqual(["second"]);
    expect(store.get("second")).toBeNull();
  });

  test("omits unchanged records from a later patch", async () => {
    const store = createDatasetStore<TestEntity>({
      hasChanged: (previous, next) => previous.value !== next.value,
    });
    await store.applySnapshot({
      version: 1,
      completeness: SourceCompleteness.Complete,
      entities: [first, second],
    });

    const patch = await store.applySnapshot({
      version: 2,
      completeness: SourceCompleteness.Complete,
      entities: [
        { id: "first", value: 1 },
        { id: "second", value: 3 },
      ],
    });

    expect(patch.upserts).toEqual([{ id: "second", value: 3 }]);
    expect(patch.deletedIds).toEqual([]);
  });
});
