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
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { Domain } from "@shared/domain/identity";
import { MilFilter, SquawkBucket } from "@shared/domain/aircraft";
import { sceneRebaseCommand } from "../_support/scene";

const view = {
  capacity: 3,
  active: new Uint8Array([1, 1, 1]),
  sceneIds: ["civil-marker", "mil-marker", "recon-marker"],
  entityIds: ["civil-air", "mil-ground", "recon-air"],
  positions: new Float64Array(6),
  unitVectors: new Float32Array(9),
  timestamps: new Float64Array(3),
  attributes: new Float32Array([
    10,
    0,
    AircraftSceneSquawk.Emergency,
    20,
    AircraftSceneFlag.Military +
      AircraftSceneFlag.OnGround,
    AircraftSceneSquawk.Normal,
    30,
    AircraftSceneFlag.Military +
      AircraftSceneFlag.Recon,
    AircraftSceneSquawk.Hijack,
  ]),
  attributeStride: AircraftSceneSchema.AttributeStride,
  stringAttributes: new Uint32Array([1, 2, 1]),
  stringAttributeStride: AircraftSceneSchema.StringAttributeStride,
  dictionary: ["United States", "Canada"],
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
    searchIds: null,
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

    expect(layer.nearest(100, 100, 10, 10)?.entityId).toBe(
      "civil-air",
    );
    expect(layer.includesEntity("mil-ground", settings())).toBe(true);
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
    expect(
      aircraftSceneIncludes(
        view,
        0,
        settings({ searchIds: new Set(["mil-ground"]) }),
      ),
    ).toBe(false);
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
