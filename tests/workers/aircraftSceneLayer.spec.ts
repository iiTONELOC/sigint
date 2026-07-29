import { describe, expect, test } from "bun:test";
import {
  IsolateMode,
  type RenderAircraftFilter,
} from "@/workers/render/protocol";
import {
  aircraftSceneIncludes,
  type AircraftSceneFilter,
} from "@/workers/render/scene/aircraftLayer";
import { AIRCRAFT_SCENE } from "@/workers/render/scene/aircraftSchema";
import type { RenderSceneView } from "@/workers/render/sceneStore";

const view = {
  capacity: 3,
  active: new Uint8Array([1, 1, 1]),
  ids: ["civil-air", "mil-ground", "recon-air"],
  positions: new Float32Array(6),
  unitVectors: new Float32Array(9),
  attributes: new Float32Array([
    10,
    0,
    AIRCRAFT_SCENE.squawks.emergency,
    20,
    AIRCRAFT_SCENE.flags.military +
      AIRCRAFT_SCENE.flags.onGround,
    AIRCRAFT_SCENE.squawks.normal,
    30,
    AIRCRAFT_SCENE.flags.military +
      AIRCRAFT_SCENE.flags.recon,
    AIRCRAFT_SCENE.squawks.hijack,
  ]),
  attributeStride: AIRCRAFT_SCENE.attributeStride,
  stringAttributes: new Uint32Array([1, 2, 1]),
  stringAttributeStride: AIRCRAFT_SCENE.stringAttributeStride,
  dictionary: ["United States", "Canada"],
} satisfies RenderSceneView;

function filter(
  values: Partial<RenderAircraftFilter> = {},
): RenderAircraftFilter {
  return {
    enabled: true,
    showAirborne: true,
    showGround: true,
    milFilter: "all",
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
  test("matches exact country and squawk buckets", () => {
    expect(
      aircraftSceneIncludes(
        view,
        0,
        settings({
          filter: filter({
            countries: ["United States"],
            squawks: ["7700"],
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
          filter: filter({ squawks: ["7500"] }),
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
            milFilter: "military",
          }),
        }),
      ),
    ).toBe(false);
    expect(
      aircraftSceneIncludes(
        view,
        2,
        settings({ filter: filter({ milFilter: "recon" }) }),
      ),
    ).toBe(true);
    expect(
      aircraftSceneIncludes(
        view,
        0,
        settings({ filter: filter({ milFilter: "civilian" }) }),
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
          isolatedType: "weather",
        }),
      ),
    ).toBe(false);
  });
});
