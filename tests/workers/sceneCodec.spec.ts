import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import { ScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";

type TestPoint = Readonly<{
  id: string;
  lat: number;
  lon: number;
  timestamp: number;
  value: number;
}>;

describe("scene patch codec", () => {
  test("encodes patch records and reuses released handles", () => {
    const codec = new ScenePatchCodec<TestPoint>({
      source: Domain.Aircraft,
      attributeStride: 1,
      position: (point) => [point.lon, point.lat],
      timestamp: (point) => point.timestamp,
      writeAttributes: (point, target, offset) => {
        target[offset] = point.value;
      },
    });

    const first = codec.encode({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [
        { id: "first", lat: 10, lon: 20, timestamp: 100, value: 1 },
        { id: "second", lat: 30, lon: 40, timestamp: 200, value: 2 },
      ],
      deletedIds: [],
    });
    const patch = codec.encode({
      kind: DatasetPatchKind.Patch,
      version: 2,
      upserts: [
        { id: "first", lat: 11, lon: 21, timestamp: 300, value: 3 },
      ],
      deletedIds: ["second"],
    });
    const reused = codec.encode({
      kind: DatasetPatchKind.Patch,
      version: 3,
      upserts: [
        { id: "third", lat: 31, lon: 41, timestamp: 400, value: 4 },
      ],
      deletedIds: [],
    });

    expect(Array.from(first.handles)).toEqual([1, 2]);
    expect(first.sceneIds).toEqual(["first", "second"]);
    expect(first.entityIds).toEqual(["first", "second"]);
    expect(Array.from(first.timestamps)).toEqual([100, 200]);
    expect(Array.from(patch.handles)).toEqual([1]);
    expect(Array.from(patch.deletedHandles)).toEqual([2]);
    expect(Array.from(patch.positions)).toEqual([21, 11]);
    expect(Array.from(patch.attributes)).toEqual([3]);
    expect(Array.from(reused.handles)).toEqual([2]);
  });
});
