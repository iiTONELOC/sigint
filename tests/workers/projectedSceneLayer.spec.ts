import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { type SourceId } from "@shared/source";
import { createProjectedSceneLayer } from "@/workers/render/scene/projectedLayer";
import { createRenderSceneStore } from "@/workers/render/sceneStore";
import { createSceneDataCommand } from "@/workers/render/sceneProtocol";

describe("projected scene layer", () => {
  test("projects active records and uses visible hit buckets", () => {
    const store = createRenderSceneStore(Domain.Aircraft);
    store.apply(createSceneDataCommand({
      type: "sourcePatch",
      source: Domain.Aircraft,
      sourceVersion: 1,
      kind: "rebase",
      handles: new Uint32Array([1]),
      ids: ["A1"],
      positions: new Float32Array([20, 10]),
      unitVectors: new Float32Array([1, 0, 0]),
      attributes: new Float32Array([90, 0, 0]),
      attributeStride: 3,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: 0,
      dictionaryStart: 0,
      dictionaryValues: [],
      deletedHandles: new Uint32Array(),
    }, "session-a", 1));

    const layer = createProjectedSceneLayer();
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
      handle: 1,
      id: "A1",
      longitude: 20,
      latitude: 10,
      distance: 0,
    });
  });
});
