import { clampFlatPan, getFlatMetrics } from "@/lib/geo/render/flatMap";
import { RenderCameraKey } from "./protocol";
import { CAMERA_POLICY } from "./policy";
import {
  type CameraClick,
  type CameraPinchMovement,
  type CameraViewport,
  type WorkerCameraState,
  type WorkerCameraTarget,
  type WorkerPointerState,
  clamp,
  releaseCameraTarget,
} from "@/workers/render/camera";

export function cameraContainsPoint(
  camera: WorkerCameraState,
  viewport: CameraViewport,
  flat: boolean,
  x: number,
  y: number,
): boolean {
  if (flat) {
    const metrics = getFlatMetrics(
      viewport.width,
      viewport.height,
      camera.zoomFlat,
      camera.panX,
      camera.panY,
    );
    return (
      x >= metrics.mx &&
      x <= metrics.mx + metrics.mW &&
      y >= metrics.my &&
      y <= metrics.my + metrics.mH
    );
  }
  const radius =
    Math.min(viewport.width, viewport.height) *
    CAMERA_POLICY.globeRadiusRatio *
    camera.zoomGlobe;
  return (
    Math.hypot(x - viewport.width / 2, y - viewport.height / 2) <= radius
  );
}

export function beginCameraPointer(
  camera: WorkerCameraState,
  pointer: WorkerPointerState,
  viewport: CameraViewport,
  flat: boolean,
  x: number,
  y: number,
): void {
  pointer.active = true;
  pointer.interactive = cameraContainsPoint(
    camera,
    viewport,
    flat,
    x,
    y,
  );
  pointer.lastX = x;
  pointer.lastY = y;
  pointer.startX = x;
  pointer.startY = y;
  pointer.distance = 0;
}

export function moveCameraPointer(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  pointer: WorkerPointerState,
  viewport: CameraViewport,
  flat: boolean,
  x: number,
  y: number,
): boolean {
  if (!pointer.active || !pointer.interactive) return false;
  const deltaX = x - pointer.lastX;
  const deltaY = y - pointer.lastY;
  pointer.distance += Math.abs(deltaX) + Math.abs(deltaY);
  if (pointer.distance > CAMERA_POLICY.dragClickThresholdPx) {
    releaseCameraTarget(target);
  }
  dragCamera(camera, viewport, flat, { deltaX, deltaY });
  pointer.lastX = x;
  pointer.lastY = y;
  return true;
}

type CameraDrag = Readonly<{ deltaX: number; deltaY: number }>;

function dragCamera(
  camera: WorkerCameraState,
  viewport: CameraViewport,
  flat: boolean,
  drag: CameraDrag,
): void {
  const { deltaX, deltaY } = drag;
  if (flat) {
    camera.panX += deltaX;
    camera.panY += deltaY;
    clampFlatPan(camera, viewport.width, viewport.height);
    return;
  }
  const zoom = camera.zoomGlobe || 1;
  camera.rotY += (deltaX * CAMERA_POLICY.dragRadiansPerPixel) / zoom;
  camera.rotX = clamp(
    camera.rotX + (deltaY * CAMERA_POLICY.dragRadiansPerPixel) / zoom,
    -CAMERA_POLICY.pitchLimitRadians,
    CAMERA_POLICY.pitchLimitRadians,
  );
  camera.velocityY = (deltaX * CAMERA_POLICY.velocityRadiansPerPixel) / zoom;
}

export function endCameraPointer(
  pointer: WorkerPointerState,
): CameraClick | null {
  if (!pointer.active) return null;
  const click =
    pointer.distance < CAMERA_POLICY.dragClickThresholdPx
      ? {
          x: pointer.startX,
          y: pointer.startY,
          interactive: pointer.interactive,
        }
      : null;
  pointer.active = false;
  pointer.interactive = false;
  return click;
}

export function cancelCameraPointer(pointer: WorkerPointerState): void {
  pointer.active = false;
  pointer.interactive = false;
  pointer.pinching = false;
  pointer.pinchDistance = 0;
}

export function beginCameraPinch(
  pointer: WorkerPointerState,
  movement: CameraPinchMovement,
): void {
  pointer.pinching = true;
  pointer.pinchDistance = movement.distance;
  pointer.lastX = movement.centerX;
  pointer.lastY = movement.centerY;
  pointer.active = false;
}

export function moveCameraPinch(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  pointer: WorkerPointerState,
  viewport: CameraViewport,
  flat: boolean,
  movement: CameraPinchMovement,
): boolean {
  const { centerX, centerY, distance } = movement;
  if (!pointer.pinching) {
    beginCameraPinch(pointer, movement);
    return false;
  }
  if (pointer.pinchDistance <= 0 || distance <= 0) {
    beginCameraPinch(pointer, movement);
    return false;
  }
  releaseCameraTarget(target);
  dragCamera(camera, viewport, flat, { deltaX: centerX - pointer.lastX, deltaY: centerY - pointer.lastY });
  pointer.lastX = centerX;
  pointer.lastY = centerY;
  const factor = distance / pointer.pinchDistance;
  if (flat) {
    const oldZoom = camera.zoomFlat;
    camera.zoomFlat = clamp(
      oldZoom * factor,
      CAMERA_POLICY.flatMinimumZoom,
      CAMERA_POLICY.flatMaximumZoom,
    );
    const actualFactor = camera.zoomFlat / oldZoom;
    const relativeX = centerX - viewport.width / 2;
    const relativeY = centerY - viewport.height / 2;
    camera.panX =
      relativeX - actualFactor * (relativeX - camera.panX);
    camera.panY =
      relativeY - actualFactor * (relativeY - camera.panY);
    clampFlatPan(camera, viewport.width, viewport.height);
  } else {
    camera.zoomGlobe = clamp(
      camera.zoomGlobe * factor,
      CAMERA_POLICY.globeMinimumZoom,
      CAMERA_POLICY.globeMaximumZoom,
    );
  }
  pointer.pinchDistance = distance;
  return true;
}

export function endCameraPinch(pointer: WorkerPointerState): void {
  pointer.pinching = false;
  pointer.pinchDistance = 0;
}

export function applyCameraWheel(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  viewport: CameraViewport,
  flat: boolean,
  x: number,
  y: number,
  deltaY: number,
): void {
  const factor = Math.exp(-deltaY * CAMERA_POLICY.wheelZoomRate);
  if (target.lockedId) {
    target.zoom = flat
      ? clamp(
          target.zoom * factor,
          CAMERA_POLICY.flatMinimumZoom,
          CAMERA_POLICY.flatMaximumZoom,
        )
      : clamp(
          target.zoom * factor,
          CAMERA_POLICY.globeMinimumZoom,
          CAMERA_POLICY.globeMaximumZoom,
        );
    target.active = true;
    return;
  }

  target.active = false;
  if (flat) {
    const oldZoom = camera.zoomFlat;
    camera.zoomFlat = clamp(
      oldZoom * factor,
      CAMERA_POLICY.flatMinimumZoom,
      CAMERA_POLICY.flatMaximumZoom,
    );
    const actualFactor = camera.zoomFlat / oldZoom;
    const relativeX = x - viewport.width / 2;
    const relativeY = y - viewport.height / 2;
    camera.panX =
      relativeX - actualFactor * (relativeX - camera.panX);
    camera.panY =
      relativeY - actualFactor * (relativeY - camera.panY);
    clampFlatPan(camera, viewport.width, viewport.height);
  } else {
    camera.zoomGlobe = clamp(
      camera.zoomGlobe * factor,
      CAMERA_POLICY.globeMinimumZoom,
      CAMERA_POLICY.globeMaximumZoom,
    );
  }
}

export function applyCameraKey(
  camera: WorkerCameraState,
  viewport: CameraViewport,
  flat: boolean,
  code: RenderCameraKey,
): boolean {
  if (code === RenderCameraKey.ArrowLeft) {
    camera.rotY -= CAMERA_POLICY.keyboardRotationRadians;
  } else if (code === RenderCameraKey.ArrowRight) {
    camera.rotY += CAMERA_POLICY.keyboardRotationRadians;
  } else if (code === RenderCameraKey.ArrowUp) {
    camera.rotX = Math.max(
      -CAMERA_POLICY.pitchLimitRadians,
      camera.rotX - CAMERA_POLICY.keyboardRotationRadians,
    );
  } else if (code === RenderCameraKey.ArrowDown) {
    camera.rotX = Math.min(
      CAMERA_POLICY.pitchLimitRadians,
      camera.rotX + CAMERA_POLICY.keyboardRotationRadians,
    );
  } else if (
    code === RenderCameraKey.Equal ||
    code === RenderCameraKey.NumpadAdd
  ) {
    if (flat) {
      camera.zoomFlat = Math.min(
        CAMERA_POLICY.flatMaximumZoom,
        camera.zoomFlat * CAMERA_POLICY.keyboardZoomFactor,
      );
      clampFlatPan(camera, viewport.width, viewport.height);
    } else {
      camera.zoomGlobe = Math.min(
        CAMERA_POLICY.globeMaximumZoom,
        camera.zoomGlobe * CAMERA_POLICY.keyboardZoomFactor,
      );
    }
  } else if (
    code === RenderCameraKey.Minus ||
    code === RenderCameraKey.NumpadSubtract
  ) {
    if (flat) {
      camera.zoomFlat = Math.max(
        CAMERA_POLICY.flatMinimumZoom,
        camera.zoomFlat / CAMERA_POLICY.keyboardZoomFactor,
      );
      clampFlatPan(camera, viewport.width, viewport.height);
    } else {
      camera.zoomGlobe = Math.max(
        CAMERA_POLICY.globeMinimumZoom,
        camera.zoomGlobe / CAMERA_POLICY.keyboardZoomFactor,
      );
    }
  } else {
    return false;
  }
  return true;
}
