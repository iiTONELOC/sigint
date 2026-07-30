import { describe, expect, test } from "bun:test";
import {
  ShipLayer,
  shipSceneIncludes,
  type ShipSceneFilter,
} from "@/workers/render/scene/shipLayer";
import { ShipSceneSchema } from "@/workers/render/scene/shipSchema";
import {
  MovingSceneMotionPositionSchema,
} from "@/workers/render/scene/movingSceneSchema";
import { IsolateMode } from "@/workers/render/protocol";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { SceneHitKind } from "@/workers/render/scene/projectedLayer";
import { Domain } from "@shared/domain/identity";
import {
  advanceGeographicMotion,
  createGeographicMotion,
  geographicToUnitVector,
} from "@/lib/geo/unitSphere";
import { MS_PER_SECOND } from "@shared/time";
import {
  sceneRebaseCommand,
  sceneSearchCommand,
} from "../_support/scene";

const view = {
  capacity: 1,
  active: new Uint8Array([1]),
  sceneIds: ["ship-marker-S123"],
  entityIds: ["S123"],
  positions: new Float64Array(2),
  motionPositions: new Float64Array(2),
  motionPositionStride:
    MovingSceneMotionPositionSchema.MotionPositionStride,
  unitVectors: new Float32Array(3),
  timestamps: new Float64Array(1),
  attributes: new Float32Array([90, 0, 0]),
  attributeStride: ShipSceneSchema.AttributeStride,
  stringAttributes: new Uint32Array(),
  stringAttributeStride: ShipSceneSchema.StringAttributeStride,
  dictionary: [],
  geometries: [null],
} satisfies RenderSceneView;

const base = {
  enabled: true,
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

    expect(
      layer.nearest(SceneHitKind.Point, 100, 100, 10, 10)
        ?.entityId,
    ).toBe("S123");
    expect(layer.includesEntity("S123", base)).toBe(true);
  });

  test("projects an unselected ship and resolves one moving position", () => {
    const rawUnit = geographicToUnitVector(10, 20);
    const moving = {
      capacity: 1,
      active: new Uint8Array([1]),
      sceneIds: ["moving-ship"],
      entityIds: ["moving-ship"],
      positions: new Float64Array([20, 10]),
      motionPositions: new Float64Array([0, 0]),
      motionPositionStride:
        MovingSceneMotionPositionSchema.MotionPositionStride,
      unitVectors: new Float32Array([
        rawUnit.x,
        rawUnit.y,
        rawUnit.z,
      ]),
      timestamps: new Float64Array([1_000]),
      attributes: new Float32Array([
        45,
        90,
        1_000,
      ]),
      attributeStride: ShipSceneSchema.AttributeStride,
      stringAttributes: new Uint32Array(),
      stringAttributeStride: ShipSceneSchema.StringAttributeStride,
      dictionary: [],
      geometries: [null],
    } satisfies RenderSceneView;
    const layer = new ShipLayer();
    const time = 1_000 + MS_PER_SECOND;
    const expected = advanceGeographicMotion(
      createGeographicMotion(0, 0, 90, 1_000),
      1,
    );
    layer.apply(sceneRebaseCommand(Domain.Ships, moving));
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
      time,
    );

    const hit = layer.nearest(
      SceneHitKind.Point,
      100 + expected.longitude,
      100 - expected.latitude,
      10,
      10,
    );
    const target = layer.selectionTarget("moving-ship", time);
    expect(hit?.latitude).toBeCloseTo(expected.latitude);
    expect(hit?.longitude).toBeCloseTo(expected.longitude);
    expect(target?.latitude).toBeCloseTo(expected.latitude);
    expect(target?.longitude).toBeCloseTo(expected.longitude);
    expect(target?.interpolated).toBe(true);
    expect(layer.hasFrameMotion()).toBe(true);
  });

  test("applies source search handles", () => {
    const layer = new ShipLayer();
    layer.apply(sceneRebaseCommand(Domain.Ships, view));
    layer.apply(sceneSearchCommand(Domain.Ships, [], 1));
    expect(layer.searchIncludesEntity("S123")).toBe(false);
    layer.apply(sceneSearchCommand(Domain.Ships, [1], 2));
    expect(layer.searchIncludesEntity("S123")).toBe(true);
  });

  test("applies source and isolation visibility", () => {
    expect(shipSceneIncludes(view, 0, base)).toBe(true);
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
