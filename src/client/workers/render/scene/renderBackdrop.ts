import type { RenderWorkerColors } from "@shared/domain/theme";
import { ThemeColorKey } from "@shared/domain/theme";
import { GeoLimit, type GeoMultiPolygon, type GeoRing } from "@shared/geo";
import type { FlatMetrics } from "@/lib/geo/render/flatMap";
import { drawGrid } from "@/lib/geo/render/grid";
import { drawFlatLandRing, drawProjectedLandRing } from "@/lib/geo/render/land";
import {
  projectedRingPath,
  splitAntimeridianSegments,
  strokeOutlinePaths,
} from "@/lib/geo/render/polygon";
import type { HorizonCircle, Projected, ProjFn } from "@/lib/geo/render/types";
import { geographicToUnitVector, projectUnitVectorInto, type UnitVector } from "@/lib/geo/unitSphere";
import { createCameraProjection, type CameraProjection } from "@/workers/render/camera";
import type { RenderCamera, RenderViewportPayload } from "@/workers/render/protocol";
import { CAMERA_POLICY } from "@/workers/render/policy";
import type { SceneAreaProjectionFrame } from "@/workers/render/scene/areaLayer";

export type RenderBackdropOptions = Readonly<{
  camera: RenderCamera;
  colors: RenderWorkerColors;
  context: OffscreenCanvasRenderingContext2D;
  flat: boolean;
  light: boolean;
  viewport: RenderViewportPayload;
}>;

enum SceneProjectionPolicy {
  CullMarginPixels = 24,
  HorizonInsetPixels = 0.5,
}

enum BackdropGeometry {
  ArcStart = 0,
  ArcEnd = 6.283185307179586,
  GlowInnerRadiusScale = 0.8,
  GlowOuterRadiusScale = 1.4,
  LightOffsetScale = 0.2,
}

enum BackdropAlpha {
  LightLand = 0.9,
  DarkLand = 0.7,
  LightGrid = 0.18,
  DarkGrid = 0.11,
}

enum BackdropStroke {
  FrameWidth = 1.5,
}

enum FlatLabelLayout {
  MinimumPixels = 8,
  ViewportScale = 0.015,
  BottomOffsetPixels = 13,
  SideOffsetPixels = 5,
  BaselineOffsetPixels = 3,
}

enum FlatCoordinateLabel {
  LongitudeStepDegrees = 60,
  LongitudeLimitDegrees = 120,
  LatitudeStepDivisor = 2,
}

const TRANSPARENT_BLACK = "rgba(0,0,0,0)";
const LIGHT_GLOW_ALPHA = "08";
const DARK_GLOW_ALPHA = "0d";
const LIGHT_FRAME_ALPHA = "30";
const DARK_FRAME_ALPHA = "1f";
const LIGHT_FLAT_FRAME_ALPHA = "25";
const DARK_FLAT_FRAME_ALPHA = "1a";
const DARK_GLOBE_OCEAN = "#0e1825";
const DARK_GLOBE_DEEP_OCEAN = "#060c16";
const DARK_FLAT_OCEAN = "#081018";

type PreparedLandRing = Readonly<{
  coordinates: GeoRing;
  projected: Projected[];
  unitVectors: readonly UnitVector[];
}>;

type BackdropFrame = RenderBackdropOptions & Readonly<{
  geometry: CameraProjection;
}>;

function landAlpha(frame: BackdropFrame): number {
  return frame.light ? BackdropAlpha.LightLand : BackdropAlpha.DarkLand;
}

function globeHorizon(geometry: CameraProjection): HorizonCircle {
  return {
    gcx: geometry.centerX,
    gcy: geometry.centerY,
    gr: geometry.globeRadius - SceneProjectionPolicy.HorizonInsetPixels,
  };
}

function createLandRings(polygons: GeoMultiPolygon): PreparedLandRing[] {
  const rings: PreparedLandRing[] = [];
  for (const polygon of polygons) {
    for (const coordinates of polygon) {
      const unitVectors = coordinates.map(([longitude, latitude]) =>
        geographicToUnitVector(latitude, longitude),
      );
      rings.push({
        coordinates,
        unitVectors,
        projected: unitVectors.map(() => ({ x: 0, y: 0, z: 0 })),
      });
    }
  }
  return rings;
}

export class RenderBackdrop {
  private frame: BackdropFrame | null = null;
  private landRings: readonly PreparedLandRing[] = [];

  setLand(polygons: GeoMultiPolygon): void {
    this.landRings = createLandRings(polygons);
  }

  draw(options: RenderBackdropOptions): ProjFn {
    const geometry = createCameraProjection(
      options.camera,
      options.viewport,
      options.flat,
    );
    const frame: BackdropFrame = {
      ...options,
      geometry,
    };
    this.frame = frame;
    if (frame.flat) this.drawFlat(frame);
    else this.drawGlobe(frame);
    return geometry.project;
  }

  drawEdge(): void {
    const frame = this.frame;
    if (!frame) return;
    const geometry = frame.geometry;
    if (geometry.flatMetrics) {
      this.drawFlatEdge(frame, geometry.flatMetrics);
      return;
    }
    const context = frame.context;
    context.beginPath();
    context.arc(
      geometry.centerX,
      geometry.centerY,
      geometry.globeRadius,
      BackdropGeometry.ArcStart,
      BackdropGeometry.ArcEnd,
    );
    context.strokeStyle =
      frame.colors.accent +
      (frame.light ? LIGHT_FRAME_ALPHA : DARK_FRAME_ALPHA);
    context.lineWidth = BackdropStroke.FrameWidth;
    context.stroke();
  }

  projectionFrame(): SceneAreaProjectionFrame | null {
    const frame = this.frame;
    if (!frame) return null;
    const geometry = frame.geometry;
    const metrics = geometry.flatMetrics;
    const camera = frame.camera;
    return {
      width: frame.viewport.width,
      height: frame.viewport.height,
      hitCellSize: CAMERA_POLICY.hitCellSizePx,
      cullMargin: SceneProjectionPolicy.CullMarginPixels,
      zoomLevel: this.zoomLevel(),
      revision: [
        frame.flat ? 1 : 0,
        frame.viewport.width,
        frame.viewport.height,
        camera.rotX,
        camera.rotY,
        camera.zoomGlobe,
        camera.zoomFlat,
        camera.panX,
        camera.panY,
      ].join("|"),
      flat: metrics
        ? {
            centerX: metrics.cx,
            centerY: metrics.cy,
            mapWidth: metrics.mW,
            mapHeight: metrics.mH,
          }
        : null,
      globe: metrics
        ? null
        : {
            matrix: geometry.globeMatrix,
            centerX: geometry.centerX,
            centerY: geometry.centerY,
            radius: geometry.globeRadius,
          },
      areaProjection: {
        project: geometry.project,
        horizon: metrics
          ? null
          : {
              gcx: geometry.centerX,
              gcy: geometry.centerY,
              gr:
                geometry.globeRadius -
                SceneProjectionPolicy.HorizonInsetPixels,
            },
      },
      screenPoint: geometry.screenPoint,
    };
  }

  projector(): ProjFn | null {
    return this.frame?.geometry.project ?? null;
  }

  zoomLevel(): number {
    const frame = this.frame;
    if (!frame) return 1;
    return frame.flat
      ? frame.camera.zoomFlat
      : frame.camera.zoomGlobe;
  }

  private drawFlat(frame: BackdropFrame): void {
    const metrics = frame.geometry.flatMetrics;
    if (!metrics) return;
    const context = frame.context;
    context.fillStyle = frame.colors.oceanDeep || DARK_FLAT_OCEAN;
    context.fillRect(metrics.mx, metrics.my, metrics.mW, metrics.mH);
    context.save();
    context.beginPath();
    context.rect(metrics.mx, metrics.my, metrics.mW, metrics.mH);
    context.clip();
    this.drawLand(frame, {
      gcx: BackdropGeometry.ArcStart,
      gcy: BackdropGeometry.ArcStart,
      gr: BackdropGeometry.ArcStart,
    });
    drawGrid(context, frame.geometry.project, {
      isFlat: true,
      cx: metrics.cx,
      cy: metrics.cy,
      mW: metrics.mW,
      mH: metrics.mH,
      mx: metrics.mx,
      my: metrics.my,
      accentColor: frame.colors.grid || frame.colors.accent,
      gridAlpha: frame.light
        ? BackdropAlpha.LightGrid
        : BackdropAlpha.DarkGrid,
    });
  }

  private drawFlatEdge(frame: BackdropFrame, metrics: FlatMetrics): void {
    const context = frame.context;
    context.strokeStyle =
      frame.colors.accent +
      (frame.light
        ? LIGHT_FLAT_FRAME_ALPHA
        : DARK_FLAT_FRAME_ALPHA);
    context.lineWidth = 1;
    context.strokeRect(metrics.mx, metrics.my, metrics.mW, metrics.mH);
    context.globalAlpha = 1;
    context.fillStyle = frame.colors.dim || frame.colors.accent;
    const fontSize = Math.max(
      FlatLabelLayout.MinimumPixels,
      Math.min(frame.viewport.width, frame.viewport.height) *
        FlatLabelLayout.ViewportScale,
    );
    context.font = `${fontSize}px 'JetBrains Mono', monospace`;
    context.textAlign = "center";
    for (
      let longitude = -FlatCoordinateLabel.LongitudeLimitDegrees;
      longitude <= FlatCoordinateLabel.LongitudeLimitDegrees;
      longitude += FlatCoordinateLabel.LongitudeStepDegrees
    ) {
      context.fillText(
        `${Math.abs(longitude)}°${longitude >= 0 ? "E" : "W"}`,
        metrics.cx +
          (longitude / GeoLimit.MaxLongitude) * (metrics.mW / 2),
        metrics.my + metrics.mH + FlatLabelLayout.BottomOffsetPixels,
      );
    }
    context.textAlign = "right";
    for (
      let latitude = -FlatCoordinateLabel.LongitudeStepDegrees;
      latitude <= FlatCoordinateLabel.LongitudeStepDegrees;
      latitude +=
        FlatCoordinateLabel.LongitudeStepDegrees /
        FlatCoordinateLabel.LatitudeStepDivisor
    ) {
      context.fillText(
        `${Math.abs(latitude)}°${latitude >= 0 ? "N" : "S"}`,
        metrics.mx - FlatLabelLayout.SideOffsetPixels,
        metrics.cy -
          (latitude / GeoLimit.MaxLatitude) * (metrics.mH / 2) +
          FlatLabelLayout.BaselineOffsetPixels,
      );
    }
  }

  private drawGlobe(frame: BackdropFrame): void {
    const context = frame.context;
    const geometry = frame.geometry;
    const radius = geometry.globeRadius;
    const glow = context.createRadialGradient(
      geometry.centerX,
      geometry.centerY,
      radius * BackdropGeometry.GlowInnerRadiusScale,
      geometry.centerX,
      geometry.centerY,
      radius * BackdropGeometry.GlowOuterRadiusScale,
    );
    glow.addColorStop(
      BackdropGeometry.ArcStart,
      frame.colors.accent +
        (frame.light ? LIGHT_GLOW_ALPHA : DARK_GLOW_ALPHA),
    );
    glow.addColorStop(1, TRANSPARENT_BLACK);
    context.fillStyle = glow;
    context.fillRect(
      BackdropGeometry.ArcStart,
      BackdropGeometry.ArcStart,
      frame.viewport.width,
      frame.viewport.height,
    );

    const ocean = context.createRadialGradient(
      geometry.centerX - radius * BackdropGeometry.LightOffsetScale,
      geometry.centerY - radius * BackdropGeometry.LightOffsetScale,
      BackdropGeometry.ArcStart,
      geometry.centerX,
      geometry.centerY,
      radius,
    );
    ocean.addColorStop(
      BackdropGeometry.ArcStart,
      frame.colors.ocean || DARK_GLOBE_OCEAN,
    );
    ocean.addColorStop(1, frame.colors.oceanDeep || DARK_GLOBE_DEEP_OCEAN);
    context.beginPath();
    context.arc(
      geometry.centerX,
      geometry.centerY,
      radius,
      BackdropGeometry.ArcStart,
      BackdropGeometry.ArcEnd,
    );
    context.fillStyle = ocean;
    context.fill();
    context.save();
    context.beginPath();
    context.arc(
      geometry.centerX,
      geometry.centerY,
      radius - SceneProjectionPolicy.HorizonInsetPixels,
      BackdropGeometry.ArcStart,
      BackdropGeometry.ArcEnd,
    );
    context.clip();
    this.drawLand(frame, globeHorizon(geometry));
    drawGrid(context, frame.geometry.project, {
      isFlat: false,
      accentColor: frame.colors.grid || frame.colors.accent,
      gridAlpha: frame.light
        ? BackdropAlpha.LightGrid
        : BackdropAlpha.DarkGrid,
    });
  }

  strokeCoastlines(): void {
    const frame = this.frame;
    if (!frame) return;
    const horizon = globeHorizon(frame.geometry);
    const paths = this.landRings.flatMap((ring) =>
      frame.flat
        ? splitAntimeridianSegments(ring.coordinates, frame.geometry.project)
        : [projectedRingPath(ring.projected, horizon)],
    );
    strokeOutlinePaths(frame.context, paths, {
      color: frame.colors[ThemeColorKey.Bright],
      casing: frame.colors[ThemeColorKey.Background],
    });
  }

  private drawLand(frame: BackdropFrame, horizon: HorizonCircle): void {
    const alpha = landAlpha(frame);
    for (const ring of this.landRings) {
      if (frame.flat) {
        drawFlatLandRing(
          frame.context,
          ring.coordinates,
          frame.geometry.project,
          frame.colors,
          alpha,
        );
        continue;
      }
      for (const [index, unit] of ring.unitVectors.entries()) {
        const point = ring.projected[index];
        if (!point) continue;
        projectUnitVectorInto(
          unit,
          frame.geometry.globeMatrix,
          horizon.gcx,
          horizon.gcy,
          horizon.gr,
          point,
        );
      }
      drawProjectedLandRing(
        frame.context,
        ring.projected,
        frame.colors,
        alpha,
        horizon,
      );
    }
  }

}
