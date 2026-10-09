import { useMemo } from "react";
import { useDataContext } from "@/context/DataContext";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { sceneAreaAlpha } from "@/workers/render/scene/areaLayer";
import { PointUiQueryKind, type PointUiQuery } from "@/workers/data/uiQuery";
import { Domain } from "@shared/domain/identity";
import type { ThemeColors } from "@/theme";
import { ThemeColorKey } from "@shared/domain/theme";
import {
  DossierMiniGlobe,
  type DossierMiniGlobeCamera,
  type DossierMiniGlobeDrawContext,
} from "@/dossier";
import {
  AreaKind,
  Category,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  estimatedStormPosition,
  mappedArrivalLines,
  mappedWindChances,
  type CycloneHazards,
  type CycloneCoordinates,
  type CycloneWarningPoint,
  type CycloneForecastFact,
  type ForecastPoint,
  type ModelTrack,
  type PastTrackPoint,
  type WindRadii,
} from "@shared/domain/cyclones";
import { AngleConversion, GeoLimit, GeoMeasurement, geometryPolygons, TurnDeg, type GeoJsonPolygon, type GeoPoint } from "@shared/geo";
import { DEFAULT_RENDER_CYCLONE_OVERLAY, type RenderCycloneOverlay } from "@/workers/render/protocol";
import type { HorizonCircle, ProjFn } from "@/lib/geo/render/types";
import { drawSceneGeometry, projectSceneGeometry } from "@/workers/render/scene/areaGeometry";
import { strokeGeoPath } from "@/lib/geo/render/path";
import type { CyclonePoint } from "../data/codec";
import { categoryShort, cycloneAreaColor, modelColor, SAFFIR_LEGEND, windColor } from "../classification";
import {
  drawGenesisMark,
  GLASS_FILL_ALPHA,
  fillCategoryCone,
  paintProbabilityBands,
  paintRaster,
  paintSurgeAreas,
  paintWindRadiiBands,
  strokeArrivalLines,
  strokeIntensityTrack,
  WIND_BAND_RIM_ALPHA,
  type TrackVertex,
} from "../render/cycloneGeometry";
import { CycloneLayerToggles } from "./CycloneLayerToggles";
import { RASTER_FRAME_MS, StormRasterCache, stormRasterArea, visibleRasterSources } from "../data/radar";
import { useRenderGlobeState } from "@/render-surface/useRenderGlobeState";
import { CycloneModelLegend } from "./CycloneModelLegend";

const FULL_CIRCLE_RADIANS =
  TurnDeg.Full * AngleConversion.RadiansPerDegree;

enum CycloneMiniMapPolicy {
  MaximumRadiusScale = 9,
  MaximumZoom = 8,
  MinimumRadiusFactor = 0.05,
  MinimumSpanDegrees = 1,
  MinimumZoom = 0.5,
  TrackFrameRatio = 0.8,
}

function degreesToRadians(degrees: number): number {
  return degrees * AngleConversion.RadiansPerDegree;
}

type CycloneMiniMapScene = Readonly<{
  accent: string;
  casing: string;
  context: CanvasRenderingContext2D;
  current: Pick<CycloneForecastFact, "lat" | "lon" | "maxWindKt">;
  horizon: HorizonCircle;
  project: ProjFn;
}>;

function trackVertices(
  project: ProjFn,
  points: readonly (CycloneCoordinates & Readonly<{ windKt: number }>)[],
): TrackVertex[] {
  return points.map((point) => ({ ...project(point.lat, point.lon), windKt: point.windKt }));
}

function geoPoints(points: readonly CycloneCoordinates[]): GeoPoint[] {
  return points.map((point) => [point.lon, point.lat]);
}

function drawModelTracks(scene: CycloneMiniMapScene, models: readonly ModelTrack[]): void {
  const { context, project } = scene;
  context.globalAlpha = 0.7;
  context.lineWidth = 1.25;
  for (const model of models) {
    context.strokeStyle = modelColor(model.model);
    strokeGeoPath(context, project, geoPoints(model.points));
  }
  context.globalAlpha = 1;
}

const WARNING_SEARCH_MARGIN_DEGREES = 5;

function drawWarnings(
  scene: CycloneMiniMapScene,
  warnings: readonly CycloneWarningPoint[],
  colors: ThemeColors,
): void {
  const { context, horizon, project } = scene;
  for (const warning of warnings) {
    const color = cycloneAreaColor(colors, warning.data.kind);
    const alpha = sceneAreaAlpha(warning.data.kind, false, 0);
    drawSceneGeometry(context, geometryPolygons(warning.data.geometry), { project, horizon }, color, alpha);
  }
}

function drawCone(scene: CycloneMiniMapScene, cone: GeoJsonPolygon, forecast: readonly ForecastPoint[]): void {
  const { context, current, horizon, project } = scene;
  const rings = projectSceneGeometry(geometryPolygons(cone), { project, horizon }).flat();
  const track = trackVertices(project, [
    { lat: current.lat, lon: current.lon, windKt: current.maxWindKt },
    ...forecast.map((point) => ({ lat: point.lat, lon: point.lon, windKt: point.maxWindKt })),
  ]);
  fillCategoryCone(context, rings, track, { alpha: GLASS_FILL_ALPHA, casing: scene.casing });
}

function drawWindField(
  scene: CycloneMiniMapScene,
  windRadii: WindRadii,
  pixelsPerNauticalMile: number,
): void {
  const { context, current, project } = scene;
  const eye = project(current.lat, current.lon);
  if (eye.z <= 0) return;
  const bands: ReadonlyArray<readonly [number, readonly number[] | null]> = [
    [CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt, windRadii.kt34],
    [CYCLONE_STRONG_WIND_RADIUS_KT, windRadii.kt50],
    [CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt, windRadii.kt64],
  ];
  paintWindRadiiBands(
    context,
    { x: eye.x, y: eye.y, pixelsPerNm: pixelsPerNauticalMile },
    bands.flatMap(([threshold, quadrants]) =>
      quadrants ? [{ threshold, quadrants, fillAlpha: GLASS_FILL_ALPHA }] : []),
    { alpha: WIND_BAND_RIM_ALPHA, casing: scene.casing },
  );
  context.globalAlpha = 1;
}

function drawOfficialTrack(
  scene: CycloneMiniMapScene,
  pastTrack: readonly PastTrackPoint[] | undefined,
  forecast: readonly ForecastPoint[],
): void {
  const { context, current, project } = scene;
  const eye = { lat: current.lat, lon: current.lon, windKt: current.maxWindKt };
  const past = (pastTrack ?? []).map((point) => ({ lat: point.lat, lon: point.lon, windKt: point.vmaxKt }));
  const ahead = forecast.map((point) => ({ lat: point.lat, lon: point.lon, windKt: point.maxWindKt }));
  context.lineWidth = 1.5;
  context.globalAlpha = 0.5;
  strokeIntensityTrack(context, trackVertices(project, [...past, eye]));
  const genesisPoint = past[0];
  if (genesisPoint) {
    const genesis = project(genesisPoint.lat, genesisPoint.lon);
    context.strokeStyle = windColor(genesisPoint.windKt);
    if (genesis.z > 0) drawGenesisMark(context, genesis.x, genesis.y, 3);
  }
  context.globalAlpha = 0.85;
  context.setLineDash([4, 3]);
  strokeIntensityTrack(context, trackVertices(project, [eye, ...ahead]));
  context.setLineDash([]);
  context.globalAlpha = 1;
  for (const forecastPoint of forecast) {
    const point = project(forecastPoint.lat, forecastPoint.lon);
    if (point.z <= 0) continue;
    const color = windColor(forecastPoint.maxWindKt);
    context.beginPath();
    context.arc(point.x, point.y, 2.5, 0, FULL_CIRCLE_RADIANS);
    context.fillStyle = color;
    context.fill();
    context.font = "600 11px 'JetBrains Mono', monospace";
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(categoryShort(forecastPoint.maxWindKt), point.x + 4, point.y - 3);
  }
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

enum FocusMarker {
  RingRadiusPx = 7,
  RingWidthPx = 1.5,
  ErrorDashPx = 3,
}

function drawFocus(scene: CycloneMiniMapScene, focus: ForecastPoint, pixelsPerNauticalMile: number): void {
  const { context, project } = scene;
  const point = project(focus.lat, focus.lon);
  if (point.z <= 0) return;
  context.strokeStyle = windColor(focus.maxWindKt);
  context.lineWidth = FocusMarker.RingWidthPx;
  context.beginPath();
  context.arc(point.x, point.y, FocusMarker.RingRadiusPx, 0, FULL_CIRCLE_RADIANS);
  context.stroke();
  if (focus.errorRadiusNm <= 0) return;
  context.setLineDash([FocusMarker.ErrorDashPx, FocusMarker.ErrorDashPx]);
  context.beginPath();
  context.arc(point.x, point.y, focus.errorRadiusNm * pixelsPerNauticalMile, 0, FULL_CIRCLE_RADIANS);
  context.stroke();
  context.setLineDash([]);
}

const ARRIVAL_LINE_WIDTH = 1.25;

function drawHazardOverlays(
  scene: CycloneMiniMapScene,
  colors: ThemeColors,
  hazards: CycloneHazards | undefined,
  overlay: RenderCycloneOverlay,
): void {
  if (!hazards) return;
  const { context, horizon, project } = scene;
  const stormWinds = mappedWindChances(hazards);
  if (overlay.showWindChances && stormWinds) {
    paintProbabilityBands(context, { project, horizon }, stormWinds.bands.map((band, rank) => ({ rank, rings: band.rings })));
  }
  if (overlay.showSurge) {
    paintSurgeAreas(context, { project, horizon }, hazards.peakSurge, cycloneAreaColor(colors, AreaKind.Warning));
  }
  context.globalAlpha = 1;
}

function drawArrival(scene: CycloneMiniMapScene, hazards: CycloneHazards | undefined, overlay: RenderCycloneOverlay): void {
  if (!hazards || !overlay.showArrival) return;
  const { accent, context, project } = scene;
  context.globalAlpha = 1;
  context.strokeStyle = accent;
  context.lineWidth = ARRIVAL_LINE_WIDTH;
  strokeArrivalLines(context, project, mappedArrivalLines(hazards), scene.casing);
  context.globalAlpha = 1;
}

function drawCurrentEye(scene: CycloneMiniMapScene): void {
  const { accent, context, current, project } = scene;
  const point = project(current.lat, current.lon);
  if (point.z <= 0) return;
  context.beginPath();
  context.arc(point.x, point.y, 3.5, 0, FULL_CIRCLE_RADIANS);
  context.fillStyle = windColor(current.maxWindKt);
  context.fill();
  context.beginPath();
  context.arc(point.x, point.y, 6, 0, FULL_CIRCLE_RADIANS);
  context.strokeStyle = accent;
  context.lineWidth = 1.25;
  context.stroke();
}

export function CycloneForecastMiniMap({
  item,
  focus,
  hazards,
  mapClassName = "h-72",
}: Readonly<{ item: CyclonePoint; focus?: ForecastPoint; hazards?: CycloneHazards; mapClassName?: string }>) {
  const { cycloneOverlays } = useDataContext();
  const overlay = cycloneOverlays[item.id] ?? DEFAULT_RENDER_CYCLONE_OVERLAY;
  const models = item.data.models ?? [];
  const visibleModels = models.filter((model) => !overlay.hiddenModels.includes(model.model));
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <CycloneLayerToggles entityId={item.id} overlay={overlay} />
      <div className={mapClassName}>
        <CycloneForecastCanvas
          item={item}
          focus={focus}
          models={visibleModels}
          overlay={overlay}
          hazards={hazards}
        />
      </div>
      {overlay.showModels && models.length > 0 && (
        <CycloneModelLegend entityId={item.id} models={models} hiddenModels={overlay.hiddenModels} />
      )}
    </div>
  );
}

type CycloneForecastCanvasProps = Readonly<{
  item: CyclonePoint;
  focus: ForecastPoint | undefined;
  models: readonly ModelTrack[];
  overlay: RenderCycloneOverlay;
  hazards: CycloneHazards | undefined;
}>;

function CycloneForecastCanvas({ item, focus, models, overlay, hazards }: CycloneForecastCanvasProps) {
  const [estimatedLon, estimatedLat] = estimatedStormPosition([item.lon, item.lat], item.data, Date.now());
  const current = { lat: estimatedLat, lon: estimatedLon, maxWindKt: item.data.maxWindKt };
  const forecast = item.data.forecast;
  const pastTrack = item.data.pastTrack;
  const windRadii = item.data.windRadii;
  const { showCone, showForecast, showModels, showWindField } = overlay;
  const { cycloneWarningsVisible } = useDataContext();

  const trackPoints = [...(pastTrack ?? []), current, ...forecast];
  let minLat = GeoLimit.MaxLatitude;
  let maxLat = GeoLimit.MinLatitude;
  let minLon = GeoLimit.MaxLongitude;
  let maxLon = GeoLimit.MinLongitude;
  for (const point of trackPoints) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
  }
  const warningQuery = useMemo<PointUiQuery | null>(() => cycloneWarningsVisible
    ? {
        kind: PointUiQueryKind.BoundingBox,
        minLat: Math.max(GeoLimit.MinLatitude, minLat - WARNING_SEARCH_MARGIN_DEGREES),
        maxLat: Math.min(GeoLimit.MaxLatitude, maxLat + WARNING_SEARCH_MARGIN_DEGREES),
        minLon: Math.max(GeoLimit.MinLongitude, minLon - WARNING_SEARCH_MARGIN_DEGREES),
        maxLon: Math.min(GeoLimit.MaxLongitude, maxLon + WARNING_SEARCH_MARGIN_DEGREES),
        limit: POINT_UI_QUERY_POLICY.bboxCandidateLimit,
      }
    : null, [cycloneWarningsVisible, minLat, maxLat, minLon, maxLon]);
  const warnings = useSourceQuery(Domain.CycloneWarnings, warningQuery)?.items ?? [];
  const { reducedMotion } = useRenderGlobeState();
  const rasterCache = useMemo(() => new StormRasterCache(), []);
  const rasterSources = visibleRasterSources(overlay);
  const rasterArea = rasterSources.length > 0 ? stormRasterArea(current.lat, current.lon, windRadii?.kt34 ?? []) : null;
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const latitudeSpan = maxLat - minLat;
  const longitudeSpan = (maxLon - minLon) * Math.cos(degreesToRadians(midLat));
  const spanDeg = Math.max(latitudeSpan, longitudeSpan, CycloneMiniMapPolicy.MinimumSpanDegrees);

  const spanRadius = Math.max(
    Math.sin(degreesToRadians(spanDeg / 2)),
    CycloneMiniMapPolicy.MinimumRadiusFactor,
  );
  const camera: DossierMiniGlobeCamera = {
    centerLatitude: midLat,
    centerLongitude: midLon,
    maximumZoom: CycloneMiniMapPolicy.MaximumZoom,
    minimumZoom: CycloneMiniMapPolicy.MinimumZoom,
    radiusScale: Math.min(
      CycloneMiniMapPolicy.TrackFrameRatio / spanRadius,
      CycloneMiniMapPolicy.MaximumRadiusScale,
    ),
    spanDegrees: spanDeg,
  };
  const officialCone = item.data.officialCone;
  const drawOverlay = ({
    centerX,
    centerY,
    colors,
    context,
    project,
    radius,
  }: DossierMiniGlobeDrawContext): void => {
    const accent = windColor(current.maxWindKt);
    const horizon = { gcx: centerX, gcy: centerY, gr: radius };
    const scene: CycloneMiniMapScene = { accent, casing: colors[ThemeColorKey.Background], context, current, horizon, project };
    if (warnings.length > 0) drawWarnings(scene, warnings, colors);
    drawHazardOverlays(scene, colors, hazards, overlay);
    if (rasterArea) {
      const now = Date.now();
      for (const source of rasterSources) {
        rasterCache.request(item.id, source, rasterArea.bounds, now);
        const frame = rasterCache.peek(source, rasterArea.bounds, now, !reducedMotion);
        if (frame) paintRaster(context, project, frame, rasterArea.circle);
      }
    }
    if (showCone && officialCone) drawCone(scene, officialCone, forecast);
    const pixelsPerNauticalMile =
      degreesToRadians(1) * radius / GeoMeasurement.NauticalMilesPerDegree;
    if (showWindField && windRadii) drawWindField(scene, windRadii, pixelsPerNauticalMile);
    if (showModels && models.length > 0) drawModelTracks(scene, models);
    drawArrival(scene, hazards, overlay);
    if (showForecast) drawOfficialTrack(scene, pastTrack, forecast);
    if (focus) drawFocus(scene, focus, pixelsPerNauticalMile);
    drawCurrentEye(scene);
  };

  return (
    <DossierMiniGlobe
      ariaLabel="Forecast track: storm position, past track, and forecast over coastline"
      camera={camera}
      drawOverlay={drawOverlay}
      {...(rasterArea ? { redrawEveryMs: RASTER_FRAME_MS } : {})}
      reserveMinimumHeight={true}
      resetKey={`${current.lat}:${current.lon}`}
    >
      <div className="absolute bottom-1.5 left-1.5 flex flex-col gap-px rounded bg-sig-bg/70 backdrop-blur-sm px-1.5 py-1 text-(length:--sig-text-xs) leading-tight">
        {SAFFIR_LEGEND.map((band) => (
          <span key={band.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: band.color }} />
            <span className="font-semibold w-5" style={{ color: band.color }}>
              {band.label}
            </span>
            <span className="text-sig-dim">{band.range}</span>
          </span>
        ))}
      </div>
    </DossierMiniGlobe>
  );
}
