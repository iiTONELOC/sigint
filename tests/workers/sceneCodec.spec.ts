import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import { ScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import {
  GeoJsonGeometryType,
  type GeoJsonPolygonGeometry,
} from "@shared/geo";

type TestPoint = Readonly<{
  id: string;
  lat: number;
  lon: number;
  timestamp: number;
  value: number;
  geometry?: GeoJsonPolygonGeometry;
}>;

const TEST_GEOMETRY: GeoJsonPolygonGeometry = {
  type: GeoJsonGeometryType.MultiPolygon,
  coordinates: [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [2, 2],
        [2, 4],
        [4, 4],
        [4, 2],
        [2, 2],
      ],
    ],
    [
      [
        [20, 20],
        [22, 20],
        [22, 22],
        [20, 22],
        [20, 20],
      ],
    ],
  ],
};

describe("scene patch codec", () => {
  test("encodes patch records and reuses released handles", () => {
    const codec = new ScenePatchCodec<TestPoint>({
      source: Domain.Aircraft,
      attributeStride: 1,
      position: (point) => [point.lon, point.lat],
      timestamp: (point) => point.timestamp,
      geometry: (point) => point.geometry,
      writeAttributes: (point, target, offset) => {
        target[offset] = point.value;
      },
    });

    const first = codec.encode({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [
        {
          id: "first",
          lat: 10,
          lon: 20,
          timestamp: 100,
          value: 1,
          geometry: TEST_GEOMETRY,
        },
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
    expect(Array.from(first.geometryRingEnds)).toEqual([5, 10, 15]);
    expect(Array.from(first.geometryPolygonEnds)).toEqual([2, 3]);
    expect(Array.from(first.geometryRecordEnds)).toEqual([2, 2]);
    expect(Array.from(patch.handles)).toEqual([1]);
    expect(Array.from(patch.deletedHandles)).toEqual([2]);
    expect(Array.from(patch.positions)).toEqual([21, 11]);
    expect(Array.from(patch.attributes)).toEqual([3]);
    expect(Array.from(reused.handles)).toEqual([2]);
  });
});
