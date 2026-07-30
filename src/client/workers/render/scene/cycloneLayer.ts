import {
  segmentedConeSegments,
  windRadiiBandPoints,
  type Ctx,
  type ProjFn,
} from "@/features/environmental/cyclones/render/cycloneGeometry";
import {
  modelColor,
  windColor,
  windRadiiBandColor,
} from "@/features/environmental/cyclones/classification";
import type { MinCategory } from "@/features/environmental/cyclones/types";
import {
  ProjectedSceneLayer,
  SceneHitKind,
  type SceneHit,
  type SceneProjection,
} from "@/workers/render/scene/projectedLayer";
import {
  RenderLayerOrder,
  SceneLayer,
  type SceneLayerProjectionFrame,
} from "@/workers/render/scene/sceneLayer";
import {
  CycloneSceneAttribute,
  CycloneSceneDefault,
  CycloneSceneRole,
  CycloneSceneSchema,
  CycloneSceneStringAttribute,
  CycloneSceneText,
  CycloneWindThreshold,
} from "@/workers/render/scene/cycloneSchema";
import { SceneGeometryKind } from "@/workers/render/sceneProtocol";
import {
  sceneNumericAttribute,
  type RenderSceneRecord,
  type RenderSceneView,
} from "@/workers/render/sceneStore";
import {
  IsolateMode,
  type RenderSelectionIdentity,
} from "@/workers/render/protocol";
import type {
  SceneVisibilitySettings,
} from "@/workers/render/scene/visibility";
import { zoomScale } from "@/workers/render/workerMath";
import { Domain } from "@shared/domain/identity";
import type { GeoLineString } from "@shared/geo";
import { GeoMeasurement } from "@shared/geo";
import { CanvasLineStyle } from "@/lib/geo/render/types";

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

enum CycloneMarkerStroke {
  RingWidth = 1.5,
}

enum CycloneMarkerZoom {
  Default = 1,
}

enum CycloneMarkerPulse {
  StaticOffset = 0,
  Base = 1,
  Rate = 1.5,
  Span = 0.15,
}

enum CycloneSelectionGeometry {
  RadiusScale = 2.5,
  StrokeWidth = 1.5,
}

enum CycloneSelectionAlpha {
  Ring = 0.85,
}

enum CycloneSelectionMotionRate {
  Radians = 2,
}

enum CycloneSelectionMotionSpan {
  StaticPixels = 0,
  Pixels = 2,
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

enum CycloneConeFill {
  BaseAlpha = 0.3,
  FadeSpan = 0.18,
}

enum CycloneConeStroke {
  DividerStrokeWidth = 1,
  RimStrokeWidth = 1.25,
  DividerFadeSpan = 0.3,
  RimFadeSpan = 0.35,
  DividerBaseAlpha = 0.5,
  RimBaseAlpha = 0.6,
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

enum CycloneColor {
  White = "#ffffff",
}

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

enum CycloneGlowText {
  Zero = "0",
}

enum CycloneNormalizedProgress {
  Minimum = 0,
  Maximum = 1,
}

enum CycloneProjectionDepth {
  VisibleMinimum = 0,
}

enum CycloneDistance {
  PositiveMinimum = 0,
}

enum CycloneRecordState {
  Active = 1,
}

enum CyclonePathPointCount {
  Minimum = 2,
}

enum CyclonePositionComponentCount {
  Pair = 2,
}

enum CyclonePositionOffset {
  Longitude = 0,
  Latitude = 1,
}

enum CycloneLatitudeOffset {
  NorthDegree = 1,
}

enum CycloneArc {
  StartRadians = 0,
  FullRadians = 6.283185307179586,
}

enum CycloneCanvasAlpha {
  Opaque = 1,
}

export type CycloneSceneFilter = SceneVisibilitySettings &
  Readonly<{
    enabled: boolean;
    minCategory: MinCategory;
    showForecast: boolean;
    showWindField: boolean;
    showModels: boolean;
    hiddenModels: ReadonlySet<string>;
  }>;

export type CycloneSceneStyle = Readonly<{
  context: Ctx;
  project: ProjFn;
  color: string;
  selectedId: string | null;
  time: number;
  reducedMotion: boolean;
  showCone: boolean;
}>;

type ForecastFact = Readonly<{
  lat: number;
  lon: number;
  fcstHour: number;
  errorRadiusNm: number;
  maxWindKt: number;
}>;

class CycloneRecordSet {
  current: number | null = null;
  readonly forecasts: number[] = [];
  forecastPath: number | null = null;
  pastPath: number | null = null;
  readonly windRadii: number[] = [];
  readonly modelPaths: number[] = [];

  add(index: number, role: CycloneSceneRole): void {
    switch (role) {
      case CycloneSceneRole.Current:
        this.current = index;
        return;
      case CycloneSceneRole.Forecast:
        this.forecasts.push(index);
        return;
      case CycloneSceneRole.ForecastPath:
        this.forecastPath = index;
        return;
      case CycloneSceneRole.PastPath:
        this.pastPath = index;
        return;
      case CycloneSceneRole.WindRadius:
        this.windRadii.push(index);
        return;
      case CycloneSceneRole.ModelPath:
        this.modelPaths.push(index);
        return;
    }
  }
}

function cycloneRole(
  role: number | undefined,
): CycloneSceneRole | null {
  switch (role) {
    case CycloneSceneRole.Current:
    case CycloneSceneRole.Forecast:
    case CycloneSceneRole.ForecastPath:
    case CycloneSceneRole.PastPath:
    case CycloneSceneRole.WindRadius:
    case CycloneSceneRole.ModelPath:
      return role;
    default:
      return null;
  }
}

function roleAt(view: RenderSceneView, index: number): CycloneSceneRole | null {
  return cycloneRole(
    sceneNumericAttribute(
      view,
      index,
      CycloneSceneAttribute.Role,
    ),
  );
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
    pointType: forecast
      ? Domain.CyclonesForecast
      : Domain.Cyclones,
  };
}

function sceneIdAt(view: RenderSceneView, index: number): string | null {
  return view.sceneIds[index] ?? null;
}

function entityIdAt(view: RenderSceneView, index: number): string | null {
  return view.entityIds[index] ?? null;
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

function positionAt(
  view: RenderSceneView,
  index: number,
): Readonly<{ lat: number; lon: number }> | null {
  const positionOffset =
    index * CyclonePositionComponentCount.Pair;
  const lon =
    view.positions[positionOffset + CyclonePositionOffset.Longitude];
  const lat =
    view.positions[positionOffset + CyclonePositionOffset.Latitude];
  return lon === undefined || lat === undefined ? null : { lat, lon };
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

function strokePath(
  context: Ctx,
  points: readonly (readonly [number, number])[],
): void {
  context.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) context.moveTo(point[0], point[1]);
    else context.lineTo(point[0], point[1]);
  }
  context.stroke();
}

function strokeModelPath(
  context: Ctx,
  line: GeoLineString,
  project: ProjFn,
): void {
  context.beginPath();
  let drawing = false;
  for (const [longitude, latitude] of line) {
    const point = project(latitude, longitude);
    if (point.z <= CycloneProjectionDepth.VisibleMinimum) {
      drawing = false;
      continue;
    }
    if (drawing) context.lineTo(point.x, point.y);
    else {
      context.moveTo(point.x, point.y);
      drawing = true;
    }
  }
  context.stroke();
}

function windBandAlpha(threshold: number): number | null {
  switch (threshold) {
    case CycloneWindThreshold.Gale:
      return CycloneWindBandAlpha.Gale;
    case CycloneWindThreshold.Storm:
      return CycloneWindBandAlpha.Storm;
    case CycloneWindThreshold.Hurricane:
      return CycloneWindBandAlpha.Hurricane;
    default:
      return null;
  }
}

function glowAlphaSuffix(stop: CycloneGlowStop): string {
  return Math.round(
    CycloneGlowAlphaFormat.MaximumByte *
      (CycloneNormalizedProgress.Maximum - stop),
  )
    .toString(CycloneGlowAlphaFormat.Radix)
    .padStart(
      CycloneGlowAlphaFormat.HexWidth,
      CycloneGlowText.Zero,
    );
}

function recordIsVisible(
  view: RenderSceneView,
  index: number,
  role: CycloneSceneRole,
  filter: CycloneSceneFilter,
): boolean {
  if (!filter.enabled) return false;
  const entityId = entityIdAt(view, index);
  const sceneId = sceneIdAt(view, index);
  if (!entityId || !sceneId) return false;
  if (
    filter.isolateMode === IsolateMode.Solo &&
    entityId !== filter.isolatedId &&
    sceneId !== filter.isolatedId
  ) {
    return false;
  }
  const pointType =
    role === CycloneSceneRole.Forecast
      ? Domain.CyclonesForecast
      : Domain.Cyclones;
  if (
    filter.isolateMode === IsolateMode.Focus &&
    filter.isolatedType &&
    filter.isolatedType !== pointType
  ) {
    return false;
  }
  if (
    sceneNumericAttribute(
      view,
      index,
      CycloneSceneAttribute.SaffirSimpson,
    ) < filter.minCategory
  ) {
    return false;
  }
  if (
    role === CycloneSceneRole.Forecast ||
    role === CycloneSceneRole.ForecastPath ||
    role === CycloneSceneRole.PastPath
  ) {
    return filter.showForecast;
  }
  if (role === CycloneSceneRole.WindRadius) {
    return filter.showWindField;
  }
  if (role === CycloneSceneRole.ModelPath) {
    return (
      filter.showModels &&
      !filter.hiddenModels.has(
        stringAttribute(
          view,
          index,
          CycloneSceneStringAttribute.ModelCode,
        ),
      )
    );
  }
  return true;
}

export class CycloneLayer extends SceneLayer<CycloneSceneFilter> {
  readonly order = RenderLayerOrder.Cyclones;

  private readonly projection = new ProjectedSceneLayer();
  private recordSets = new Map<string, CycloneRecordSet>();

  constructor() {
    super(Domain.Cyclones);
  }

  project(
    frame: SceneLayerProjectionFrame,
    filter: CycloneSceneFilter,
  ): void {
    const view = this.beginProject();
    this.recordSets = new Map();
    for (const [index, active] of view.active.entries()) {
      if (active !== CycloneRecordState.Active) continue;
      const role = roleAt(view, index);
      if (
        role === null ||
        !this.recordIncludes(view, index, filter)
      ) {
        continue;
      }
      const entityId = entityIdAt(view, index);
      if (!entityId) continue;
      const records = this.recordSets.get(entityId) ??
        new CycloneRecordSet();
      if (!this.recordSets.has(entityId)) {
        this.recordSets.set(entityId, records);
      }
      records.add(index, role);
    }
    this.projection.project(view, {
      ...frame,
      includes: (index) => {
        const role = roleAt(view, index);
        return (
          role !== null &&
          (role === CycloneSceneRole.Current ||
            role === CycloneSceneRole.Forecast) &&
          this.recordIncludes(view, index, filter)
        );
      },
    });
  }

  draw(style: CycloneSceneStyle): void {
    const view = this.view;
    if (!view) return;
    this.drawForecastMarkers(view, style);
    for (const records of this.recordSets.values()) {
      if (records.current === null) continue;
      const projection = this.projection.projection(records.current);
      if (!projection) continue;
      this.drawCurrent(view, records, projection, style);
    }
    style.context.globalAlpha = CycloneCanvasAlpha.Opaque;
  }

  nearest(
    kind: SceneHitKind,
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null {
    return kind === SceneHitKind.Point
      ? this.projection.nearest(
          x,
          y,
          radius,
          maximumCandidates,
        )
      : null;
  }

  selectionAnchor(id: string): SceneProjection | null {
    const view = this.view;
    if (!view) return null;
    for (const index of this.projection.visibleIndices()) {
      if (
        sceneIdAt(view, index) === id ||
        entityIdAt(view, index) === id
      ) {
        return this.projection.projection(index);
      }
    }
    return null;
  }

  override interactionIdentity(
    hit: SceneHit,
  ): RenderSelectionIdentity {
    const view = this.view;
    const role = view ? roleAt(view, hit.handle - 1) : null;
    return cycloneSelectionIdentity(
      role,
      hit.sceneId,
      hit.entityId,
    );
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
    if (
      view.attributeStride !== CycloneSceneSchema.AttributeStride ||
      view.stringAttributeStride !==
        CycloneSceneSchema.StringAttributeStride
    ) {
      return false;
    }
    const role = roleAt(view, index);
    return role !== null && recordIsVisible(view, index, role, filter);
  }

  private drawForecastMarkers(
    view: RenderSceneView,
    style: CycloneSceneStyle,
  ): void {
    for (const records of this.recordSets.values()) {
      for (const index of records.forecasts) {
        const projection = this.projection.projection(index);
        const sceneId = sceneIdAt(view, index);
        if (!projection || !sceneId) continue;
        const forecastHour = sceneNumericAttribute(
          view,
          index,
          CycloneSceneAttribute.ForecastHour,
        );
        const fade =
          CycloneNormalizedProgress.Maximum -
          Math.min(
            CycloneNormalizedProgress.Maximum,
            Math.max(
              CycloneNormalizedProgress.Minimum,
              forecastHour,
            ) /
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
          this.drawSelectionRing(
            style,
            projection,
            radius,
            style.color,
          );
        }
      }
    }
  }

  private drawCurrent(
    view: RenderSceneView,
    records: CycloneRecordSet,
    projection: SceneProjection,
    style: CycloneSceneStyle,
  ): void {
    const current = records.current;
    if (current === null) return;
    const entityId = entityIdAt(view, current);
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
      baseRadius * zoomScale(CycloneMarkerZoom.Default);
    if (selected) radius *= CycloneMarkerGeometry.SelectedScale;
    const depthAlpha =
      CycloneMarkerAlpha.DepthBase +
      projection.depth * CycloneMarkerAlpha.DepthGain;

    this.drawGlow(style, projection, radius, color, depthAlpha);
    this.drawModels(view, records, style, depthAlpha);
    this.drawPastPath(view, records, style, color, depthAlpha);
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
    this.drawWindRadii(
      view,
      records,
      current,
      projection,
      style,
      depthAlpha,
    );
    if (selected) {
      this.drawSelectionRing(style, projection, radius, color);
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
    context: Ctx,
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
    context.lineWidth = CycloneMarkerStroke.RingWidth;
    context.beginPath();
    context.arc(
      projection.x,
      projection.y,
      radius + CycloneMarkerGeometry.RingOffset,
      CycloneArc.StartRadians,
      CycloneArc.FullRadians,
    );
    context.stroke();

    context.fillStyle = CycloneColor.White;
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
    for (const index of records.modelPaths) {
      const line = geometryLine(view, index);
      if (!line) continue;
      const modelCode = stringAttribute(
        view,
        index,
        CycloneSceneStringAttribute.ModelCode,
      );
      style.context.strokeStyle = modelColor(modelCode);
      strokeModelPath(style.context, line, style.project);
    }
    style.context.globalAlpha = CycloneCanvasAlpha.Opaque;
  }

  private drawPastPath(
    view: RenderSceneView,
    records: CycloneRecordSet,
    style: CycloneSceneStyle,
    color: string,
    depthAlpha: number,
  ): void {
    const index = records.pastPath;
    if (index === null) return;
    const line = geometryLine(view, index);
    if (!line) return;
    const points = projectVisibleLine(line, style.project);
    if (points.length < CyclonePathPointCount.Minimum) return;

    style.context.strokeStyle = color;
    style.context.lineWidth = CyclonePathStyle.PastStrokeWidth;
    style.context.globalAlpha = depthAlpha * CyclonePathStyle.PastAlpha;
    strokePath(style.context, points);

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
    style.context.beginPath();
    style.context.moveTo(
      genesis[0] - CycloneGenesisStyle.ArmLength,
      genesis[1] - CycloneGenesisStyle.ArmLength,
    );
    style.context.lineTo(
      genesis[0] + CycloneGenesisStyle.ArmLength,
      genesis[1] + CycloneGenesisStyle.ArmLength,
    );
    style.context.moveTo(
      genesis[0] - CycloneGenesisStyle.ArmLength,
      genesis[1] + CycloneGenesisStyle.ArmLength,
    );
    style.context.lineTo(
      genesis[0] + CycloneGenesisStyle.ArmLength,
      genesis[1] - CycloneGenesisStyle.ArmLength,
    );
    style.context.stroke();
    style.context.globalAlpha = CycloneCanvasAlpha.Opaque;
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
    if (records.forecasts.length === 0) return;
    const forecasts = records.forecasts
      .map((index) => this.forecastFact(view, index))
      .filter((fact): fact is ForecastFact => fact !== null)
      .sort((left, right) => left.fcstHour - right.fcstHour);
    if (forecasts.length === 0) return;

    if (records.forecastPath !== null) {
      if (style.showCone) this.drawCone(
        style,
        eye,
        forecasts,
        color,
        depthAlpha,
        eyeWindKt,
      );
      const line = geometryLine(view, records.forecastPath);
      if (line) {
        style.context.strokeStyle = color;
        style.context.lineWidth = CycloneForecastTrackStyle.StrokeWidth;
        style.context.setLineDash([
          CycloneForecastTrackStyle.DashLength,
          CycloneForecastTrackStyle.DashGap,
        ]);
        style.context.globalAlpha =
          depthAlpha * CycloneForecastTrackStyle.Alpha;
        strokePath(
          style.context,
          projectVisibleLine(line, style.project),
        );
        style.context.setLineDash([]);
        style.context.globalAlpha = CycloneCanvasAlpha.Opaque;
      }
    }
  }

  private drawCone(
    style: CycloneSceneStyle,
    eye: SceneProjection,
    forecasts: readonly ForecastFact[],
    color: string,
    depthAlpha: number,
    eyeWindKt: number,
  ): void {
    for (const segment of segmentedConeSegments(
      eye.x,
      eye.y,
      forecasts,
      style.project,
      eyeWindKt,
    )) {
      const segmentColor =
        segment.maxWindKt > CycloneSceneDefault.Numeric
          ? windColor(segment.maxWindKt)
          : color;
      style.context.beginPath();
      for (const [index, point] of segment.quad.entries()) {
        if (index === 0) style.context.moveTo(point[0], point[1]);
        else style.context.lineTo(point[0], point[1]);
      }
      style.context.closePath();
      style.context.fillStyle = segmentColor;
      style.context.globalAlpha =
        depthAlpha *
        (CycloneConeFill.BaseAlpha -
          CycloneConeFill.FadeSpan * segment.t);
      style.context.fill();

      const [nearLeft, farLeft, farRight, nearRight] = segment.quad;
      style.context.strokeStyle = segmentColor;
      style.context.lineWidth = CycloneConeStroke.RimStrokeWidth;
      style.context.globalAlpha =
        depthAlpha *
        (CycloneConeStroke.RimBaseAlpha -
          CycloneConeStroke.RimFadeSpan * segment.t);
      strokePath(style.context, [nearLeft, farLeft]);
      strokePath(style.context, [nearRight, farRight]);
      style.context.lineWidth = CycloneConeStroke.DividerStrokeWidth;
      style.context.globalAlpha =
        depthAlpha *
        (CycloneConeStroke.DividerBaseAlpha -
          CycloneConeStroke.DividerFadeSpan * segment.t);
      strokePath(style.context, [farLeft, farRight]);
    }
    style.context.globalAlpha = CycloneCanvasAlpha.Opaque;
  }

  private drawWindRadii(
    view: RenderSceneView,
    records: CycloneRecordSet,
    current: number,
    eye: SceneProjection,
    style: CycloneSceneStyle,
    depthAlpha: number,
  ): void {
    const position = positionAt(view, current);
    if (!position) return;
    const north = style.project(
      position.lat + CycloneLatitudeOffset.NorthDegree,
      position.lon,
    );
    if (north.z <= CycloneProjectionDepth.VisibleMinimum) return;
    const pixelsPerNm =
      Math.hypot(north.x - eye.x, north.y - eye.y) /
      GeoMeasurement.NauticalMilesPerDegree;
    if (pixelsPerNm <= CycloneDistance.PositiveMinimum) return;

    for (const index of records.windRadii) {
      const threshold = sceneNumericAttribute(
        view,
        index,
        CycloneSceneAttribute.WindThresholdKt,
      );
      const alpha = windBandAlpha(threshold);
      if (alpha === null) continue;
      const quadrants = [
        sceneNumericAttribute(
          view,
          index,
          CycloneSceneAttribute.WindRadiusNe,
        ),
        sceneNumericAttribute(
          view,
          index,
          CycloneSceneAttribute.WindRadiusSe,
        ),
        sceneNumericAttribute(
          view,
          index,
          CycloneSceneAttribute.WindRadiusSw,
        ),
        sceneNumericAttribute(
          view,
          index,
          CycloneSceneAttribute.WindRadiusNw,
        ),
      ];
      const points = windRadiiBandPoints(
        quadrants,
        eye.x,
        eye.y,
        pixelsPerNm,
      );
      if (points.length === 0) continue;
      style.context.fillStyle = windRadiiBandColor(threshold);
      style.context.globalAlpha = depthAlpha * alpha;
      style.context.beginPath();
      for (const [pointIndex, point] of points.entries()) {
        if (pointIndex === 0) {
          style.context.moveTo(point[0], point[1]);
        } else {
          style.context.lineTo(point[0], point[1]);
        }
      }
      style.context.closePath();
      style.context.fill();
    }
    style.context.globalAlpha = CycloneCanvasAlpha.Opaque;
  }

  private drawSelectionRing(
    style: CycloneSceneStyle,
    projection: SceneProjection,
    radius: number,
    color: string,
  ): void {
    const delta = style.reducedMotion
      ? CycloneSelectionMotionSpan.StaticPixels
      : Math.sin(
          style.time * CycloneSelectionMotionRate.Radians,
        ) * CycloneSelectionMotionSpan.Pixels;
    style.context.globalAlpha = CycloneSelectionAlpha.Ring;
    style.context.strokeStyle = color;
    style.context.lineWidth = CycloneSelectionGeometry.StrokeWidth;
    style.context.beginPath();
    style.context.arc(
      projection.x,
      projection.y,
      radius * CycloneSelectionGeometry.RadiusScale + delta,
      CycloneArc.StartRadians,
      CycloneArc.FullRadians,
    );
    style.context.stroke();
  }

  private forecastFact(
    view: RenderSceneView,
    index: number,
  ): ForecastFact | null {
    const position = positionAt(view, index);
    if (!position) return null;
    return {
      ...position,
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
