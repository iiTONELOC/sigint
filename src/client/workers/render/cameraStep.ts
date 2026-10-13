import { clampFlatPan } from "@/lib/geo/render/flatMap";
import { CAMERA_POLICY } from "./policy";
import { MS_PER_SECOND } from "@shared/time";
import {
  type CameraStepFrame,
  type WorkerCameraState,
  type WorkerCameraTarget,
  type WorkerPointerState,
  clamp,
  fullTurnRadians,
  positionTarget,
  releaseCameraTarget,
  wrapRotation,
} from "@/workers/render/camera";

type CameraStepTiming = Readonly<{
  boundedDelta: number;
  frameFactor: number;
  lerpFactor: number;
}>;

function releaseTargetForAutoRotation(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  frame: CameraStepFrame,
): void {
  if (!frame.autoRotate) {
    camera.rotationReleasedLock = false;
    return;
  }
  if (
    !frame.flat &&
    target.lockedId &&
    !camera.rotationReleasedLock
  ) {
    releaseCameraTarget(target);
    camera.rotationReleasedLock = true;
  }
}

function currentCameraZoom(
  camera: WorkerCameraState,
  flat: boolean,
): number {
  return flat ? camera.zoomFlat : camera.zoomGlobe;
}

function refreshLockedTarget(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  frame: CameraStepFrame,
): void {
  if (
    target.lockedId &&
    frame.selectedPosition?.id === target.lockedId
  ) {
    const zoom =
      target.zoom > 0
        ? target.zoom
        : currentCameraZoom(camera, frame.flat);
    positionTarget(
      target,
      frame.selectedPosition,
      frame.viewport,
      frame.flat,
      zoom,
      true,
    );
  } else if (target.lockedId && !frame.selectedPosition) {
    releaseCameraTarget(target);
  }
}

function cameraStepTiming(
  deltaMilliseconds: number,
): CameraStepTiming {
  const boundedDelta = clamp(
    deltaMilliseconds,
    0,
    CAMERA_POLICY.maximumFrameDeltaMs,
  );
  const frameFactor = boundedDelta / CAMERA_POLICY.nominalFrameMs;
  const lerpFactor =
    1 -
    Math.pow(
      1 - CAMERA_POLICY.targetLerpPerFrame,
      Math.max(frameFactor, 0),
    );
  return { boundedDelta, frameFactor, lerpFactor };
}

function targetHasSettled(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  flat: boolean,
): boolean {
  let zoomDelta: number;
  let positionDelta: number;
  if (flat) {
    zoomDelta = Math.abs(camera.zoomFlat - target.zoom);
    positionDelta =
      Math.abs(camera.panX - target.panX) +
      Math.abs(camera.panY - target.panY);
  } else {
    zoomDelta = Math.abs(camera.zoomGlobe - target.zoom);
    positionDelta =
      Math.abs(camera.rotY - target.rotY) +
      Math.abs(camera.rotX - target.rotX);
  }
  return (
    zoomDelta < CAMERA_POLICY.targetZoomStop &&
    positionDelta <
      CAMERA_POLICY.targetPositionStopRadians
  );
}

function interpolateTarget(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  frame: CameraStepFrame,
  lerpFactor: number,
): void {
  if (!target.active) return;
  if (frame.flat) {
    camera.panX += (target.panX - camera.panX) * lerpFactor;
    camera.panY += (target.panY - camera.panY) * lerpFactor;
    camera.zoomFlat +=
      (target.zoom - camera.zoomFlat) * lerpFactor;
    clampFlatPan(
      camera,
      frame.viewport.width,
      frame.viewport.height,
    );
  } else {
    let rotationDelta = target.rotY - camera.rotY;
    const fullTurn = fullTurnRadians();
    rotationDelta =
      ((((rotationDelta + Math.PI) % fullTurn) + fullTurn) %
        fullTurn) -
      Math.PI;
    camera.rotY += rotationDelta * lerpFactor;
    camera.rotX += (target.rotX - camera.rotX) * lerpFactor;
    camera.zoomGlobe +=
      (target.zoom - camera.zoomGlobe) * lerpFactor;
    camera.velocityY = 0;
  }

  if (
    !target.lockedId &&
    targetHasSettled(camera, target, frame.flat)
  ) {
    target.active = false;
  }
}

function applyAutoRotation(
  camera: WorkerCameraState,
  pointer: WorkerPointerState,
  frame: CameraStepFrame,
  boundedDelta: number,
): void {
  if (
    frame.flat ||
    pointer.active ||
    !frame.autoRotate
  ) {
    return;
  }
  camera.rotY +=
    CAMERA_POLICY.autoRotationRadiansPerSecond *
    frame.rotationSpeed *
    (boundedDelta / MS_PER_SECOND);
}

function applyCameraInertia(
  camera: WorkerCameraState,
  flat: boolean,
  frameFactor: number,
): void {
  if (flat || Math.abs(camera.velocityY) <= 0) return;
  camera.rotY += camera.velocityY * frameFactor;
  camera.velocityY *= Math.pow(
    CAMERA_POLICY.inertiaDecayPerFrame,
    frameFactor,
  );
  if (
    Math.abs(camera.velocityY) <
    CAMERA_POLICY.inertiaStopRadians
  ) {
    camera.velocityY = 0;
  }
}

export function stepCamera(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  pointer: WorkerPointerState,
  frame: CameraStepFrame,
): boolean {
  releaseTargetForAutoRotation(camera, target, frame);
  refreshLockedTarget(camera, target, frame);

  const timing = cameraStepTiming(frame.deltaMilliseconds);
  interpolateTarget(
    camera,
    target,
    frame,
    timing.lerpFactor,
  );
  applyAutoRotation(
    camera,
    pointer,
    frame,
    timing.boundedDelta,
  );
  applyCameraInertia(
    camera,
    frame.flat,
    timing.frameFactor,
  );

  camera.rotY = wrapRotation(camera.rotY);
  return (
    target.active ||
    (!frame.flat && frame.autoRotate && !pointer.active) ||
    Math.abs(camera.velocityY) > 0
  );
}
