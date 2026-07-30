import { describe, expect, test } from "bun:test";
import {
  RenderGlobeStateController,
  createDefaultRenderGlobeState,
  restoreRenderGlobeStateCommands,
} from "@/workers/render/globeStateController";
import {
  RenderGlobeCommandKind,
  RenderProjectionMode,
  RenderRotationSpeedPolicy,
} from "@/workers/render/protocol";

describe("RenderGlobeStateController", () => {
  test("owns the projection and rotation defaults", () => {
    const controller = new RenderGlobeStateController();

    expect(controller.snapshot()).toEqual(
      createDefaultRenderGlobeState(),
    );
    expect(controller.snapshot()).toEqual({
      projection: RenderProjectionMode.Globe,
      rotationEnabled: false,
      rotationSpeed: RenderRotationSpeedPolicy.Default,
    });
  });

  test("applies semantic projection and rotation commands", () => {
    const controller = new RenderGlobeStateController();

    expect(
      controller.apply({
        kind: RenderGlobeCommandKind.SetProjection,
        projection: RenderProjectionMode.Flat,
      }),
    ).toEqual({
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
  });

  test("describes the commands needed to restore one snapshot", () => {
    expect(
      restoreRenderGlobeStateCommands({
        projection: RenderProjectionMode.Flat,
        rotationEnabled: true,
        rotationSpeed: RenderRotationSpeedPolicy.Maximum,
      }),
    ).toEqual([
      {
        kind: RenderGlobeCommandKind.SetProjection,
        projection: RenderProjectionMode.Flat,
      },
      {
        kind: RenderGlobeCommandKind.SetRotationEnabled,
        enabled: true,
      },
      {
        kind: RenderGlobeCommandKind.SetRotationSpeed,
        speed: RenderRotationSpeedPolicy.Maximum,
      },
    ]);
  });
});
