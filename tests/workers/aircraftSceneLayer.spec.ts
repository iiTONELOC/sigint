import { describe, expect, test } from "bun:test";
import {
  IsolateMode,
  type RenderAircraftFilter,
} from "@/workers/render/protocol";
import {
  AircraftLayer,
  aircraftSceneIncludes,
  type AircraftSceneFilter,
} from "@/workers/render/scene/aircraftLayer";
import {
  AircraftSceneFlag,
  AircraftSceneSchema,
  AircraftSceneSquawk,
} from "@/workers/render/scene/aircraftSchema";
import {
  MovingSceneMotionPositionSchema,
} from "@/workers/render/scene/movingSceneSchema";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { SceneHitKind } from "@/workers/render/scene/projectedLayer";
import { Domain } from "@shared/domain/identity";
import { MilFilter, SquawkBucket } from "@shared/domain/aircraft";
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
  capacity: 3,
  active: new Uint8Array([1, 1, 1]),
  sceneIds: ["civil-marker", "mil-marker", "recon-marker"],
  entityIds: ["civil-air", "mil-ground", "recon-air"],
  positions: new Float64Array(6),
  motionPositions: new Float64Array(6),
  motionPositionStride:
    MovingSceneMotionPositionSchema.MotionPositionStride,
  unitVectors: new Float32Array(9),
  timestamps: new Float64Array(3),
  attributes: new Float32Array([
    10,
    0,
    AircraftSceneSquawk.Emergency,
    0,
    0,
    20,
    AircraftSceneFlag.Military +
      AircraftSceneFlag.OnGround,
    AircraftSceneSquawk.Normal,
    0,
    0,
    30,
    AircraftSceneFlag.Military +
      AircraftSceneFlag.Recon,
    AircraftSceneSquawk.Hijack,
    0,
    0,
  ]),
  attributeStride: AircraftSceneSchema.AttributeStride,
  stringAttributes: new Uint32Array([1, 2, 1]),
  stringAttributeStride: AircraftSceneSchema.StringAttributeStride,
  dictionary: ["United States", "Canada"],
  geometries: [null, null, null],
} satisfies RenderSceneView;

function filter(
  values: Partial<RenderAircraftFilter> = {},
): RenderAircraftFilter {
  return {
    enabled: true,
    showAirborne: true,
    showGround: true,
    milFilter: MilFilter.All,
    squawks: [],
    countries: [],
    ...values,
  };
}

function settings(
  values: Partial<AircraftSceneFilter> = {},
): AircraftSceneFilter {
  return {
    filter: filter(),
    isolateMode: null,
    isolatedId: null,
    isolatedType: null,
    ...values,
  };
}

describe("aircraft scene layer", () => {
  test("owns scene storage, projection, and hit resolution", () => {
    const layer = new AircraftLayer();
    layer.apply(sceneRebaseCommand(Domain.Aircraft, view));
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
      settings(),
    );

    expect(
      layer.nearest(SceneHitKind.Point, 100, 100, 10, 10)
        ?.entityId,
    ).toBe(
      "civil-air",
    );
    expect(layer.includesEntity("mil-ground", settings())).toBe(true);
  });

  test("projects an unselected aircraft and resolves one moving position", () => {
    const rawUnit = geographicToUnitVector(10, 20);
    const moving = {
      capacity: 1,
      active: new Uint8Array([1]),
      sceneIds: ["moving-aircraft"],
      entityIds: ["moving-aircraft"],
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
        90,
        0,
        AircraftSceneSquawk.Normal,
        90,
        1_000,
      ]),
      attributeStride: AircraftSceneSchema.AttributeStride,
      stringAttributes: new Uint32Array([0]),
      stringAttributeStride:
        AircraftSceneSchema.StringAttributeStride,
      dictionary: [],
      geometries: [null],
    } satisfies RenderSceneView;
    const layer = new AircraftLayer();
    const time = 1_000 + MS_PER_SECOND;
    const expected = advanceGeographicMotion(
      createGeographicMotion(0, 0, 90, 1_000),
      1,
    );
    layer.apply(sceneRebaseCommand(Domain.Aircraft, moving));
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
      settings(),
      time,
    );

    const hit = layer.nearest(
      SceneHitKind.Point,
      100 + expected.longitude,
      100 - expected.latitude,
      10,
      10,
    );
    const target = layer.selectionTarget(
      "moving-aircraft",
      time,
    );
    expect(hit?.latitude).toBeCloseTo(expected.latitude);
    expect(hit?.longitude).toBeCloseTo(expected.longitude);
    expect(target?.latitude).toBeCloseTo(expected.latitude);
    expect(target?.longitude).toBeCloseTo(expected.longitude);
    expect(target?.interpolated).toBe(true);
    expect(layer.hasFrameMotion()).toBe(true);
  });

  test("matches exact country and squawk buckets", () => {
    expect(
      aircraftSceneIncludes(
        view,
        0,
        settings({
          filter: filter({
            countries: ["United States"],
            squawks: [SquawkBucket.Emergency],
          }),
        }),
      ),
    ).toBe(true);
    expect(
      aircraftSceneIncludes(
        view,
        0,
        settings({
          filter: filter({ countries: ["United"] }),
        }),
      ),
    ).toBe(false);
    expect(
      aircraftSceneIncludes(
        view,
        2,
        settings({
          filter: filter({ squawks: [SquawkBucket.Hijack] }),
        }),
      ),
    ).toBe(true);
  });

  test("matches movement and role filters", () => {
    expect(
      aircraftSceneIncludes(
        view,
        1,
        settings({
          filter: filter({
            showGround: false,
            milFilter: MilFilter.Military,
          }),
        }),
      ),
    ).toBe(false);
    expect(
      aircraftSceneIncludes(
        view,
        2,
        settings({ filter: filter({ milFilter: MilFilter.Recon }) }),
      ),
    ).toBe(true);
    expect(
      aircraftSceneIncludes(
        view,
        0,
        settings({ filter: filter({ milFilter: MilFilter.Civilian }) }),
      ),
    ).toBe(true);
  });

  test("matches search and isolation settings", () => {
    const layer = new AircraftLayer();
    layer.apply(sceneRebaseCommand(Domain.Aircraft, view));
    layer.apply(sceneSearchCommand(Domain.Aircraft, [2], 1));
    expect(layer.searchIncludesEntity("civil-air")).toBe(false);
    expect(layer.searchIncludesEntity("mil-ground")).toBe(true);
    expect(
      aircraftSceneIncludes(
        view,
        1,
        settings({
          isolateMode: IsolateMode.Solo,
          isolatedId: "mil-ground",
        }),
      ),
    ).toBe(true);
    expect(
      aircraftSceneIncludes(
        view,
        1,
        settings({
          isolateMode: IsolateMode.Focus,
          isolatedType: Domain.Weather,
        }),
      ),
    ).toBe(false);
  });
});
