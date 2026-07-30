import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import { SceneStore } from "@/workers/render/sceneStore";
import {
  createSceneDataCommand,
  SceneDataCommandType,
} from "@/workers/render/sceneProtocol";

describe("render scene store", () => {
  test("applies changed handles without rebuilding retained records", () => {
    const store = new SceneStore(Domain.Aircraft);
    store.apply(createSceneDataCommand({
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Aircraft,
      sourceVersion: 1,
      kind: DatasetPatchKind.Rebase,
      handles: new Uint32Array([1, 2]),
      sceneIds: ["scene-first", "scene-second"],
      entityIds: ["first", "second"],
      positions: new Float64Array([20, 10, 40, 30]),
      unitVectors: new Float32Array([1, 0, 0, 0, 1, 0]),
      timestamps: new Float64Array([100, 200]),
      attributes: new Float32Array([1, 2]),
      attributeStride: 1,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      deletedHandles: new Uint32Array(),
    }, "session-a", 1));

    store.apply(createSceneDataCommand({
      type: SceneDataCommandType.SourcePatch,
      source: Domain.Aircraft,
      sourceVersion: 2,
      kind: DatasetPatchKind.Patch,
      handles: new Uint32Array([1]),
      sceneIds: ["scene-first"],
      entityIds: ["first"],
      positions: new Float64Array([21, 11]),
      unitVectors: new Float32Array([0, 0, 1]),
      timestamps: new Float64Array([300]),
      attributes: new Float32Array([3]),
      attributeStride: 1,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      deletedHandles: new Uint32Array([2]),
    }, "session-a", 2));

    expect(store.version()).toBe(2);
    expect(store.size()).toBe(1);
    expect(store.read(1)).toEqual({
      sceneId: "scene-first",
      entityId: "first",
      longitude: 21,
      latitude: 11,
      unitX: 0,
      unitY: 0,
      unitZ: 1,
      timestamp: 300,
      attributes: [3],
    });
    expect(store.handleForSceneId("scene-first")).toBe(1);
    expect(store.handlesForEntityId("first")).toEqual([1]);
    expect(store.read(2)).toBeNull();
  });
});
