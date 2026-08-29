import { Domain } from "@shared/domain/identity";

export type RenderPolicy = Readonly<{
  maxDevicePixelRatio: number;
}>;

export const REGISTERED_RENDER_LAYER_DEFAULTS = Object.freeze({
  [Domain.Ships]: true,
  [Domain.Events]: true,
  [Domain.Quakes]: true,
  [Domain.Fires]: true,
  [Domain.Weather]: true,
  [Domain.Cyclones]: true,
});

export type RenderLayerId =
  keyof typeof REGISTERED_RENDER_LAYER_DEFAULTS;

export type RenderLayerVisibility = Readonly<
  Record<RenderLayerId, boolean>
>;

export function isRenderLayerId(value: unknown): value is RenderLayerId {
  return (
    typeof value === "string" &&
    Object.hasOwn(REGISTERED_RENDER_LAYER_DEFAULTS, value)
  );
}

export function registeredRenderLayerIds(): RenderLayerId[] {
  return Object.keys(REGISTERED_RENDER_LAYER_DEFAULTS).filter(
    isRenderLayerId,
  );
}

export type CameraPolicy = Readonly<{
  autoRotationRadiansPerSecond: number;
  doubleClickIntervalMs: number;
  cameraSummaryIntervalMs: number;
  doubleClickFlatMinimumZoom: number;
  doubleClickFlatZoomMultiplier: number;
  dragClickThresholdPx: number;
  dragRadiansPerPixel: number;
  flatFocusZoom: number;
  flatMapHeightRatio: number;
  flatMapWidthRatio: number;
  flatMaximumZoom: number;
  flatMinimumZoom: number;
  hoverHitRadiusPx: number;
  hitCellSizePx: number;
  globeFocusZoom: number;
  globeMaximumZoom: number;
  globeMinimumZoom: number;
  globeRadiusRatio: number;
  inertiaDecayPerFrame: number;
  inertiaStopRadians: number;
  keyboardRotationRadians: number;
  keyboardZoomFactor: number;
  maximumFrameDeltaMs: number;
  maximumHitCandidates: number;
  mobileFlatOffsetRatio: number;
  mobileGlobeOffsetRatio: number;
  nominalFrameMs: number;
  pitchLimitRadians: number;
  pointHitRadiusPx: number;
  revealFlatZoom: number;
  revealGlobeZoom: number;
  routeHitRadiusPx: number;
  selectedSideLeftRatio: number;
  selectedSideRightRatio: number;
  trailHitRadiusPx: number;
  targetLerpPerFrame: number;
  targetPositionStopRadians: number;
  targetZoomStop: number;
  syntheticMouseSuppressionMs: number;
  velocityRadiansPerPixel: number;
  wheelZoomRate: number;
}>;

export const RENDER_POLICY: RenderPolicy = {
  maxDevicePixelRatio: 2,
};

export const CAMERA_POLICY: CameraPolicy = {
  autoRotationRadiansPerSecond: 0.12,
  doubleClickIntervalMs: 800,
  cameraSummaryIntervalMs: 100,
  doubleClickFlatMinimumZoom: 80,
  doubleClickFlatZoomMultiplier: 8,
  dragClickThresholdPx: 15,
  dragRadiansPerPixel: 0.005,
  flatFocusZoom: 40,
  flatMapHeightRatio: 0.84,
  flatMapWidthRatio: 0.92,
  flatMaximumZoom: 500,
  flatMinimumZoom: 0.85,
  hoverHitRadiusPx: 14,
  hitCellSizePx: 32,
  globeFocusZoom: 35,
  globeMaximumZoom: 350,
  globeMinimumZoom: 0.55,
  globeRadiusRatio: 0.4,
  inertiaDecayPerFrame: 0.95,
  inertiaStopRadians: 0.00001,
  keyboardRotationRadians: 0.05,
  keyboardZoomFactor: 1.1,
  maximumFrameDeltaMs: 50,
  maximumHitCandidates: 256,
  mobileFlatOffsetRatio: 0.23,
  mobileGlobeOffsetRatio: 0.19,
  nominalFrameMs: 1_000 / 60,
  pitchLimitRadians: 1.2,
  pointHitRadiusPx: 14,
  revealFlatZoom: 2,
  revealGlobeZoom: 2.5,
  routeHitRadiusPx: 8,
  selectedSideLeftRatio: 0.35,
  selectedSideRightRatio: 0.65,
  trailHitRadiusPx: 12,
  targetLerpPerFrame: 0.08,
  syntheticMouseSuppressionMs: 1_000,
  targetPositionStopRadians: 0.001,
  targetZoomStop: 0.01,
  velocityRadiansPerPixel: 0.001,
  wheelZoomRate: 0.0015,
};
