import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  ScenePatchCodec,
  scenePolygonGeometry,
  scenePolylineGeometry,
  singleSceneRecord,
} from "@/workers/data/render-codecs/sceneCodec";
import {
  SCENE_POSITION_COUNT,
  SceneGeometryKind,
} from "@shared/scene";
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
  motionPosition?: readonly [number, number];
  geometry?: GeoJsonPolygonGeometry;
}>;

type TestSceneRecord = Readonly<{
  id: string;
  position: readonly [number, number];
  timestamp: number;
  value: number;
  line?: readonly (readonly [number, number])[];
}>;

type TestEntity = Readonly<{
  id: string;
  records: readonly TestSceneRecord[];
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
  test("keeps motion positions in a separate Float64 lane", () => {
    const codec = new ScenePatchCodec<TestPoint>({
      source: Domain.Aircraft,
      records: singleSceneRecord,
      position: (point) => [point.lon, point.lat],
      motionPosition: (point) =>
        point.motionPosition ?? [point.lon, point.lat],
      timestamp: (point) => point.timestamp,
      writeAttributes: (point, target, offset) => {
        target[offset] = point.value;
      },
    });

    const patch = codec.encode({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [{
        id: "moving",
        lat: 10,
        lon: 20,
        timestamp: 100,
        value: 1,
        motionPosition: [
          20.123456789012,
          10.123456789012,
        ],
      }],
      deletedIds: [],
    });

    expect(patch.motionPositions).toBeInstanceOf(Float64Array);
    expect(patch.motionPositionStride).toBe(
      SCENE_POSITION_COUNT,
    );
    expect(Array.from(patch.motionPositions)).toEqual([
      20.123456789012,
      10.123456789012,
    ]);
    expect(patch.attributes[0]).toBe(1);
  });

  test("encodes patch records and reuses released handles", () => {
    const codec = new ScenePatchCodec<TestPoint>({
      source: Domain.Aircraft,
      records: singleSceneRecord,
      position: (point) => [point.lon, point.lat],
      timestamp: (point) => point.timestamp,
      geometry: (point) =>
        point.geometry
          ? scenePolygonGeometry(point.geometry)
          : null,
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
    expect(first.motionPositionStride).toBe(0);
    expect(first.motionPositions).toHaveLength(0);
    expect(Array.from(first.timestamps)).toEqual([100, 200]);
    expect(Array.from(first.geometryKinds)).toEqual([
      SceneGeometryKind.Polygon,
      SceneGeometryKind.None,
    ]);
    expect(Array.from(first.geometryPartEnds)).toEqual([5, 10, 15]);
    expect(Array.from(first.geometryGroupEnds)).toEqual([2, 3]);
    expect(Array.from(first.geometryRecordEnds)).toEqual([2, 2]);
    expect(Array.from(patch.handles)).toEqual([1]);
    expect(Array.from(patch.deletedHandles)).toEqual([2]);
    expect(Array.from(patch.positions)).toEqual([21, 11]);
    expect(patch.attributes[0]).toBe(3);
    expect(Array.from(reused.handles)).toEqual([2]);
  });

  test("projects child records without reusing a deleted child handle", () => {
    const codec = new ScenePatchCodec<TestEntity, TestSceneRecord>({
      source: Domain.Cyclones,
      records: (entity) => entity.records,
      position: (record) => record.position,
      timestamp: (record) => record.timestamp,
      geometry: (record) =>
        record.line ? scenePolylineGeometry([record.line]) : null,
      writeAttributes: (record, target, offset) => {
        target[offset] = record.value;
      },
    });

    const first = codec.encode({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [{
        id: "storm",
        records: [
          {
            id: "storm",
            position: [20, 10],
            timestamp: 100,
            value: 1,
          },
          {
            id: "forecast-1",
            position: [21, 11],
            timestamp: 200,
            value: 2,
            line: [[20, 10], [21, 11]],
          },
        ],
      }],
      deletedIds: [],
    });
    const changed = codec.encode({
      kind: DatasetPatchKind.Patch,
      version: 2,
      upserts: [{
        id: "storm",
        records: [
          {
            id: "storm",
            position: [20, 10],
            timestamp: 100,
            value: 1,
          },
          {
            id: "forecast-2",
            position: [22, 12],
            timestamp: 300,
            value: 3,
          },
        ],
      }],
      deletedIds: [],
    });
    const reused = codec.encode({
      kind: DatasetPatchKind.Patch,
      version: 3,
      upserts: [{
        id: "second-storm",
        records: [{
          id: "second-storm",
          position: [30, 20],
          timestamp: 400,
          value: 4,
        }],
      }],
      deletedIds: [],
    });

    expect(first.entityIds).toEqual(["storm", "storm"]);
    expect(Array.from(first.geometryKinds)).toEqual([
      SceneGeometryKind.None,
      SceneGeometryKind.Polyline,
    ]);
    expect(Array.from(first.geometryPartEnds)).toEqual([2]);
    expect(Array.from(first.geometryGroupEnds)).toEqual([1]);
    expect(Array.from(first.geometryRecordEnds)).toEqual([0, 1]);
    expect(Array.from(codec.encodeSearch(["storm"], 1, true).handles))
      .toEqual([1, 3]);
    expect(Array.from(changed.handles)).toEqual([1, 3]);
    expect(Array.from(changed.deletedHandles)).toEqual([2]);
    expect(Array.from(changed.handles)).not.toContain(2);
    expect(Array.from(reused.handles)).toEqual([2]);
  });
});
