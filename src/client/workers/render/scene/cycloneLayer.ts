import {
  clipToRaster,
  drawGenesisMark,
  fillCategoryCone,
  GLASS_FILL_ALPHA,
  paintProbabilityBands,
  paintRaster,
  paintSurgeAreas,
  paintWindRadiiBands,
  strokeArrivalLines,
  strokeIntensityTrack,
  strokeSurgeAreas,
  WIND_BAND_RIM_ALPHA,
  type TrackVertex,
  type WindRadiiBand,
} from "@/features/environmental/cyclones/render/cycloneGeometry";
import { projectSceneGeometry, type SceneAreaProjection } from "@/workers/render/scene/areaGeometry";
import { StormRasterCache, stormRasterArea, visibleRasterSources } from "@/features/environmental/cyclones/data/radar";
import type { ProjFn } from "@/lib/geo/render/types";
import { strokeGeoPath } from "@/lib/geo/render/path";
import {
  modelColor,
  windColor,
} from "@/features/environmental/cyclones/classification";
import {
  Category,
  CYCLONE_CATEGORY_METADATA,
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
import type { SceneResolvedPosition } from "@/workers/render/scene/scenePosition";
import { CycloneScenePositionAccessor } from "@/workers/render/scene/cyclonePosition";
import { Domain } from "@shared/domain/identity";
import { sceneSchemaMatches } from "@shared/domain/pointSource";
import type { GeoLineString } from "@shared/geo";
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
  surgeColor: string;
  casingColor: string;
  selectedId: string | null;
  time: number;
  reducedMotion: boolean;
}>;

export type CycloneUnderlayStyle = Pick<CycloneSceneStyle, "context" | "project" | "surgeColor" | "reducedMotion"> &
  Readonly<{ strokeOverImagery: () => void }>;

function underlayProjection(style: CycloneUnderlayStyle): SceneAreaProjection {
  return { project: style.project, horizon: null };
}

type CycloneRecordSet = Readonly<{
  overlay: RenderCycloneOverlay;
  indices: number[][];
}>;

function cycloneRole(role: number | undefined): CycloneSceneRole | null {
  switch (role) {
    case CycloneSceneRole.Current:
    case CycloneSceneRole.Forecast:
    case CycloneSceneRole.PastPoint:
    case CycloneSceneRole.WindRadius:
    case CycloneSceneRole.ModelPath:
    case CycloneSceneRole.Cone:
    case CycloneSceneRole.WindChance:
    case CycloneSceneRole.Surge:
    case CycloneSceneRole.Arrival:
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

type ScenePositionAt = (view: RenderSceneView, index: number) => SceneResolvedPosition | null;

function trackVertices(
  view: RenderSceneView,
  indices: readonly number[],
  project: ProjFn,
  positionAt: ScenePositionAt,
): TrackVertex[] {
  const hour = (index: number) => sceneNumericAttribute(view, index, CycloneSceneAttribute.ForecastHour);
  return [...indices]
    .sort((left, right) => hour(left) - hour(right))
    .flatMap((index) => {
      const position = positionAt(view, index);
      if (!position) return [];
      const point = project(position.latitude, position.longitude);
      const windKt = sceneNumericAttribute(view, index, CycloneSceneAttribute.MaxWindKt);
      return [{ x: point.x, y: point.y, z: point.z, windKt }];
    });
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

const CYCLONE_POINT_TYPES: ReadonlySet<string> = new Set([Domain.Cyclones, Domain.CyclonesForecast]);

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
    !CYCLONE_POINT_TYPES.has(filter.isolatedType)
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
  private onScreen = false;
  private rastersSharpening = false;
  private readonly rasters = new StormRasterCache();
  private readonly positions: CycloneScenePositionAccessor;
  private frameTime = Date.now();
  private readonly positionAt: ScenePositionAt = (view, index) => this.positions.resolveView(view, index, this.frameTime);

  constructor() {
    const positions = new CycloneScenePositionAccessor();
    super(Domain.Cyclones, positions);
    this.positions = positions;
  }

  override project(
    frame: SceneLayerProjectionFrame,
    filter: CycloneSceneFilter,
    time: number = Date.now(),
  ): void {
    this.frameTime = time;
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
      sceneVersion: this.sceneVersion(),
    }, time);
    this.onScreen = !this.projection.visibleIndices().next().done;
  }

  override draw(style: CycloneSceneStyle): void {
    const view = this.view;
    if (!view) return;
    super.draw(style);
    for (const records of this.recordSets.values()) {
      const current = records.indices[CycloneSceneRole.Current]?.[0];
      if (current === undefined) continue;
      const projection = this.currentProjection(view, current, style);
      if (!projection) continue;
      this.drawCurrent(view, records, projection, style);
    }
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private currentProjection(view: RenderSceneView, index: number, style: CycloneSceneStyle): SceneProjection | null {
    const projected = this.projection.projection(index);
    if (projected) return projected;
    const position = this.positionAt(view, index);
    if (!position) return null;
    const point = style.project(position.latitude, position.longitude);
    return point.z > CYCLONE_VISIBLE_DEPTH_MINIMUM ? { x: point.x, y: point.y, depth: point.z } : null;
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

  /** Only a storm on screen earns frames; off-screen storms cost nothing. */
  override hasTimeAnimation(reducedMotion: boolean): boolean {
    return (!reducedMotion && this.onScreen) || this.rastersSharpening;
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
    const color = windColor(sceneNumericAttribute(view, index, CycloneSceneAttribute.MaxWindKt));
    style.context.fillStyle = color;
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
        style.context, projection.x, projection.y, radius, color, ringTime(style),
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

    if (records.overlay.showCone) this.drawCone(view, records, current, style, depthAlpha);
    if (records.overlay.showWindField) this.drawWindRadii(view, records, current, projection, style, depthAlpha);
    if (records.overlay.showModels) this.drawModels(view, records, style, depthAlpha);
    if (records.overlay.showArrival) this.drawArrival(view, records, style, color);
    if (records.overlay.showForecast) {
      this.drawPastTrack(view, records, current, style, depthAlpha);
      this.drawForecast(view, records, current, style, depthAlpha);
    }
    this.drawGlow(style, projection, radius, color, depthAlpha);
    this.drawEye(style.context, projection, radius, color, depthAlpha);
    if (selected) {
      drawSelectionRing(
        style.context, projection.x, projection.y, radius, color, ringTime(style),
      );
    }
  }

  drawUnderlay(style: CycloneUnderlayStyle): void {
    this.rastersSharpening = false;
    const view = this.view;
    if (!view) return;
    for (const records of this.recordSets.values()) {
      const current = records.indices[CycloneSceneRole.Current]?.[0];
      if (current === undefined) continue;
      this.drawHazardAreas(view, records, style);
      this.drawRasters(view, records, current, style);
    }
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private drawRasters(view: RenderSceneView, records: CycloneRecordSet, current: number, style: CycloneUnderlayStyle): void {
    const sources = visibleRasterSources(records.overlay);
    const position = this.positionAt(view, current);
    if (sources.length === 0 || !position) return;
    const galeKt = CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt;
    const gale = (records.indices[CycloneSceneRole.WindRadius] ?? []).find((index) =>
      sceneNumericAttribute(view, index, CycloneSceneAttribute.WindThresholdKt) === galeKt);
    const area = stormRasterArea(position.latitude, position.longitude, gale === undefined ? [] : windRadiusQuadrants(view, gale));
    const now = Date.now();
    let painted = false;
    for (const source of sources) {
      this.rasters.request(view.entityIds[current] ?? "", source, area.bounds, now);
      const image = this.rasters.peek(source, area.bounds, now, !style.reducedMotion);
      if (!image) continue;
      painted = true;
      if (!paintRaster(style.context, style.project, image, area.circle)) this.rastersSharpening = true;
    }
    if (!painted) return;
    style.context.save();
    if (clipToRaster(style.context, style.project, area.circle)) {
      style.strokeOverImagery();
      if (records.overlay.showSurge) {
        strokeSurgeAreas(style.context, underlayProjection(style), this.hazardRings(view, records, CycloneSceneRole.Surge), {
          color: style.surgeColor,
          casing: null,
        });
      }
    }
    style.context.restore();
  }

  private hazardRings(view: RenderSceneView, records: CycloneRecordSet, role: CycloneSceneRole) {
    return (records.indices[role] ?? []).flatMap((index) => {
      const geometry = view.geometries[index];
      if (geometry?.kind !== SceneGeometryKind.Polygon) return [];
      return [{ rings: geometry.groups.flatMap((group) => group.slice(0, 1)) }];
    });
  }

  private drawHazardAreas(
    view: RenderSceneView,
    records: CycloneRecordSet,
    style: CycloneUnderlayStyle,
  ): void {
    const { overlay } = records;
    const projection = underlayProjection(style);
    if (overlay.showWindChances) {
      const bands = (records.indices[CycloneSceneRole.WindChance] ?? []).flatMap((index) => {
        const geometry = view.geometries[index];
        if (geometry?.kind !== SceneGeometryKind.Polygon) return [];
        const rank = sceneNumericAttribute(view, index, CycloneSceneAttribute.HazardRank);
        return [{ rank, rings: geometry.groups.flatMap((group) => group.slice(0, 1)) }];
      });
      paintProbabilityBands(style.context, projection, bands);
    }
    if (overlay.showSurge) {
      paintSurgeAreas(style.context, projection, this.hazardRings(view, records, CycloneSceneRole.Surge), style.surgeColor);
    }
  }

  private drawArrival(view: RenderSceneView, records: CycloneRecordSet, style: CycloneSceneStyle, color: string): void {
    const lines = (records.indices[CycloneSceneRole.Arrival] ?? []).flatMap((index) => {
      const line = geometryLine(view, index);
      return line ? [{ label: stringAttribute(view, index, CycloneSceneStringAttribute.Label), line }] : [];
    });
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
    style.context.strokeStyle = color;
    style.context.lineWidth = CyclonePathStyle.ModelStrokeWidth;
    strokeArrivalLines(style.context, style.project, lines, style.casingColor);
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
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

  private drawPastTrack(
    view: RenderSceneView,
    records: CycloneRecordSet,
    current: number,
    style: CycloneSceneStyle,
    depthAlpha: number,
  ): void {
    const past = trackVertices(view, records.indices[CycloneSceneRole.PastPoint] ?? [], style.project, this.positionAt);
    const vertices = [...past, ...trackVertices(view, [current], style.project, this.positionAt)];
    if (vertices.length < CYCLONE_PATH_POINT_MINIMUM) return;
    const { context } = style;
    context.lineWidth = CyclonePathStyle.PastStrokeWidth;
    context.globalAlpha = depthAlpha * CyclonePathStyle.PastAlpha;
    strokeIntensityTrack(context, vertices);
    context.globalAlpha = depthAlpha * CyclonePastPointStyle.Alpha;
    for (const vertex of past.slice(1)) {
      if (vertex.z <= CYCLONE_VISIBLE_DEPTH_MINIMUM) continue;
      context.fillStyle = windColor(vertex.windKt);
      context.beginPath();
      context.arc(vertex.x, vertex.y, CyclonePastPointStyle.Radius, CycloneArc.StartRadians, CycloneArc.FullRadians);
      context.fill();
    }
    const genesis = past[0];
    if (genesis && genesis.z > CYCLONE_VISIBLE_DEPTH_MINIMUM) {
      context.strokeStyle = windColor(genesis.windKt);
      context.lineWidth = CycloneGenesisStyle.StrokeWidth;
      context.globalAlpha = depthAlpha;
      drawGenesisMark(context, genesis.x, genesis.y, CycloneGenesisStyle.ArmLength);
    }
    context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private drawForecast(
    view: RenderSceneView,
    records: CycloneRecordSet,
    current: number,
    style: CycloneSceneStyle,
    depthAlpha: number,
  ): void {
    const forecast = trackVertices(view, records.indices[CycloneSceneRole.Forecast] ?? [], style.project, this.positionAt);
    if (forecast.length === 0) return;
    const { context } = style;
    context.lineWidth = CycloneForecastTrackStyle.StrokeWidth;
    context.setLineDash([CycloneForecastTrackStyle.DashLength, CycloneForecastTrackStyle.DashGap]);
    context.globalAlpha = depthAlpha * CycloneForecastTrackStyle.Alpha;
    strokeIntensityTrack(context, [...trackVertices(view, [current], style.project, this.positionAt), ...forecast]);
    context.setLineDash([]);
    context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }

  private drawCone(
    view: RenderSceneView,
    records: CycloneRecordSet,
    current: number,
    style: CycloneSceneStyle,
    depthAlpha: number,
  ): void {
    const index = records.indices[CycloneSceneRole.Cone]?.[0];
    const geometry = index === undefined ? null : view.geometries[index];
    if (geometry?.kind !== SceneGeometryKind.Polygon) return;
    const rings = projectSceneGeometry(geometry.groups, { project: style.project, horizon: null }).flat();
    const track = trackVertices(view, [current, ...(records.indices[CycloneSceneRole.Forecast] ?? [])], style.project, this.positionAt);
    fillCategoryCone(style.context, rings, track, { alpha: depthAlpha * GLASS_FILL_ALPHA, casing: style.casingColor });
  }

  private drawWindRadii(
    view: RenderSceneView,
    records: CycloneRecordSet,
    current: number,
    eye: SceneProjection,
    style: CycloneSceneStyle,
    depthAlpha: number,
  ): void {
    const position = this.positionAt(view, current);
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
      .map((index): WindRadiiBand => ({
        threshold: sceneNumericAttribute(view, index, CycloneSceneAttribute.WindThresholdKt),
        quadrants: windRadiusQuadrants(view, index),
        fillAlpha: depthAlpha * GLASS_FILL_ALPHA,
      }))
      .sort((left, right) => left.threshold - right.threshold);
    paintWindRadiiBands(style.context, { x: eye.x, y: eye.y, pixelsPerNm }, bands, {
      alpha: depthAlpha * WIND_BAND_RIM_ALPHA,
      casing: style.casingColor,
    });
    style.context.globalAlpha = CYCLONE_CANVAS_OPAQUE_ALPHA;
  }
}
