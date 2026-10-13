import { getFlatMetrics, projFlat, type FlatMetrics } from "@/lib/geo/render/flatMap";
import type { ProjFn } from "@/lib/geo/render/types";
import { screenToLatLonFlat, screenToLatLonGlobe } from "@/lib/geo/spatialIndex";
import {
  createGlobeRotationMatrix,
  projectGeographicPoint,
  type GlobeRotationMatrix,
} from "@/lib/geo/unitSphere";
import { RenderFocusKind, type RenderCamera } from "./protocol";
import { CAMERA_POLICY } from "./policy";
import {
  createGeoPoint,
  GeoLimit,
  type GeoPoint,
  TurnDeg,
} from "@shared/geo";

export type CameraViewport = Readonly<{
  width: number;
  height: number;
  isMobile: boolean;
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

export type CameraPinchMovement = Readonly<{
  centerX: number;
  centerY: number;
  distance: number;
}>;

export type CameraStepFrame = Readonly<{
  viewport: CameraViewport;
  flat: boolean;
  autoRotate: boolean;
  rotationSpeed: number;
  selectedPosition: CameraPosition | null;
  deltaMilliseconds: number;
}>;

export type CameraProjection = Readonly<{
  centerX: number;
  centerY: number;
  flatMetrics: FlatMetrics | null;
  globeMatrix: GlobeRotationMatrix;
  globeRadius: number;
  project: ProjFn;
  screenPoint: (x: number, y: number) => GeoPoint | null;
}>;

export function createCameraProjection(
  camera: RenderCamera,
  viewport: CameraViewport,
  flat: boolean,
): CameraProjection {
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const flatMetrics = flat
    ? getFlatMetrics(
        viewport.width,
        viewport.height,
        camera.zoomFlat,
        camera.panX,
        camera.panY,
      )
    : null;
  const globeRadius =
    Math.min(viewport.width, viewport.height) *
    CAMERA_POLICY.globeRadiusRatio *
    camera.zoomGlobe;
  const project: ProjFn = flatMetrics
    ? (latitude, longitude) =>
        projFlat(
          latitude,
          longitude,
          flatMetrics.cx,
          flatMetrics.cy,
          flatMetrics.mW,
          flatMetrics.mH,
        )
    : (latitude, longitude) =>
        projectGeographicPoint(
          latitude,
          longitude,
          centerX,
          centerY,
          globeRadius,
          camera.rotY,
          camera.rotX,
        );
  return {
    centerX,
    centerY,
    flatMetrics,
    globeMatrix: createGlobeRotationMatrix(camera.rotY, camera.rotX),
    globeRadius,
    project,
    screenPoint: (x, y) => {
      const coordinate = flatMetrics
        ? screenToLatLonFlat(
            x,
            y,
            flatMetrics.cx,
            flatMetrics.cy,
            flatMetrics.mW,
            flatMetrics.mH,
          )
        : screenToLatLonGlobe(
            x,
            y,
            centerX,
            centerY,
            globeRadius,
            camera.rotY,
            camera.rotX,
          );
      return coordinate
        ? createGeoPoint(coordinate.lon, coordinate.lat)
        : null;
    },
  };
}

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

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function fullTurnRadians(): number {
  return Math.PI * 2;
}

export function wrapRotation(value: number): number {
  const fullTurn = fullTurnRadians();
  return ((value % fullTurn) + fullTurn) % fullTurn;
}

export function positionTarget(
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
    target.panX =
      -(position.longitude / GeoLimit.MaxLongitude) * (mapWidth / 2);
    const basePanY =
      (position.latitude / GeoLimit.MaxLatitude) * (mapHeight / 2);
    target.panY =
      useMobileOffset && viewport.isMobile
        ? basePanY - viewport.height * CAMERA_POLICY.mobileFlatOffsetRatio
        : basePanY;
    target.zoom = zoom;
  } else {
    const latitudeRadians =
      (position.latitude * Math.PI) / TurnDeg.Half;
    const longitudeRadians =
      (position.longitude * Math.PI) / TurnDeg.Half;
    target.rotY = -longitudeRadians - Math.PI / 2;
    const baseRotX = latitudeRadians;
    if (useMobileOffset && viewport.isMobile) {
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

function flatTargetZoom(
  camera: WorkerCameraState,
  kind: RenderFocusKind,
): number {
  if (kind === RenderFocusKind.Double) {
    return Math.min(
      CAMERA_POLICY.flatMaximumZoom,
      Math.max(
        camera.zoomFlat *
          CAMERA_POLICY.doubleClickFlatZoomMultiplier,
        CAMERA_POLICY.doubleClickFlatMinimumZoom,
      ),
    );
  }
  const minimumZoom =
    kind === RenderFocusKind.Focus
      ? CAMERA_POLICY.flatFocusZoom
      : CAMERA_POLICY.revealFlatZoom;
  return Math.max(camera.zoomFlat, minimumZoom);
}

function globeTargetZoom(
  camera: WorkerCameraState,
  kind: RenderFocusKind,
): number {
  if (kind === RenderFocusKind.Double) {
    return CAMERA_POLICY.globeMaximumZoom;
  }
  const minimumZoom =
    kind === RenderFocusKind.Focus
      ? CAMERA_POLICY.globeFocusZoom
      : CAMERA_POLICY.revealGlobeZoom;
  return Math.max(camera.zoomGlobe, minimumZoom);
}

export function focusCamera(
  camera: WorkerCameraState,
  target: WorkerCameraTarget,
  position: CameraPosition,
  viewport: CameraViewport,
  flat: boolean,
  kind: RenderFocusKind,
): void {
  if (flat) {
    positionTarget(
      target,
      position,
      viewport,
      true,
      flatTargetZoom(camera, kind),
      kind === RenderFocusKind.Reveal,
    );
  } else {
    positionTarget(
      target,
      position,
      viewport,
      false,
      globeTargetZoom(camera, kind),
      kind === RenderFocusKind.Reveal,
    );
    if (kind === RenderFocusKind.Double) {
      camera.rotY = target.rotY;
      camera.rotX = target.rotX;
      camera.velocityY = 0;
    }
  }
  target.lockedId =
    kind === RenderFocusKind.Reveal ? null : position.id;
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

