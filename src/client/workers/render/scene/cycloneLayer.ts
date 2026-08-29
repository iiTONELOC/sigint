import {
  drawGenesisMark,
  paintConeSegments,
  paintWindRadiiBands,
  segmentedConeSegments,
  type WindRadiiBand,
} from "@/features/environmental/cyclones/render/cycloneGeometry";
import type { ProjFn } from "@/lib/geo/render/types";
import { strokeGeoPath, strokePoints } from "@/lib/geo/render/path";
import {
  modelColor,
  windColor,
} from "@/features/environmental/cyclones/classification";
import {
  Category,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  type CycloneForecastFact,
  type MinCategory,
} from "@shared/domain/cyclones";
import {
  type SceneHit,
  type SceneProjection,
} from "@/workers/render/scene/projectedLayer";
import {
  RenderLayerOrder,
  ScenePointLayer,
  type SceneLayerProjectionFrame,
} from "@/workers/render/scene/sceneLayer";
import {
  CycloneSceneAttribute,
  CycloneSceneDefault,
  CycloneSceneRole,
  CycloneSceneStringAttribute,
  CycloneSceneText,
  SceneGeometryKind,
} from "@shared/scene";
import {
  sceneNumericAttribute,
  type RenderSceneRecord,
  type RenderSceneView,
} from "@/workers/render/sceneStore";
import {
  DEFAULT_RENDER_CYCLONE_OVERLAY,
  IsolateMode,
  type RenderCycloneOverlay,
  type RenderSelectionIdentity,
} from "@/workers/render/protocol";
import type {
  SceneVisibilitySettings,
} from "@/workers/render/scene/visibility";
import { zoomScale } from "@/workers/render/workerMath";
import { scenePositionFromView } from "@/workers/render/scene/scenePosition";
import { Domain } from "@shared/domain/identity";
import { sceneSchemaMatches } from "@shared/domain/pointSource";
import type { GeoLineString, GeoPoint } from "@shared/geo";
import { GeoMeasurement } from "@shared/geo";
import { CanvasLineStyle } from "@/lib/geo/render/types";
import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";

enum CycloneMarkerGeometry {
  BaseRadius = 2,
  CategoryGain = 1.2,
  SelectedScale = 1.5,
  RingOffset = 3.5,
  PipMinimum = 1,
  PipScale = 0.35,
  GlowScale = 3,
}

enum CycloneMarkerAlpha {
  DepthBase = 0.4,
  DepthGain = 0.6,
  Glow = 0.7,
  Ring = 0.95,
}

const CYCLONE_MARKER_RING_WIDTH = 1.5;
const CYCLONE_MARKER_DEFAULT_ZOOM = 1;

enum CycloneMarkerPulse {
  StaticOffset = 0,
  Base = 1,
  Rate = 1.5,
  Span = 0.15,
}

enum CycloneForecastMarkerGeometry {
  BaseRadius = 2,
  SelectedRadius = 4,
  FadeHours = 144,
}

enum CycloneForecastTrackStyle {
  StrokeWidth = 1.5,
  DashLength = 4,
  DashGap = 3,
  Alpha = 0.7,
}

enum CyclonePastPointStyle {
  Alpha = 0.55,
  Radius = 1.2,
}

enum CycloneGenesisStyle {
  ArmLength = 5,
  StrokeWidth = 2.2,
}

enum CyclonePathStyle {
  ModelStrokeWidth = 1,
  PastStrokeWidth = 1.25,
  PastAlpha = 0.45,
  ModelAlpha = 0.6,
}

enum CycloneWindBandAlpha {
  Gale = 0.12,
  Storm = 0.16,
  Hurricane = 0.2,
}

const CYCLONE_COLOR_WHITE = "#ffffff";

enum CycloneGlowStop {
  Center = 0,
  Middle = 0.5,
  Edge = 1,
}

enum CycloneGlowAlphaFormat {
  HexWidth = 2,
  Radix = 16,
  MaximumByte = 96,
}

const CYCLONE_GLOW_ZERO = "0";
const CYCLONE_VISIBLE_DEPTH_MINIMUM = 0;
const CYCLONE_POSITIVE_DISTANCE_MINIMUM = 0;
const CYCLONE_RECORD_ACTIVE = 1;
const CYCLONE_PATH_POINT_MINIMUM = 2;
const CYCLONE_NORTH_LATITUDE_OFFSET_DEG = 1;

enum CycloneArc {
  StartRadians = 0,
  FullRadians = 6.283185307179586,
}

const CYCLONE_CANVAS_OPAQUE_ALPHA = 1;

export type CycloneSceneFilter = SceneVisibilitySettings &
  Readonly<{
    enabled: boolean;
    minCategory: MinCategory;
    overlays: Readonly<Record<string, RenderCycloneOverlay>>;
  }>;

export type CycloneSceneStyle = Readonly<{
  context: OffscreenCanvasRenderingContext2D;
  project: ProjFn;
  color: string;
  selectedId: string | null;
  time: number;
  reducedMotion: boolean;
}>;

type CycloneRecordSet = Readonly<{
  overlay: RenderCycloneOverlay;
  indices: number[][];
}>;

function cycloneRole(role: number | undefined): CycloneSceneRole | null {
  switch (role) {
    case CycloneSceneRole.Current:
    case CycloneSceneRole.Forecast:
    case CycloneSceneRole.PastPath:
    case CycloneSceneRole.WindRadius:
    case CycloneSceneRole.ModelPath:
      return role;
    default:
      return null;
  }
}

function roleAt(view: RenderSceneView, index: number): CycloneSceneRole | null {
  const role = sceneNumericAttribute(view, index, CycloneSceneAttribute.Role);
  return cycloneRole(role);
}

function cycloneSelectionIdentity(
  role: CycloneSceneRole | null,
  sceneId: string,
  entityId: string,
): RenderSelectionIdentity {
  const forecast = role === CycloneSceneRole.Forecast;
  return {
    source: Domain.Cyclones,
    entityId,
    interactionId: forecast ? sceneId : entityId,
    pointType: forecast ? Domain.CyclonesForecast : Domain.Cyclones,
  };
}

/** The ring animates on time; reduced motion freezes it at its rest radius. */
function ringTime(style: CycloneSceneStyle): number {
  return style.reducedMotion ? 0 : style.time;
}

function stringAttribute(
  view: RenderSceneView,
  index: number,
  attribute: CycloneSceneStringAttribute,
): string {
  const offset = index * view.stringAttributeStride + attribute;
  const dictionaryIndex = view.stringAttributes[offset] ?? 0;
  return dictionaryIndex === 0
    ? CycloneSceneText.Empty
    : (view.dictionary[dictionaryIndex - 1] ?? CycloneSceneText.Empty);
}

function geometryLine(
  view: RenderSceneView,
  index: number,
): GeoLineString | null {
  const geometry = view.geometries[index];
  if (geometry?.kind !== SceneGeometryKind.Polyline) return null;
  return geometry.groups[0]?.[0] ?? null;
}

function projectVisibleLine(
  line: GeoLineString,
  project: ProjFn,
): readonly (readonly [number, number])[] {
  const projected: (readonly [number, number])[] = [];
  for (const [longitude, latitude] of line) {
    const point = project(latitude, longitude);
    if (point.z > 0) projected.push([point.x, point.y]);
  }
  return projected;
}

function windBandAlpha(threshold: number): number | null {
  switch (threshold) {
    case CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt:
      return CycloneWindBandAlpha.Gale;
    case CYCLONE_STRONG_WIND_RADIUS_KT:
      return CycloneWindBandAlpha.Storm;
    case CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt:
      return CycloneWindBandAlpha.Hurricane;
    default:
      return null;
  }
}

function windRadiusQuadrants(view: RenderSceneView, index: number): number[] {
  return [
    CycloneSceneAttribute.WindRadiusNe,
    CycloneSceneAttribute.WindRadiusSe,
    CycloneSceneAttribute.WindRadiusSw,
    CycloneSceneAttribute.WindRadiusNw,
  ].map((attribute) => sceneNumericAttribute(view, index, attribute));
}

function glowAlphaSuffix(stop: CycloneGlowStop): string {
  return Math.round(
    CycloneGlowAlphaFormat.MaximumByte * (1 - stop),
  )
    .toString(CycloneGlowAlphaFormat.Radix)
    .padStart(CycloneGlowAlphaFormat.HexWidth, CYCLONE_GLOW_ZERO);
}

function baseRecordIsVisible(
  view: RenderSceneView,
  index: number,
  role: CycloneSceneRole,
  filter: CycloneSceneFilter,
): boolean {
  if (!filter.enabled) return false;
  const entityId = view.entityIds[index] ?? null;
  const sceneId = view.sceneIds[index] ?? null;
  if (!entityId || !sceneId) return false;
  if (
    filter.isolateMode === IsolateMode.Solo &&
    entityId !== filter.isolatedId &&
    sceneId !== filter.isolatedId
  ) return false;
  if (
    filter.isolateMode === IsolateMode.Focus &&
    filter.isolatedType &&
    filter.isolatedType !== (
      role === CycloneSceneRole.Forecast
        ? Domain.CyclonesForecast
        : Domain.Cyclones
    )
  ) return false;
  return sceneNumericAttribute(
      view,
      index,
      CycloneSceneAttribute.SaffirSimpson,
    ) >= filter.minCategory;
}

export class CycloneLayer extends ScenePointLayer<
  CycloneSceneFilter,
  CycloneSceneStyle
> {
  readonly order = RenderLayerOrder.Cyclones;

  private recordSets = new Map<string, CycloneRecordSet>();

  constructor() {
    super(Domain.Cyclones);
  }

  override project(
    frame: SceneLayerProjectionFrame,
    filter: CycloneSceneFilter,
  ): void {
    const view = this.beginProject();
    this.recordSets = new Map();
    for (const [index, active] of view.active.entries()) {
      if (active !== CYCLONE_RECORD_ACTIVE) continue;
      const role = roleAt(view, index);
      if (
        role === null ||
        !this.recordIncludes(view, index, filter)
      ) {
        continue;
      }
      const entityId = view.entityIds[index] ?? null;
      if (!entityId) continue;
      let records = this.recordSets.get(entityId);
      if (!records) {
        records = {
          overlay: filter.overlays[entityId] ??
            DEFAULT_RENDER_CYCLONE_OVERLAY,
          indices: [],
        };
        this.recordSets.set(entityId, records);
      }
      records.indices[role] ??= [];
      records.indices[role].push(index);
    }
    this.projection.project(view, {
      ...frame,
      includes: (index) => {
        const role = roleAt(view, index);
        const entityId = view.entityIds[index] ?? null;
        return (
          this.recordIncludes(view, index, filter) &&
          (role === CycloneSceneRole.Current ||
            (role === CycloneSceneRole.Forecast &&
              entityId !== null &&
              this.recordSets.get(entityId)?.overlay.showForecast === true))
        );
      },
    });
  }

  override draw(style: CycloneSceneStyle): void {
    const view = this.view;
    if (!view) return;
    super.draw(style);
    for (const records of this.recordSets.values()) {
      const current = records.indices[CycloneSceneRole.Current]?.[0];
      if (current === undefined) continue;
      const projection = this.projection.projection(current);
      if (!projection) continue;
      this.drawCurrent(view, records, projection, style);
    }
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  /** Forecast points anchor by scene id; the base layer matches entity ids only. */
  override selectionAnchor(id: string): SceneProjection | null {
    const view = this.view;
    if (!view) return null;
    for (const index of this.projection.visibleIndices()) {
      if (
        (view.sceneIds[index] ?? null) === id ||
        (view.entityIds[index] ?? null) === id
      ) {
        return this.projection.projection(index);
      }
    }
    return null;
  }

  override interactionIdentity(hit: SceneHit): RenderSelectionIdentity {
    const view = this.view;
    const role = view ? roleAt(view, hit.handle - 1) : null;
    return cycloneSelectionIdentity(role, hit.sceneId, hit.entityId);
  }

  override hasTimeAnimation(reducedMotion: boolean): boolean {
    return !reducedMotion && this.recordSets.size > 0;
  }

  protected override recordSelectionIdentity(
    record: RenderSceneRecord,
  ): RenderSelectionIdentity {
    return cycloneSelectionIdentity(
      cycloneRole(record.attributes[CycloneSceneAttribute.Role]),
      record.sceneId,
      record.entityId,
    );
  }

  protected includes(
    view: RenderSceneView,
    index: number,
    filter: CycloneSceneFilter,
  ): boolean {
    if (!sceneSchemaMatches(
      Domain.Cyclones,
      view.attributeStride,
      view.stringAttributeStride,
    )) {
      return false;
    }
    const role = roleAt(view, index);
    return role !== null && baseRecordIsVisible(view, index, role, filter);
  }

  /** Per visible record: forecast points draw as faded dots; current eyes draw in `draw`. */
  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: CycloneSceneStyle,
  ): void {
    if (roleAt(view, index) !== CycloneSceneRole.Forecast) return;
    const projection = this.projection.projection(index);
    const sceneId = view.sceneIds[index] ?? null;
    if (!projection || !sceneId) return;
    const forecastHour = sceneNumericAttribute(
      view,
      index,
      CycloneSceneAttribute.ForecastHour,
    );
    const fade =
      1 -
      Math.min(
        1,
        Math.max(0, forecastHour) /
          CycloneForecastMarkerGeometry.FadeHours,
      );
    const selected = sceneId === style.selectedId;
    const radius = selected
      ? CycloneForecastMarkerGeometry.SelectedRadius
      : CycloneForecastMarkerGeometry.BaseRadius;
    style.context.fillStyle = style.color;
    style.context.globalAlpha =
      (CycloneMarkerAlpha.DepthBase +
        projection.depth * CycloneMarkerAlpha.DepthGain) *
      fade;
    style.context.beginPath();
    style.context.arc(
      projection.x,
      projection.y,
      radius,
      CycloneArc.StartRadians,
      CycloneArc.FullRadians,
    );
    style.context.fill();
    if (selected) {
      drawSelectionRing(
        style.context, projection.x, projection.y, radius, style.color, ringTime(style),
      );
    }
  }

  private drawCurrent(
    view: RenderSceneView,
    records: CycloneRecordSet,
    projection: SceneProjection,
    style: CycloneSceneStyle,
  ): void {
    const current = records.indices[CycloneSceneRole.Current]?.[0];
    if (current === undefined) return;
    const entityId = view.entityIds[current] ?? null;
    if (!entityId) return;
    const maxWindKt = sceneNumericAttribute(
      view,
      current,
      CycloneSceneAttribute.MaxWindKt,
    );
    const category = sceneNumericAttribute(
      view,
      current,
      CycloneSceneAttribute.SaffirSimpson,
    );
    const color = windColor(maxWindKt);
    const selected = entityId === style.selectedId;
    const baseRadius =
      CycloneMarkerGeometry.BaseRadius +
      category * CycloneMarkerGeometry.CategoryGain;
    let radius =
      baseRadius * zoomScale(CYCLONE_MARKER_DEFAULT_ZOOM);
    if (selected) radius *= CycloneMarkerGeometry.SelectedScale;
    const depthAlpha =
      CycloneMarkerAlpha.DepthBase +
      projection.depth * CycloneMarkerAlpha.DepthGain;

    this.drawGlow(style, projection, radius, color, depthAlpha);
    if (records.overlay.showModels) {
      this.drawModels(view, records, style, depthAlpha);
    }
    if (records.overlay.showForecast) {
      this.drawPastPath(view, records, style, color, depthAlpha);
    }
    this.drawEye(style.context, projection, radius, color, depthAlpha);
    this.drawForecast(
      view,
      records,
      projection,
      style,
      color,
      depthAlpha,
      maxWindKt,
    );
    if (records.overlay.showWindField) {
      this.drawWindRadii(
        view,
        records,
        current,
        projection,
        style,
        depthAlpha,
      );
    }
    if (selected) {
      drawSelectionRing(
        style.context, projection.x, projection.y, radius, color, ringTime(style),
      );
    }
  }

  private drawGlow(
    style: CycloneSceneStyle,
    projection: SceneProjection,
    radius: number,
    color: string,
    depthAlpha: number,
  ): void {
    const pulse =
      CycloneMarkerPulse.Base +
      (style.reducedMotion
        ? CycloneMarkerPulse.StaticOffset
        : Math.sin(style.time * CycloneMarkerPulse.Rate) *
          CycloneMarkerPulse.Span);
    const glowRadius =
      radius * CycloneMarkerGeometry.GlowScale * pulse;
    const gradient = style.context.createRadialGradient(
      projection.x,
      projection.y,
      CycloneGlowStop.Center,
      projection.x,
      projection.y,
      glowRadius,
    );
    gradient.addColorStop(
      CycloneGlowStop.Center,
      color + glowAlphaSuffix(CycloneGlowStop.Center),
    );
    gradient.addColorStop(
      CycloneGlowStop.Middle,
      color + glowAlphaSuffix(CycloneGlowStop.Middle),
    );
    gradient.addColorStop(
      CycloneGlowStop.Edge,
      color + glowAlphaSuffix(CycloneGlowStop.Edge),
    );
    style.context.fillStyle = gradient;
    style.context.globalAlpha = depthAlpha * CycloneMarkerAlpha.Glow;
    style.context.beginPath();
    style.context.arc(
      projection.x,
      projection.y,
      glowRadius,
      CycloneArc.StartRadians,
      CycloneArc.FullRadians,
    );
    style.context.fill();
  }

  private drawEye(
    context: OffscreenCanvasRenderingContext2D,
    projection: SceneProjection,
    radius: number,
    color: string,
    depthAlpha: number,
  ): void {
    context.fillStyle = color;
    context.globalAlpha = depthAlpha;
    context.beginPath();
    context.arc(
      projection.x,
      projection.y,
      radius,
      CycloneArc.StartRadians,
      CycloneArc.FullRadians,
    );
    context.fill();

    context.strokeStyle = color;
    context.globalAlpha = depthAlpha * CycloneMarkerAlpha.Ring;
    context.lineWidth = CYCLONE_MARKER_RING_WIDTH;
    context.beginPath();
    context.arc(
      projection.x,
      projection.y,
      radius + CycloneMarkerGeometry.RingOffset,
      CycloneArc.StartRadians,
      CycloneArc.FullRadians,
    );
    context.stroke();

    context.fillStyle = CYCLONE_COLOR_WHITE;
    context.globalAlpha = depthAlpha;
    context.beginPath();
    context.arc(
      projection.x,
      projection.y,
      Math.max(
        CycloneMarkerGeometry.PipMinimum,
        radius * CycloneMarkerGeometry.PipScale,
      ),
      CycloneArc.StartRadians,
      CycloneArc.FullRadians,
    );
    context.fill();
  }

  private drawModels(
    view: RenderSceneView,
    records: CycloneRecordSet,
    style: CycloneSceneStyle,
    depthAlpha: number,
  ): void {
    style.context.lineCap = CanvasLineStyle.Round;
    style.context.lineJoin = CanvasLineStyle.Round;
    style.context.lineWidth = CyclonePathStyle.ModelStrokeWidth;
    style.context.globalAlpha = depthAlpha * CyclonePathStyle.ModelAlpha;
    for (const index of records.indices[CycloneSceneRole.ModelPath] ?? []) {
      const line = geometryLine(view, index);
      if (!line) continue;
      const modelCode = stringAttribute(
        view,
        index,
        CycloneSceneStringAttribute.ModelCode,
      );
      if (records.overlay.hiddenModels.includes(modelCode)) continue;
      style.context.strokeStyle = modelColor(modelCode);
      strokeGeoPath(style.context, style.project, line);
    }
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private drawPastPath(
    view: RenderSceneView,
    records: CycloneRecordSet,
    style: CycloneSceneStyle,
    color: string,
    depthAlpha: number,
  ): void {
    const index = records.indices[CycloneSceneRole.PastPath]?.[0];
    if (index === undefined) return;
    const line = geometryLine(view, index);
    if (!line) return;
    const points = projectVisibleLine(line, style.project);
    if (points.length < CYCLONE_PATH_POINT_MINIMUM) return;

    style.context.strokeStyle = color;
    style.context.lineWidth = CyclonePathStyle.PastStrokeWidth;
    style.context.globalAlpha = depthAlpha * CyclonePathStyle.PastAlpha;
    strokePoints(style.context, points);

    style.context.fillStyle = color;
    style.context.globalAlpha = depthAlpha * CyclonePastPointStyle.Alpha;
    for (const [x, y] of points.slice(1, -1)) {
      style.context.beginPath();
      style.context.arc(
        x,
        y,
        CyclonePastPointStyle.Radius,
        CycloneArc.StartRadians,
        CycloneArc.FullRadians,
      );
      style.context.fill();
    }

    const genesis = points[0];
    if (!genesis) return;
    style.context.strokeStyle = color;
    style.context.lineWidth = CycloneGenesisStyle.StrokeWidth;
    style.context.globalAlpha = depthAlpha;
    drawGenesisMark(style.context, genesis[0], genesis[1], CycloneGenesisStyle.ArmLength);
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private drawForecast(
    view: RenderSceneView,
    records: CycloneRecordSet,
    eye: SceneProjection,
    style: CycloneSceneStyle,
    color: string,
    depthAlpha: number,
    eyeWindKt: number,
  ): void {
    if (!records.overlay.showForecast && !records.overlay.showCone) return;
    const indices = records.indices[CycloneSceneRole.Forecast] ?? [];
    if (indices.length === 0) return;
    const forecasts = indices
      .map((index) => this.forecastFact(view, index))
      .filter((fact): fact is CycloneForecastFact => fact !== null)
      .sort((left, right) => left.fcstHour - right.fcstHour);
    if (forecasts.length === 0) return;

    if (records.overlay.showCone) this.drawCone(
      style,
      eye,
      forecasts,
      color,
      depthAlpha,
      eyeWindKt,
    );
    const currentIndex = records.indices[CycloneSceneRole.Current]?.[0];
    if (!records.overlay.showForecast || currentIndex === undefined) return;
    const current = scenePositionFromView(view, currentIndex);
    if (!current) return;
    const line: GeoLineString = [
      [current.longitude, current.latitude],
      ...forecasts.map<GeoPoint>((fact) => [fact.lon, fact.lat]),
    ];
    const points = projectVisibleLine(line, style.project);
    if (points.length < CYCLONE_PATH_POINT_MINIMUM) return;
    style.context.strokeStyle = color;
    style.context.lineWidth = CycloneForecastTrackStyle.StrokeWidth;
    style.context.setLineDash([
      CycloneForecastTrackStyle.DashLength,
      CycloneForecastTrackStyle.DashGap,
    ]);
    style.context.globalAlpha =
      depthAlpha * CycloneForecastTrackStyle.Alpha;
    strokePoints(style.context, points);
    style.context.setLineDash([]);
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private drawCone(
    style: CycloneSceneStyle,
    eye: SceneProjection,
    forecasts: readonly CycloneForecastFact[],
    color: string,
    depthAlpha: number,
    eyeWindKt: number,
  ): void {
    paintConeSegments(
      style.context,
      segmentedConeSegments(eye.x, eye.y, forecasts, style.project, eyeWindKt),
      { depthAlpha, fallbackColor: color, rims: true },
    );
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private drawWindRadii(
    view: RenderSceneView,
    records: CycloneRecordSet,
    current: number,
    eye: SceneProjection,
    style: CycloneSceneStyle,
    depthAlpha: number,
  ): void {
    const position = scenePositionFromView(view, current);
    if (!position) return;
    const north = style.project(
      position.latitude + CYCLONE_NORTH_LATITUDE_OFFSET_DEG,
      position.longitude,
    );
    if (north.z <= CYCLONE_VISIBLE_DEPTH_MINIMUM) return;
    const pixelsPerNm =
      Math.hypot(north.x - eye.x, north.y - eye.y) /
      GeoMeasurement.NauticalMilesPerDegree;
    if (pixelsPerNm <= CYCLONE_POSITIVE_DISTANCE_MINIMUM) return;

    const bands = (records.indices[CycloneSceneRole.WindRadius] ?? [])
      .flatMap((index): WindRadiiBand[] => {
        const threshold = sceneNumericAttribute(
          view,
          index,
          CycloneSceneAttribute.WindThresholdKt,
        );
        const alpha = windBandAlpha(threshold);
        if (alpha === null) return [];
        return [{
          threshold,
          quadrants: windRadiusQuadrants(view, index),
          fillAlpha: depthAlpha * alpha,
        }];
      });
    paintWindRadiiBands(style.context, { x: eye.x, y: eye.y, pixelsPerNm }, bands);
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private forecastFact(
    view: RenderSceneView,
    index: number,
  ): CycloneForecastFact | null {
    const position = scenePositionFromView(view, index);
    if (!position) return null;
    return {
      lat: position.latitude,
      lon: position.longitude,
      fcstHour: sceneNumericAttribute(
        view,
        index,
        CycloneSceneAttribute.ForecastHour,
      ),
      errorRadiusNm: sceneNumericAttribute(
        view,
        index,
        CycloneSceneAttribute.ErrorRadiusNm,
      ),
      maxWindKt: sceneNumericAttribute(
        view,
        index,
        CycloneSceneAttribute.MaxWindKt,
      ),
    };
  }
}
