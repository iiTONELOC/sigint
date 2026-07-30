import { describe, expect, test } from "bun:test";
import {
  RenderGlobeStateController,
  createDefaultRenderGlobeState,
  restoreRenderGlobeStateCommands,
} from "@/workers/render/globeStateController";
import {
  RenderCycloneLayer,
  RenderGlobeCommandKind,
  RenderProjectionMode,
  RenderRotationSpeedPolicy,
} from "@/workers/render/protocol";
import {
  MilFilter,
  SquawkBucket,
} from "@shared/domain/aircraft";
import {
  SaffirSimpson,
} from "@shared/domain/cycloneClassification";
import { Domain } from "@shared/domain/identity";

describe("RenderGlobeStateController", () => {
  test("owns every globe rendering default", () => {
    const controller = new RenderGlobeStateController();
    const state = controller.snapshot();

    expect(state).toEqual(createDefaultRenderGlobeState());
    expect(state).toMatchObject({
      projection: RenderProjectionMode.Globe,
      rotationEnabled: false,
      rotationSpeed: RenderRotationSpeedPolicy.Default,
      earthquakeMinimumMagnitude: 0,
      fireMinimumConfidence: 0,
      aircraftFilter: {
        enabled: true,
        milFilter: MilFilter.All,
      },
      cycloneFilter: {
        minimumCategory: SaffirSimpson.None,
        showForecast: true,
        showCone: true,
        showWindField: false,
        showModels: false,
        showWarnings: true,
      },
    });
    expect(Object.values(state.layers).every(Boolean)).toBe(true);
  });

  test("applies semantic projection and rotation commands", () => {
    const controller = new RenderGlobeStateController();

    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.SetProjection,
        projection: RenderProjectionMode.Flat,
      }),
    ).toMatchObject({
      projection: RenderProjectionMode.Flat,
      rotationEnabled: false,
      rotationSpeed: RenderRotationSpeedPolicy.Default,
    });
    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.SetRotationEnabled,
        enabled: true,
      }),
    ).toMatchObject({ rotationEnabled: true });
    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.ToggleRotation,
      }),
    ).toMatchObject({ rotationEnabled: false });
    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.SetRotationSpeed,
        speed: RenderRotationSpeedPolicy.Maximum,
      }),
    ).toMatchObject({
      rotationSpeed: RenderRotationSpeedPolicy.Maximum,
    });
  });

  test("owns layer and source visibility", () => {
    const controller = new RenderGlobeStateController();

    expect(controller.sourceIsVisible(Domain.Earthquake)).toBe(true);
    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.ToggleLayer,
        layer: Domain.Quakes,
      }),
    ).toMatchObject({
      layers: { [Domain.Quakes]: false },
    });
    expect(controller.sourceIsVisible(Domain.Earthquake)).toBe(false);

    controller.apply({
      kind: RenderGlobeCommandKind.ToggleCycloneLayer,
      layer: RenderCycloneLayer.Warnings,
    });
    expect(controller.sourceIsVisible(Domain.CycloneWarnings)).toBe(
      false,
    );
  });

  test("owns aircraft and environmental filters", () => {
    const controller = new RenderGlobeStateController();
    const countries = ["US"];

    controller.apply({
      kind: RenderGlobeCommandKind.SetAircraftFilter,
      filter: {
        enabled: false,
        showAirborne: true,
        showGround: false,
        milFilter: MilFilter.Military,
        squawks: [SquawkBucket.Emergency],
        countries,
      },
    });
    countries.push("CA");
    controller.apply({
      kind: RenderGlobeCommandKind.SetEarthquakeFilter,
      minimumMagnitude: 3,
    });
    controller.apply({
      kind: RenderGlobeCommandKind.SetFireFilter,
      minimumConfidence: 75,
    });
    controller.apply({
      kind: RenderGlobeCommandKind.SetCycloneFilter,
      filter: {
        minimumCategory: SaffirSimpson.Cat3,
        showForecast: false,
        showCone: false,
        showWindField: true,
        showModels: true,
        showWarnings: false,
        hiddenModels: ["GFS"],
      },
    });

    expect(controller.snapshot()).toMatchObject({
      aircraftFilter: {
        enabled: false,
        countries: ["US"],
      },
      earthquakeMinimumMagnitude: 3,
      fireMinimumConfidence: 75,
      cycloneFilter: {
        minimumCategory: SaffirSimpson.Cat3,
        hiddenModels: ["GFS"],
      },
    });
    expect(controller.sourceIsVisible(Domain.Aircraft)).toBe(false);
  });

  test("toggles cyclone model visibility without duplicate codes", () => {
    const controller = new RenderGlobeStateController();

    controller.apply({
      kind: RenderGlobeCommandKind.ToggleCycloneModel,
      model: "GFS",
    });
    controller.apply({
      kind: RenderGlobeCommandKind.ToggleCycloneModel,
      model: "GFS",
    });
    expect(controller.snapshot().cycloneFilter.hiddenModels).toEqual([]);

    controller.apply({
      kind: RenderGlobeCommandKind.ToggleAllCycloneModels,
      models: ["GFS", "ECMWF"],
    });
    expect(controller.snapshot().cycloneFilter.hiddenModels).toEqual([
      "GFS",
      "ECMWF",
    ]);
    controller.apply({
      kind: RenderGlobeCommandKind.ToggleAllCycloneModels,
      models: ["GFS", "ECMWF"],
    });
    expect(controller.snapshot().cycloneFilter.hiddenModels).toEqual([]);
  });

  test("rejects invalid and unchanged transitions", () => {
    const controller = new RenderGlobeStateController();

    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.SetRotationSpeed,
        speed: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.SetProjection,
        projection: RenderProjectionMode.Globe,
      }),
    ).toBeNull();
    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.ToggleLayer,
        layer: Domain.Aircraft,
      }),
    ).toBeNull();
  });

  test("describes commands that restore the complete snapshot", () => {
    const state = createDefaultRenderGlobeState();
    const commands = restoreRenderGlobeStateCommands({
      ...state,
      projection: RenderProjectionMode.Flat,
      rotationEnabled: true,
      layers: {
        ...state.layers,
        [Domain.Ships]: false,
      },
    });

    expect(commands).toContainEqual({
      kind: RenderGlobeCommandKind.SetProjection,
      projection: RenderProjectionMode.Flat,
    });
    expect(commands).toContainEqual({
      kind: RenderGlobeCommandKind.SetRotationEnabled,
      enabled: true,
    });
    expect(commands).toContainEqual({
      kind: RenderGlobeCommandKind.SetLayerVisibility,
      layer: Domain.Ships,
      visible: false,
    });
    expect(commands).toContainEqual({
      kind: RenderGlobeCommandKind.SetAircraftFilter,
      filter: state.aircraftFilter,
    });
    expect(commands).toContainEqual({
      kind: RenderGlobeCommandKind.SetCycloneFilter,
      filter: state.cycloneFilter,
    });
  });
});
