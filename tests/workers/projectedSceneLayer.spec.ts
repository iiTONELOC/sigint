import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  ProjectedSceneLayer,
  SceneHitKind,
} from "@/workers/render/scene/projectedLayer";
import { SceneStore } from "@/workers/render/sceneStore";
import {
  createSceneCommand,
  SceneDataCommandType,
} from "@/workers/render/sceneProtocol";
import { SceneGeometryKind } from "@shared/scene";

describe("projected scene layer", () => {
  test("projects active records and uses visible hit buckets", () => {
    const store = new SceneStore(Domain.Aircraft);
    store.apply(createSceneCommand({
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Aircraft,
      sourceVersion: 1,
      kind: DatasetPatchKind.Rebase,
      handles: new Uint32Array([1]),
      sceneIds: ["aircraft-marker-A1"],
      entityIds: ["A1"],
      positions: new Float64Array([20, 10]),
      motionPositions: new Float64Array(),
      motionPositionStride: 0,
      unitVectors: new Float32Array([1, 0, 0]),
      timestamps: new Float64Array([1_000]),
      attributes: new Float32Array([90, 0, 0]),
      attributeStride: 3,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      geometryKinds: new Uint8Array([SceneGeometryKind.None]),
      geometryCoordinates: new Float64Array(),
      geometryPartEnds: new Uint32Array(),
      geometryGroupEnds: new Uint32Array(),
      geometryRecordEnds: new Uint32Array([0]),
      deletedHandles: new Uint32Array(),
    }, "session-a", 1));

    const layer = new ProjectedSceneLayer();
    layer.project(store.view(), {
      width: 200,
      height: 200,
      hitCellSize: 32,
      cullMargin: 0,
      flat: {
        centerX: 100,
        centerY: 100,
        mapWidth: 360,
        mapHeight: 180,
      },
      globe: null,
      includes: () => true,
    });

    expect(Array.from(layer.visibleIndices())).toEqual([0]);
    expect(layer.nearest(120, 90, 20, 10)).toEqual({
      kind: SceneHitKind.Point,
      handle: 1,
      sceneId: "aircraft-marker-A1",
      entityId: "A1",
      longitude: 20,
      latitude: 10,
      distance: 0,
    });
  });

  test("zoomed globe skips cells outside the viewport before any record work", () => {
    const store = new SceneStore(Domain.Fire);
    store.apply(centeredAndOffscreenFires());

    const layer = new ProjectedSceneLayer();
    const tested: number[] = [];
    layer.project(store.view(), {
      width: 200,
      height: 200,
      hitCellSize: 32,
      cullMargin: 0,
      flat: null,
      globe: {
        matrix: {
          m00: 1, m01: 0, m02: 0,
          m10: 0, m11: 1, m12: 0,
          m20: 0, m21: 0, m22: 1,
        },
        centerX: 100,
        centerY: 100,
        radius: 2_000,
      },
      includes: (index) => {
        tested.push(index);
        return true;
      },
    });

    expect(Array.from(layer.visibleIndices())).toEqual([0]);
    expect(tested).toEqual([0]);
  });
});

/** One fire at the globe centre and one on the near side far off-screen. */
function centeredAndOffscreenFires() {
  return createSceneCommand({
    type: SceneDataCommandType.SourcePatch,
    source: Domain.Fire,
    sourceVersion: 1,
    kind: DatasetPatchKind.Rebase,
    handles: new Uint32Array([1, 2]),
    sceneIds: ["fire-centered", "fire-offscreen"],
    entityIds: ["F-centered", "F-offscreen"],
    positions: new Float64Array([-90, 0, -45, 0]),
    motionPositions: new Float64Array(),
    motionPositionStride: 0,
    unitVectors: new Float32Array([0, 0, 1, 0.7071, 0, 0.7071]),
    timestamps: new Float64Array([1_000, 1_000]),
    attributes: new Float32Array([10, 10]),
    attributeStride: 1,
    stringAttributes: new Uint32Array(),
    stringAttributeStride: 0,
    dictionaryStart: 0,
    dictionaryValues: [],
    geometryKinds: new Uint8Array([
      SceneGeometryKind.None,
      SceneGeometryKind.None,
    ]),
    geometryCoordinates: new Float64Array(),
    geometryPartEnds: new Uint32Array(),
    geometryGroupEnds: new Uint32Array(),
    geometryRecordEnds: new Uint32Array([0, 0]),
    deletedHandles: new Uint32Array(),
  }, "session-a", 1);
}
