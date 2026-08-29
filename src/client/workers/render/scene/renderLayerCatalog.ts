import type { RenderWorkerColors } from "@shared/domain/theme";
import { ThemeColorKey } from "@shared/domain/theme";
import { Domain } from "@shared/domain/identity";
import type { RenderSourceId } from "@shared/source";
import { GeoLimit, type GeoMultiPolygon, type GeoRing } from "@shared/geo";
import type { FlatMetrics } from "@/lib/geo/render/flatMap";
import { drawGrid } from "@/lib/geo/render/grid";
import { drawFlatLandRing, drawProjectedLandRing } from "@/lib/geo/render/land";
import type { HorizonCircle, Projected, ProjFn } from "@/lib/geo/render/types";
import {
  geographicToUnitVector,
  projectUnitVectorInto,
  type UnitVector,
} from "@/lib/geo/unitSphere";
import { createCameraProjection, type CameraProjection } from "@/workers/render/camera";
import type { MarkerVisualRenderer } from "@/workers/render/primitives/markerVisuals";
import {
  type RenderGlobeStateSnapshot,
  type RenderCamera,
  type RenderSelectionIdentity,
  type RenderViewportPayload,
} from "@/workers/render/protocol";
import { CAMERA_POLICY } from "@/workers/render/policy";
import { AircraftLayer } from "@/workers/render/scene/aircraftLayer";
import type { SceneAreaProjectionFrame } from "@/workers/render/scene/areaLayer";
import { CycloneLayer } from "@/workers/render/scene/cycloneLayer";
import {
  CycloneWarningLayer,
  type CycloneWarningSceneStyle,
} from "@/workers/render/scene/cycloneWarningLayer";
import type {
  SceneHit,
  SceneHitKind,
  SceneProjection,
} from "@/workers/render/scene/projectedLayer";
import {
  PulsingPointLayer,
  type RenderLayer,
  type RenderLayerSelectionTarget,
} from "@/workers/render/scene/sceneLayer";
import { ShipLayer } from "@/workers/render/scene/shipLayer";
import type {
  EnabledSceneFilter,
  SceneVisibilitySettings,
} from "@/workers/render/scene/visibility";
import { WeatherLayer } from "@/workers/render/scene/weatherLayer";
import type { SceneLayerCommand } from "@/workers/render/sceneProtocol";

export enum RenderLayerCatalogErrorKind {
  DuplicateSource = "The render layer source is already registered",
}

export class RenderLayerCatalogError extends Error {
  readonly kind: RenderLayerCatalogErrorKind;
  readonly source: RenderSourceId;

  constructor(
    kind: RenderLayerCatalogErrorKind,
    source: RenderSourceId,
  ) {
    super(kind);
    this.name = RenderLayerCatalogError.name;
    this.kind = kind;
    this.source = source;
  }
}

export type RenderLayerHit = Readonly<{
  hit: SceneHit;
  identity: RenderSelectionIdentity;
}>;

export type RenderLayerProjectOptions = Readonly<{
  globeState: RenderGlobeStateSnapshot;
  selection: RenderSelectionIdentity | null;
  time: number;
}>;

export type RenderLayerProjectedFrame = Readonly<{
  aircraftEntityIsVisible: (entityId: string) => boolean;
  isolatedType: RenderSelectionIdentity["pointType"] | null;
}>;

export type RenderLayerAreaOptions = CycloneWarningSceneStyle;

export type RenderLayerDrawOptions = Readonly<{
  colors: RenderWorkerColors;
  context: OffscreenCanvasRenderingContext2D;
  reducedMotion: boolean;
  selectedId: string | null;
  time: number;
  wallTime: number;
}>;

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

class RenderBackdrop {
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
    return {
      width: frame.viewport.width,
      height: frame.viewport.height,
      hitCellSize: CAMERA_POLICY.hitCellSizePx,
      cullMargin: SceneProjectionPolicy.CullMarginPixels,
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
    const horizon = {
      gcx: geometry.centerX,
      gcy: geometry.centerY,
      gr: radius - SceneProjectionPolicy.HorizonInsetPixels,
    };
    this.drawLand(frame, horizon);
    drawGrid(context, frame.geometry.project, {
      isFlat: false,
      accentColor: frame.colors.grid || frame.colors.accent,
      gridAlpha: frame.light
        ? BackdropAlpha.LightGrid
        : BackdropAlpha.DarkGrid,
    });
  }

  private drawLand(frame: BackdropFrame, horizon: HorizonCircle): void {
    const alpha = frame.light
      ? BackdropAlpha.LightLand
      : BackdropAlpha.DarkLand;
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

function createRenderSceneLayers(visuals: MarkerVisualRenderer) {
  return {
    [Domain.Aircraft]: new AircraftLayer(),
    [Domain.Ships]: new ShipLayer(),
    [Domain.Fire]: new PulsingPointLayer(Domain.Fire, visuals),
    [Domain.Events]: new PulsingPointLayer(Domain.Events, visuals),
    [Domain.Earthquake]: new PulsingPointLayer(
      Domain.Earthquake,
      visuals,
    ),
    [Domain.CycloneWarnings]: new CycloneWarningLayer(),
    [Domain.Weather]: new WeatherLayer(visuals),
    [Domain.Cyclones]: new CycloneLayer(),
  } satisfies Readonly<Partial<Record<RenderSourceId, RenderLayer>>>;
}

type RenderSceneLayers = ReturnType<typeof createRenderSceneLayers>;

function enabledFilter(
  enabled: boolean,
  visibility: SceneVisibilitySettings,
): EnabledSceneFilter {
  return { enabled, ...visibility };
}

export class RenderLayerCatalog {
  private readonly backdrop = new RenderBackdrop();
  private readonly bySource: Partial<Record<RenderSourceId, RenderLayer>> = {};
  private readonly sceneLayers: RenderSceneLayers | null = null;

  constructor(visuals?: MarkerVisualRenderer) {
    if (!visuals) return;
    const layers = createRenderSceneLayers(visuals);
    Object.assign(this.bySource, layers);
    this.sceneLayers = layers;
  }

  register(layer: RenderLayer): void {
    if (this.bySource[layer.source]) {
      throw new RenderLayerCatalogError(
        RenderLayerCatalogErrorKind.DuplicateSource,
        layer.source,
      );
    }
    this.bySource[layer.source] = layer;
  }

  apply(command: SceneLayerCommand): boolean {
    const layer = this.bySource[command.source];
    if (!layer) return false;
    layer.apply(command);
    return true;
  }

  setLand(polygons: GeoMultiPolygon): void {
    this.backdrop.setLand(polygons);
  }

  drawBackdrop(options: RenderBackdropOptions): ProjFn {
    return this.backdrop.draw(options);
  }

  drawFrameEdge(): void {
    this.backdrop.drawEdge();
  }

  project(options: RenderLayerProjectOptions): RenderLayerProjectedFrame {
    const layers = this.sceneLayers;
    const frame = this.backdrop.projectionFrame();
    if (!layers || !frame) {
      return {
        aircraftEntityIsVisible: () => false,
        isolatedType: null,
      };
    }
    const state = options.globeState;
    const isolateMode = state.isolateMode;
    const isolatedId = isolateMode === null
      ? null
      : options.selection?.interactionId ?? null;
    const isolatedType =
      isolatedId && options.selection?.interactionId === isolatedId
        ? options.selection.pointType
        : null;
    const visibility: SceneVisibilitySettings = {
      isolateMode,
      isolatedId,
      isolatedType,
    };
    const aircraftFilter = {
      filter: state.aircraftFilter,
      ...visibility,
    };

    layers[Domain.Aircraft].project(
      frame,
      aircraftFilter,
      options.time,
    );
    layers[Domain.Ships].project(
      frame,
      enabledFilter(state.layers[Domain.Ships], visibility),
      options.time,
    );
    layers[Domain.Fire].project(
      frame,
      enabledFilter(state.layers[Domain.Fires], visibility),
    );
    layers[Domain.Events].project(
      frame,
      enabledFilter(state.layers[Domain.Events], visibility),
    );
    layers[Domain.Earthquake].project(
      frame,
      enabledFilter(state.layers[Domain.Quakes], visibility),
    );
    layers[Domain.CycloneWarnings].project(
      frame,
      enabledFilter(state.cycloneFilter.showWarnings, visibility),
    );
    layers[Domain.Weather].project(
      frame,
      enabledFilter(state.layers[Domain.Weather], visibility),
    );
    layers[Domain.Cyclones].project(frame, {
      enabled: state.layers[Domain.Cyclones],
      minCategory: state.cycloneFilter.minimumCategory,
      overlays: state.cycloneFilter.overlays,
      ...visibility,
    });

    return {
      isolatedType,
      aircraftEntityIsVisible: (entityId) =>
        layers[Domain.Aircraft].includesEntity(
          entityId,
          aircraftFilter,
        ),
    };
  }

  drawAreas(options: RenderLayerAreaOptions): void {
    const layers = this.sceneLayers;
    if (!layers) return;
    layers[Domain.CycloneWarnings].drawAreas(options);
    layers[Domain.Weather].drawAreas(options);
  }

  draw(options: RenderLayerDrawOptions): void {
    const layers = this.sceneLayers;
    const project = this.backdrop.projector();
    if (!layers || !project) return;
    const selectedId = options.selectedId;
    const markerStyle = {
      context: options.context,
      selectedId,
      time: options.time,
      zoomLevel: this.backdrop.zoomLevel(),
    };
    layers[Domain.Aircraft].draw({
      ...markerStyle,
      baseColor: options.colors[ThemeColorKey.Aircraft],
      emergencyColor: options.colors[ThemeColorKey.AircraftEmergency],
      hijackColor: options.colors[ThemeColorKey.AircraftHijack],
      militaryColor: options.colors[ThemeColorKey.Military],
      radioFailureColor:
        options.colors[ThemeColorKey.AircraftRadioFailure],
      reconColor: options.colors[ThemeColorKey.Recon],
    });
    layers[Domain.Ships].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Ships],
    });
    layers[Domain.Fire].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Fires],
      now: options.wallTime,
    });
    layers[Domain.Events].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Events],
      now: options.wallTime,
    });
    layers[Domain.Earthquake].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Quakes],
      now: options.wallTime,
    });
    layers[Domain.Weather].draw({
      ...markerStyle,
      color: options.colors[ThemeColorKey.Weather],
    });
    layers[Domain.Cyclones].draw({
      color: options.colors[ThemeColorKey.Cyclones],
      context: options.context,
      project,
      reducedMotion: options.reducedMotion,
      selectedId,
      time: options.time,
    });
  }

  nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): RenderLayerHit | null {
    let closest: RenderLayerHit | null = null;
    for (const layer of this.orderedLayers()) {
      const hit = layer.nearest(
        kind,
        x,
        y,
        radius,
        maximumCandidates,
      );
      if (
        hit &&
        (!closest || hit.distance <= closest.hit.distance)
      ) {
        closest = {
          hit,
          identity: layer.interactionIdentity(hit),
        };
      }
    }
    return closest;
  }

  selectionAnchor(
    source: RenderSourceId,
    entityId: string,
  ): SceneProjection | null {
    return this.bySource[source]?.selectionAnchor(entityId) ?? null;
  }

  searchIncludesEntity(
    source: RenderSourceId,
    entityId: string,
  ): boolean {
    return this.bySource[source]?.searchIncludesEntity(entityId) ?? false;
  }

  selectionTarget(
    source: RenderSourceId,
    id: string,
    time: number,
  ): RenderLayerSelectionTarget | null {
    return this.bySource[source]?.selectionTarget(id, time) ?? null;
  }

  hasFrameMotion(): boolean {
    return this.orderedLayers().some((layer) => layer.hasFrameMotion());
  }

  hasTimeAnimation(reducedMotion: boolean): boolean {
    return this.orderedLayers().some((layer) =>
      layer.hasTimeAnimation(reducedMotion),
    );
  }

  private orderedLayers(): RenderLayer[] {
    return Object.values(this.bySource).sort(
      (left, right) => left.order - right.order,
    );
  }
}
