import { useDataContext } from "@/context/DataContext";
import {
  DossierMiniGlobe,
  type DossierMiniGlobeCamera,
  type DossierMiniGlobeDrawContext,
} from "@/dossier";
import {
  Category,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  type CycloneCoordinates,
  type CycloneForecastFact,
  type ForecastPoint,
  type ModelTrack,
  type PastTrackPoint,
  type WindRadii,
} from "@shared/domain/cyclones";
import { AngleConversion, GeoLimit, GeoMeasurement, TurnDeg, type GeoPoint } from "@shared/geo";
import { DEFAULT_RENDER_CYCLONE_OVERLAY, type RenderCycloneOverlay } from "@/workers/render/protocol";
import type { ProjFn } from "@/lib/geo/render/types";
import { strokeGeoPath } from "@/lib/geo/render/path";
import type { CyclonePoint } from "../data/codec";
import { categoryShort, modelColor, SAFFIR_LEGEND, windColor } from "../classification";
import {
  drawGenesisMark,
  paintConeSegments,
  paintWindRadiiBands,
  segmentedConeSegments,
} from "../render/cycloneGeometry";
import { CycloneLayerToggles } from "./CycloneLayerToggles";
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
  context: CanvasRenderingContext2D;
  current: Pick<CycloneForecastFact, "lat" | "lon" | "maxWindKt">;
  project: ProjFn;
}>;

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

function drawCone(scene: CycloneMiniMapScene, forecast: readonly ForecastPoint[]): void {
  const { accent, context, current, project } = scene;
  const eye = project(current.lat, current.lon);
  if (eye.z <= 0) return;
  paintConeSegments(
    context,
    segmentedConeSegments(eye.x, eye.y, forecast, project, current.maxWindKt),
    { depthAlpha: 1, fallbackColor: accent, rims: false },
  );
  context.globalAlpha = 1;
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
      quadrants ? [{ threshold, quadrants, fillAlpha: 0.18 }] : []),
    0.9,
  );
  context.globalAlpha = 1;
}

function drawOfficialTrack(
  scene: CycloneMiniMapScene,
  pastTrack: readonly PastTrackPoint[] | undefined,
  forecast: readonly ForecastPoint[],
): void {
  const { accent, context, current, project } = scene;
  context.strokeStyle = accent;
  context.lineWidth = 1.5;
  if (pastTrack && pastTrack.length > 0) {
    context.globalAlpha = 0.5;
    strokeGeoPath(context, project, geoPoints([...pastTrack, current]));
    const genesisPoint = pastTrack[0];
    if (genesisPoint) {
      const genesis = project(genesisPoint.lat, genesisPoint.lon);
      if (genesis.z > 0) drawGenesisMark(context, genesis.x, genesis.y, 3);
    }
  }
  context.globalAlpha = 0.85;
  context.setLineDash([4, 3]);
  strokeGeoPath(context, project, geoPoints([current, ...forecast]));
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
    context.font = "600 9px 'JetBrains Mono', monospace";
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(categoryShort(forecastPoint.maxWindKt), point.x + 4, point.y - 3);
  }
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
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
  mapClassName = "h-72",
}: Readonly<{ item: CyclonePoint; mapClassName?: string }>) {
  const { cycloneOverlays } = useDataContext();
  const overlay = cycloneOverlays[item.id] ?? DEFAULT_RENDER_CYCLONE_OVERLAY;
  const models = item.data.models ?? [];
  const visibleModels = models.filter((model) => !overlay.hiddenModels.includes(model.model));
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <CycloneLayerToggles entityId={item.id} overlay={overlay} />
      <div className={mapClassName}>
        <CycloneForecastCanvas item={item} models={visibleModels} overlay={overlay} />
      </div>
      {overlay.showModels && models.length > 0 && (
        <CycloneModelLegend entityId={item.id} models={models} hiddenModels={overlay.hiddenModels} />
      )}
    </div>
  );
}

function CycloneForecastCanvas({
  item,
  models,
  overlay,
}: Readonly<{ item: CyclonePoint; models: readonly ModelTrack[]; overlay: RenderCycloneOverlay }>) {
  const current = { lat: item.lat, lon: item.lon, maxWindKt: item.data.maxWindKt };
  const forecast = item.data.forecast;
  const pastTrack = item.data.pastTrack;
  const windRadii = item.data.windRadii;
  const { showCone, showForecast, showModels, showWindField } = overlay;

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
  const drawOverlay = ({
    colors,
    context,
    project,
    radius,
  }: DossierMiniGlobeDrawContext): void => {
    const accent = windColor(current.maxWindKt);
    const scene: CycloneMiniMapScene = { accent, context, current, project };
    if (showModels && models.length > 0) drawModelTracks(scene, models);
    if (showCone) drawCone(scene, forecast);
    if (showWindField && windRadii) {
      const pixelsPerNauticalMile =
        degreesToRadians(1) * radius / GeoMeasurement.NauticalMilesPerDegree;
      drawWindField(scene, windRadii, pixelsPerNauticalMile);
    }
    if (showForecast) drawOfficialTrack(scene, pastTrack, forecast);
    drawCurrentEye(scene);
  };

  return (
    <DossierMiniGlobe
      ariaLabel="Forecast track: storm position, past track, and forecast over coastline"
      camera={camera}
      drawOverlay={drawOverlay}
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
