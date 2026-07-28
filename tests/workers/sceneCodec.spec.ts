import { type SourceId } from "@shared/source";
import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { createScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";

type TestPoint = Readonly<{
  id: string;
  lat: number;
  lon: number;
  value: number;
}>;

describe("scene patch codec", () => {
  test("keeps stable handles and encodes only patch records", () => {
    const codec = createScenePatchCodec<TestPoint>({
      source: Domain.Aircraft,
      attributeStride: 1,
      writeAttributes: (point, target, offset) => {
        target[offset] = point.value;
      },
    });

    const first = codec.encode({
      kind: "rebase",
      version: 1,
      upserts: [
        { id: "first", lat: 10, lon: 20, value: 1 },
        { id: "second", lat: 30, lon: 40, value: 2 },
      ],
      deletedIds: [],
    });
    const patch = codec.encode({
      kind: "patch",
      version: 2,
      upserts: [{ id: "first", lat: 11, lon: 21, value: 3 }],
      deletedIds: ["second"],
    });

    expect(Array.from(first.handles)).toEqual([1, 2]);
    expect(Array.from(patch.handles)).toEqual([1]);
    expect(Array.from(patch.deletedHandles)).toEqual([2]);
    expect(Array.from(patch.positions)).toEqual([21, 11]);
    expect(Array.from(patch.attributes)).toEqual([3]);
  });
});
