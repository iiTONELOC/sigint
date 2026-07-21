import { describe, expect, test } from "bun:test";
import { createRenderSceneStore } from "@/workers/render/sceneStore";
import { createSceneDataCommand } from "@/workers/render/sceneProtocol";

describe("render scene store", () => {
  test("applies changed handles without rebuilding retained records", () => {
    const store = createRenderSceneStore("aircraft");
    store.apply(createSceneDataCommand({
      type: "sourcePatch",
      source: "aircraft",
      sourceVersion: 1,
      kind: "rebase",
      handles: new Uint32Array([1, 2]),
      ids: ["first", "second"],
      positions: new Float32Array([20, 10, 40, 30]),
      unitVectors: new Float32Array([1, 0, 0, 0, 1, 0]),
      attributes: new Float32Array([1, 2]),
      attributeStride: 1,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      deletedHandles: new Uint32Array(),
    }, "session-a", 1));

    store.apply(createSceneDataCommand({
      type: "sourcePatch",
      source: "aircraft",
      sourceVersion: 2,
      kind: "patch",
      handles: new Uint32Array([1]),
      ids: ["first"],
      positions: new Float32Array([21, 11]),
      unitVectors: new Float32Array([0, 0, 1]),
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
      id: "first",
      longitude: 21,
      latitude: 11,
      unitX: 0,
      unitY: 0,
      unitZ: 1,
      attributes: [3],
    });
    expect(store.read(2)).toBeNull();
  });
});
