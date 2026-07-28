import { isMobileWidth } from "@/config/breakpoints";
import { clampFlatPan, getFlatMetrics } from "@/lib/geo/render/flatMap";
import type { RenderCamera } from "./protocol";
import { CAMERA_POLICY } from "./policy";

const TWO_PI = Math.PI * 2;

export type CameraViewport = Readonly<{
  width: number;
  height: number;
}>;

export type CameraPosition = Readonly<{
  id: string;
  latitude: number;
  longitude: number;
}>;

export type WorkerCameraState = {
  rotY: number;
  rotX: number;
  velocityY: number;
  zoomGlobe: number;
  zoomFlat: number;
  panX: number;
  panY: number;
  rotationReleasedLock: boolean;
};

export type WorkerCameraTarget = {
  rotY: number;
  rotX: number;
  zoom: number;
  panX: number;
  panY: number;
  active: boolean;
  lockedId: string | null;
};

export type WorkerPointerState = {
  active: boolean;
  interactive: boolean;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  distance: number;
  pinching: boolean;
  pinchDistance: number;
};

export type CameraClick = Readonly<{
  x: number;
  y: number;
  interactive: boolean;
}>;

export type CameraFocusKind = "focus" | "reveal" | "double";

export function createWorkerCameraState(): WorkerCameraState {
  return {
    rotY: 0,
    rotX: 0.3,
    velocityY: 0,
    zoomGlobe: 1,
    zoomFlat: 1,
    panX: 0,
    panY: 0,
    rotationReleasedLock: false,
  };
}

export function createWorkerCameraTarget(): WorkerCameraTarget {
  return {
    rotY: 0,
    rotX: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    active: false,
    lockedId: null,
  };
}

export function createWorkerPointerState(): WorkerPointerState {
  return {
    active: false,
    interactive: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    distance: 0,
    pinching: false,
    pinchDistance: 0,
  };
}

export function cameraSnapshot(camera: WorkerCameraState): RenderCamera {
  return {
    rotY: camera.rotY,
    rotX: camera.rotX,
    zoomGlobe: camera.zoomGlobe,
    zoomFlat: camera.zoomFlat,
    panX: camera.panX,
    panY: camera.panY,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapRotation(value: number): number {
  return ((value % TWO_PI) + TWO_PI) % TWO_PI;
}

function positionTarget(
  target: WorkerCameraTarget,
  position: CameraPosition,
  viewport: CameraViewport,
  flat: boolean,
  zoom: number,
  useMobileOffset: boolean,
): void {
  if (flat) {
    const mapWidth =
      viewport.width * CAMERA_POLICY.flatMapWidthRatio * zoom;
    const mapHeight =
      viewport.height * CAMERA_POLICY.flatMapHeightRatio * zoom;
    target.panX = -(position.longitude / 180) * (mapWidth / 2);
    const basePanY = (position.latitude / 90) * (mapHeight / 2);
    target.panY =
      useMobileOffset && isMobileWidth(viewport.width)
        ? basePanY - viewport.height * CAMERA_POLICY.mobileFlatOffsetRatio
        : basePanY;
    target.zoom = zoom;
  } else {
    const latitudeRadians = (position.latitude * Math.PI) / 180;
    const longitudeRadians = (position.longitude * Math.PI) / 180;
    target.rotY = -longitudeRadians - Math.PI / 2;
    const baseRotX = latitudeRadians;
    if (useMobileOffset && isMobileWidth(viewport.width)) {
      const radius =
        Math.min(viewport.width, viewport.height) *
        CAMERA_POLICY.globeRadiusRatio *
        zoom;
      const offset =
        viewport.height * CAMERA_POLICY.mobileGlobeOffsetRatio;
      target.rotX =
        baseRotX - Math.asin(Math.min(0.95, offset / radius));
    } else {
      target.rotX = baseRotX;
    }
    target.zoom = zoom;
  }
  target.active = true;
}

export function focusCamera(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  position: CameraPosition,
  viewport: CameraViewport,
  flat: boolean,
  kind: CameraFocusKind,
): void {
  if (flat) {
    const zoom =
      kind === "double"
        ? Math.min(
            CAMERA_POLICY.flatMaximumZoom,
            Math.max(
              camera.zoomFlat * CAMERA_POLICY.doubleClickFlatZoomMultiplier,
              CAMERA_POLICY.doubleClickFlatMinimumZoom,
            ),
          )
        : Math.max(
            camera.zoomFlat,
            kind === "focus"
              ? CAMERA_POLICY.flatFocusZoom
              : CAMERA_POLICY.revealFlatZoom,
          );
    positionTarget(
      target,
      position,
      viewport,
      true,
      zoom,
      kind === "reveal",
    );
  } else {
    const zoom =
      kind === "double"
        ? CAMERA_POLICY.globeMaximumZoom
        : Math.max(
            camera.zoomGlobe,
            kind === "focus"
              ? CAMERA_POLICY.globeFocusZoom
              : CAMERA_POLICY.revealGlobeZoom,
          );
    positionTarget(
      target,
      position,
      viewport,
      false,
      zoom,
      kind === "reveal",
    );
    if (kind === "double") {
      camera.rotY = target.rotY;
      camera.rotX = target.rotX;
      camera.velocityY = 0;
    }
  }
  target.lockedId = kind === "reveal" ? null : position.id;
}

export function lockCamera(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  id: string,
  flat: boolean,
): void {
  target.lockedId = id;
  target.zoom = flat ? camera.zoomFlat : camera.zoomGlobe;
  target.active = true;
}

export function releaseCameraTarget(target: WorkerCameraTarget): void {
  target.lockedId = null;
  target.active = false;
}

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

  if (flat) {
    camera.panX += deltaX;
    camera.panY += deltaY;
    clampFlatPan(camera, viewport.width, viewport.height);
  } else {
    const zoom = camera.zoomGlobe || 1;
    camera.rotY +=
      (deltaX * CAMERA_POLICY.dragRadiansPerPixel) / zoom;
    camera.rotX = clamp(
      camera.rotX +
        (deltaY * CAMERA_POLICY.dragRadiansPerPixel) / zoom,
      -CAMERA_POLICY.pitchLimitRadians,
      CAMERA_POLICY.pitchLimitRadians,
    );
    camera.velocityY =
      (deltaX * CAMERA_POLICY.velocityRadiansPerPixel) / zoom;
  }
  pointer.lastX = x;
  pointer.lastY = y;
  return true;
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
  distance: number,
): void {
  pointer.pinching = true;
  pointer.pinchDistance = distance;
  pointer.active = false;
}

export function moveCameraPinch(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  pointer: WorkerPointerState,
  viewport: CameraViewport,
  flat: boolean,
  centerX: number,
  centerY: number,
  distance: number,
): boolean {
  if (!pointer.pinching) {
    beginCameraPinch(pointer, distance);
    return false;
  }
  if (pointer.pinchDistance <= 0 || distance <= 0) {
    pointer.pinchDistance = distance;
    return false;
  }
  releaseCameraTarget(target);
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
  code: string,
): boolean {
  if (code === "ArrowLeft") camera.rotY -= CAMERA_POLICY.keyboardRotationRadians;
  else if (code === "ArrowRight") camera.rotY += CAMERA_POLICY.keyboardRotationRadians;
  else if (code === "ArrowUp") {
    camera.rotX = Math.max(
      -CAMERA_POLICY.pitchLimitRadians,
      camera.rotX - CAMERA_POLICY.keyboardRotationRadians,
    );
  } else if (code === "ArrowDown") {
    camera.rotX = Math.min(
      CAMERA_POLICY.pitchLimitRadians,
      camera.rotX + CAMERA_POLICY.keyboardRotationRadians,
    );
  } else if (code === "Equal" || code === "NumpadAdd") {
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
  } else if (code === "Minus" || code === "NumpadSubtract") {
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

export function stepCamera(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  pointer: WorkerPointerState,
  viewport: CameraViewport,
  flat: boolean,
  autoRotate: boolean,
  rotationSpeed: number,
  selectedPosition: CameraPosition | null,
  deltaMilliseconds: number,
): boolean {
  if (!autoRotate) camera.rotationReleasedLock = false;
  if (
    autoRotate &&
    !flat &&
    target.lockedId &&
    !camera.rotationReleasedLock
  ) {
    releaseCameraTarget(target);
    camera.rotationReleasedLock = true;
  }

  if (
    target.lockedId &&
    selectedPosition?.id === target.lockedId
  ) {
    positionTarget(
      target,
      selectedPosition,
      viewport,
      flat,
      target.zoom > 0
        ? target.zoom
        : flat
          ? camera.zoomFlat
          : camera.zoomGlobe,
      true,
    );
  } else if (target.lockedId && !selectedPosition) {
    releaseCameraTarget(target);
  }

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

  if (target.active) {
    if (flat) {
      camera.panX += (target.panX - camera.panX) * lerpFactor;
      camera.panY += (target.panY - camera.panY) * lerpFactor;
      camera.zoomFlat +=
        (target.zoom - camera.zoomFlat) * lerpFactor;
      clampFlatPan(camera, viewport.width, viewport.height);
    } else {
      let rotationDelta = target.rotY - camera.rotY;
      rotationDelta =
        ((((rotationDelta + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) -
        Math.PI;
      camera.rotY += rotationDelta * lerpFactor;
      camera.rotX += (target.rotX - camera.rotX) * lerpFactor;
      camera.zoomGlobe +=
        (target.zoom - camera.zoomGlobe) * lerpFactor;
      camera.velocityY = 0;
    }

    if (!target.lockedId) {
      const zoomDelta = Math.abs(
        flat
          ? camera.zoomFlat - target.zoom
          : camera.zoomGlobe - target.zoom,
      );
      const positionDelta = flat
        ? Math.abs(camera.panX - target.panX) +
          Math.abs(camera.panY - target.panY)
        : Math.abs(camera.rotY - target.rotY) +
          Math.abs(camera.rotX - target.rotX);
      if (
        zoomDelta < CAMERA_POLICY.targetZoomStop &&
        positionDelta < CAMERA_POLICY.targetPositionStopRadians
      ) {
        target.active = false;
      }
    }
  }

  if (!flat && !pointer.active && autoRotate) {
    camera.rotY +=
      CAMERA_POLICY.autoRotationRadiansPerSecond *
      rotationSpeed *
      (boundedDelta / 1_000);
  }

  if (!flat && Math.abs(camera.velocityY) > 0) {
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

  camera.rotY = wrapRotation(camera.rotY);
  return (
    target.active ||
    (!flat && autoRotate && !pointer.active) ||
    Math.abs(camera.velocityY) > 0
  );
}
