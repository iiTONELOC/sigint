import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  SceneStore,
  SceneStoreError,
  SceneStoreErrorKind,
} from "@/workers/render/sceneStore";
import {
  createSceneCommand,
  SceneDataCommandType,
} from "@/workers/render/sceneProtocol";
import {
  SCENE_POSITION_COUNT,
  SceneGeometryKind,
} from "@shared/scene";

describe("render scene store", () => {
  test("applies changed handles without rebuilding retained records", () => {
    const store = new SceneStore(Domain.Aircraft);
    const update = createSceneCommand({
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Aircraft,
      sourceVersion: 1,
      kind: DatasetPatchKind.Rebase,
      handles: new Uint32Array([1, 2]),
      sceneIds: ["scene-first", "scene-second"],
      entityIds: ["first", "second"],
      positions: new Float64Array([20, 10, 40, 30]),
      motionPositions: new Float64Array([
        20.123456789012,
        10.123456789012,
        40.123456789012,
        30.123456789012,
      ]),
      motionPositionStride:
        SCENE_POSITION_COUNT,
      unitVectors: new Float32Array([1, 0, 0, 0, 1, 0]),
      timestamps: new Float64Array([100, 200]),
      attributes: new Float32Array([1, 2]),
      attributeStride: 1,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      geometryKinds: new Uint8Array([
        SceneGeometryKind.Polygon,
        SceneGeometryKind.None,
      ]),
      geometryCoordinates: new Float64Array([
        20, 10, 22, 10, 22, 12, 20, 12, 20, 10,
      ]),
      geometryPartEnds: new Uint32Array([5]),
      geometryGroupEnds: new Uint32Array([1]),
      geometryRecordEnds: new Uint32Array([1, 1]),
      deletedHandles: new Uint32Array(),
    }, "session-a", 1);
    store.apply(update);

    store.apply(createSceneCommand({
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Aircraft,
      sourceVersion: 2,
      kind: DatasetPatchKind.Patch,
      handles: new Uint32Array([1]),
      sceneIds: ["scene-first"],
      entityIds: ["first"],
      positions: new Float64Array([21, 11]),
      motionPositions: new Float64Array([
        21.123456789012,
        11.123456789012,
      ]),
      motionPositionStride:
        SCENE_POSITION_COUNT,
      unitVectors: new Float32Array([0, 0, 1]),
      timestamps: new Float64Array([300]),
      attributes: new Float32Array([3]),
      attributeStride: 1,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      geometryKinds: new Uint8Array([SceneGeometryKind.Polygon]),
      geometryCoordinates: new Float64Array([
        21, 11, 23, 11, 23, 13, 21, 13, 21, 11,
      ]),
      geometryPartEnds: new Uint32Array([5]),
      geometryGroupEnds: new Uint32Array([1]),
      geometryRecordEnds: new Uint32Array([1]),
      deletedHandles: new Uint32Array([2]),
    }, "session-a", 2));

    expect(store.version()).toBe(2);
    expect(store.size()).toBe(1);
    expect(store.read(1)).toEqual({
      sceneId: "scene-first",
      entityId: "first",
      longitude: 21,
      latitude: 11,
      motionLongitude: 21.123456789012,
      motionLatitude: 11.123456789012,
      unitX: 0,
      unitY: 0,
      unitZ: 1,
      timestamp: 300,
      attributes: [3],
      geometry: {
        kind: SceneGeometryKind.Polygon,
        groups: [
          [
            [
              [21, 11],
              [23, 11],
              [23, 13],
              [21, 13],
              [21, 11],
            ],
          ],
        ],
      },
    });
    expect(store.handleForSceneId("scene-first")).toBe(1);
    expect(store.handlesForEntityId("first")).toEqual([1]);
    expect(store.read(2)).toBeNull();
    expect(() => {
      store.apply({
        ...update,
        sourceVersion: 3,
        sequence: 3,
        motionPositions: new Float64Array(),
        motionPositionStride: 0,
      });
    }).toThrow(
      new SceneStoreError(
        SceneStoreErrorKind.MotionPositionStrideChanged,
      ),
    );
  });
});
