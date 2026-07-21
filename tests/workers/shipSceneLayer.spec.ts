import { describe, expect, test } from "bun:test";
import {
  shipSceneIncludes,
  type ShipSceneFilter,
} from "@/workers/render/scene/shipLayer";
import { SHIP_SCENE } from "@/workers/render/scene/shipSchema";
import type { RenderSceneView } from "@/workers/render/sceneStore";

const view = {
  capacity: 1,
  active: new Uint8Array([1]),
  ids: ["S123"],
  positions: new Float32Array(2),
  unitVectors: new Float32Array(3),
  attributes: new Float32Array([90]),
  attributeStride: SHIP_SCENE.attributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride: SHIP_SCENE.stringAttributeStride,
  dictionary: [],
} satisfies RenderSceneView;

const base = {
  enabled: true,
  searchIds: null,
  isolateMode: null,
  isolatedId: null,
  isolatedType: null,
} satisfies ShipSceneFilter;

describe("ship scene layer", () => {
  test("applies source, search, and isolation visibility", () => {
    expect(shipSceneIncludes(view, 0, base)).toBe(true);
    expect(
      shipSceneIncludes(view, 0, {
        ...base,
        searchIds: new Set(["other"]),
      }),
    ).toBe(false);
    expect(
      shipSceneIncludes(view, 0, {
        ...base,
        isolateMode: "focus",
        isolatedType: "weather",
      }),
    ).toBe(false);
    expect(
      shipSceneIncludes(view, 0, { ...base, enabled: false }),
    ).toBe(false);
  });
});
