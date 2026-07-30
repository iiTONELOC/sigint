import { describe, expect, it } from "bun:test";
import {
  applyCameraWheel,
  beginCameraPointer,
  cameraSnapshot,
  createWorkerCameraState,
  createWorkerCameraTarget,
  createWorkerPointerState,
  endCameraPointer,
  focusCamera,
  moveCameraPointer,
  stepCamera,
} from "@/workers/render/camera";
import { CAMERA_POLICY } from "@/workers/render/policy";
import { RenderFocusKind } from "@/workers/render/protocol";

const viewport = { width: 1_000, height: 700 };

describe("render worker camera", () => {
  it("owns drag and inertia without React camera state", () => {
    const camera = createWorkerCameraState();
    const target = createWorkerCameraTarget();
    const pointer = createWorkerPointerState();

    beginCameraPointer(camera, pointer, viewport, false, 500, 350);
    expect(moveCameraPointer(
      camera,
      target,
      pointer,
      viewport,
      false,
      600,
      375,
    )).toBe(true);
    expect(cameraSnapshot(camera).rotY).not.toBe(0);
    expect(endCameraPointer(pointer)).toBeNull();

    const velocity = camera.velocityY;
    expect(stepCamera(
      camera,
      target,
      pointer,
      {
        viewport,
        flat: false,
        autoRotate: false,
        rotationSpeed: 1,
        selectedPosition: null,
        deltaMilliseconds: CAMERA_POLICY.nominalFrameMs,
      },
    )).toBe(true);
    expect(camera.velocityY).toBeLessThan(velocity);
  });

  it("keeps flat zoom anchored and bounded", () => {
    const camera = createWorkerCameraState();
    const target = createWorkerCameraTarget();

    applyCameraWheel(
      camera,
      target,
      viewport,
      true,
      700,
      400,
      -100_000,
    );

    expect(camera.zoomFlat).toBe(CAMERA_POLICY.flatMaximumZoom);
    expect(Number.isFinite(camera.panX)).toBe(true);
    expect(Number.isFinite(camera.panY)).toBe(true);
  });

  it("focuses and locks through the production target path", () => {
    const camera = createWorkerCameraState();
    const target = createWorkerCameraTarget();
    const position = {
      id: "storm",
      latitude: 28.6,
      longitude: -86,
    };

    focusCamera(
      camera,
      target,
      position,
      viewport,
      false,
      RenderFocusKind.Focus,
    );

    expect(target.lockedId).toBe(position.id);
    expect(target.zoom).toBe(CAMERA_POLICY.globeFocusZoom);
    expect(target.active).toBe(true);
  });

  it("stops scheduling when target and inertia settle", () => {
    const camera = createWorkerCameraState();
    const target = createWorkerCameraTarget();
    const pointer = createWorkerPointerState();

    expect(stepCamera(
      camera,
      target,
      pointer,
      {
        viewport,
        flat: false,
        autoRotate: false,
        rotationSpeed: 1,
        selectedPosition: null,
        deltaMilliseconds: CAMERA_POLICY.nominalFrameMs,
      },
    )).toBe(false);
  });
});
