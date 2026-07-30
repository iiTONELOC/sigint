import { describe, expect, test } from "bun:test";
import {
  ShipLayer,
  shipSceneIncludes,
  type ShipSceneFilter,
} from "@/workers/render/scene/shipLayer";
import { ShipSceneSchema } from "@/workers/render/scene/shipSchema";
import { IsolateMode } from "@/workers/render/protocol";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { Domain } from "@shared/domain/identity";
import { sceneRebaseCommand } from "../_support/scene";

const view = {
  capacity: 1,
  active: new Uint8Array([1]),
  sceneIds: ["ship-marker-S123"],
  entityIds: ["S123"],
  positions: new Float64Array(2),
  unitVectors: new Float32Array(3),
  timestamps: new Float64Array(1),
  attributes: new Float32Array([90]),
  attributeStride: ShipSceneSchema.AttributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride: ShipSceneSchema.StringAttributeStride,
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
  test("owns scene storage, projection, and hit resolution", () => {
    const layer = new ShipLayer();
    layer.apply(sceneRebaseCommand(Domain.Ships, view));
    layer.project(
      {
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
      },
      base,
    );

    expect(layer.nearest(100, 100, 10, 10)?.entityId).toBe("S123");
    expect(layer.includesEntity("S123", base)).toBe(true);
  });

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
        isolateMode: IsolateMode.Focus,
        isolatedType: Domain.Weather,
      }),
    ).toBe(false);
    expect(
      shipSceneIncludes(view, 0, { ...base, enabled: false }),
    ).toBe(false);
  });
});
