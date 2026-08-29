import { useEffect, useReducer } from "react";
import {
  DossierMiniGlobe,
  type DossierMiniGlobeCamera,
  type DossierMiniGlobeDrawContext,
} from "@/dossier";
import { getAirport, enrichAirports } from "@/lib/geo/airportService";
import type { ProjFn } from "@/lib/geo/render/types";
import { strokeGeoPath } from "@/lib/geo/render/path";
import type { ThemeColors } from "@/theme";
import {
  AircraftRoutePolylineLimit,
  splitRouteAtAircraft,
  routeGeoPoints,
  type AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import { AngleConversion, type GeoPoint } from "@shared/geo";

enum AircraftRouteMapMetric {
  FallbackRadiusScale = 4,
  GreatCircleSegmentCount = 48,
  MaximumRadiusScale = 9,
  MaximumZoom = 8,
  MinimumRadiusFactor = 0.05,
  MinimumZoom = 0.5,
  RouteFrameRatio = 0.8,
}

enum AircraftRouteMapClassName {
  HudChip = "absolute z-(--layer-content) bg-sig-bg/55 border border-sig-border rounded px-1.5 py-0.5 backdrop-blur-sm",
}

const rad = (degrees: number) => degrees * AngleConversion.RadiansPerDegree;
const deg = (radians: number) => radians / AngleConversion.RadiansPerDegree;

function gcDist(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dPhi = rad(bLat - aLat);
  const dLam = rad(bLon - aLon);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLam / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function gcPoint(aLat: number, aLon: number, bLat: number, bLon: number, f: number) {
  const d = gcDist(aLat, aLon, bLat, bLon);
  if (d === 0) return { lat: aLat, lon: aLon };
  const phi1 = rad(aLat), lam1 = rad(aLon), phi2 = rad(bLat), lam2 = rad(bLon);
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
  const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

type PlannedRouteDrawOptions = Readonly<{
  readonly colors: ThemeColors;
  readonly context: CanvasRenderingContext2D;
  readonly destination: AircraftRouteWaypoint;
  readonly latitude: number;
  readonly longitude: number;
  readonly origin: AircraftRouteWaypoint;
  readonly project: ProjFn;
  readonly waypoints?: readonly AircraftRouteWaypoint[];
}>;

function routeMapCamera(
  origin: AircraftRouteWaypoint | null,
  destination: AircraftRouteWaypoint | null,
  latitude: number,
  longitude: number,
): DossierMiniGlobeCamera {
  let centerLatitude = latitude;
  let centerLongitude = longitude;
  let radiusScale = AircraftRouteMapMetric.FallbackRadiusScale;
  let spanDegrees = 0;
  if (origin && destination) {
    const midpoint = gcPoint(
      origin[0],
      origin[1],
      destination[0],
      destination[1],
      0.5,
    );
    const arcLength = gcDist(
      origin[0],
      origin[1],
      destination[0],
      destination[1],
    );
    centerLatitude = midpoint.lat;
    centerLongitude = midpoint.lon;
    radiusScale = Math.min(
      AircraftRouteMapMetric.RouteFrameRatio /
        Math.max(
          Math.sin(arcLength / 2),
          AircraftRouteMapMetric.MinimumRadiusFactor,
        ),
      AircraftRouteMapMetric.MaximumRadiusScale,
    );
    spanDegrees = deg(arcLength);
  }
  return {
    centerLatitude,
    centerLongitude,
    maximumZoom: AircraftRouteMapMetric.MaximumZoom,
    minimumZoom: AircraftRouteMapMetric.MinimumZoom,
    radiusScale,
    spanDegrees,
  };
}

function generatedRoute(
  origin: AircraftRouteWaypoint,
  destination: AircraftRouteWaypoint,
): AircraftRouteWaypoint[] {
  const route: AircraftRouteWaypoint[] = [];
  for (
    let index = 0;
    index <= AircraftRouteMapMetric.GreatCircleSegmentCount;
    index++
  ) {
    const point = gcPoint(
      origin[0],
      origin[1],
      destination[0],
      destination[1],
      index / AircraftRouteMapMetric.GreatCircleSegmentCount,
    );
    route.push([point.lat, point.lon]);
  }
  return route;
}

function completeRoute(
  origin: AircraftRouteWaypoint,
  destination: AircraftRouteWaypoint,
  waypoints: readonly AircraftRouteWaypoint[] | undefined,
): readonly AircraftRouteWaypoint[] {
  return waypoints &&
    waypoints.length >= AircraftRoutePolylineLimit.MinimumWaypointCount
    ? waypoints
    : generatedRoute(origin, destination);
}

function drawRouteWaypoints(
  context: CanvasRenderingContext2D,
  project: ProjFn,
  colors: ThemeColors,
  waypoints: readonly AircraftRouteWaypoint[] | undefined,
): void {
  if (
    !waypoints ||
    waypoints.length < AircraftRoutePolylineLimit.MinimumWaypointCount
  ) {
    return;
  }

  context.fillStyle = colors.bright;
  context.globalAlpha = 0.85;
  for (const [latitude, longitude] of waypoints) {
    const point = project(latitude, longitude);
    if (point.z > 0) {
      context.beginPath();
      context.arc(point.x, point.y, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

function drawPlannedRoute(options: PlannedRouteDrawOptions): void {
  const route = completeRoute(
    options.origin,
    options.destination,
    options.waypoints,
  );
  const split = splitRouteAtAircraft(
    route,
    options.latitude,
    options.longitude,
  );

  options.context.strokeStyle = options.colors.aircraft;
  options.context.globalAlpha = 0.3;
  options.context.lineWidth = 1.5;
  options.context.setLineDash([3, 3]);
  strokeGeoPath(options.context, options.project, routeGeoPoints(split.remaining));
  options.context.setLineDash([]);
  options.context.globalAlpha = 0.95;
  options.context.lineWidth = 2;
  strokeGeoPath(options.context, options.project, routeGeoPoints(split.flown));
  options.context.globalAlpha = 1;
  drawRouteWaypoints(
    options.context,
    options.project,
    options.colors,
    options.waypoints,
  );
}

function drawRecordedTrail(
  context: CanvasRenderingContext2D,
  project: ProjFn,
  colors: ThemeColors,
  trail: readonly { lat: number; lon: number }[] | undefined,
): void {
  if (
    !trail ||
    trail.length < AircraftRoutePolylineLimit.MinimumWaypointCount
  ) {
    return;
  }

  context.strokeStyle = colors.aircraft;
  context.globalAlpha = 0.9;
  context.lineWidth = 2;
  strokeGeoPath(
    context,
    project,
    trail.map((point): GeoPoint => [point.lon, point.lat]),
  );
  context.globalAlpha = 1;
}

function drawAircraftMarker(
  context: CanvasRenderingContext2D,
  project: ProjFn,
  colors: ThemeColors,
  latitude: number,
  longitude: number,
  heading: number | undefined,
): void {
  const position = project(latitude, longitude);
  if (position.z <= 0) return;

  const latitudeRadius = Math.max(0.2, Math.cos(rad(latitude)));
  const headingPoint = project(
    latitude + Math.cos(rad(heading ?? 0)) * 0.4,
    longitude + (Math.sin(rad(heading ?? 0)) * 0.4) / latitudeRadius,
  );
  const angle = Math.atan2(
    headingPoint.y - position.y,
    headingPoint.x - position.x,
  );
  context.save();
  context.translate(position.x, position.y);
  context.rotate(angle);
  context.fillStyle = colors.aircraft;
  context.strokeStyle = colors.oceanDeep;
  context.lineWidth = 0.75;
  context.beginPath();
  context.moveTo(7, 0);
  context.lineTo(-5, 4.5);
  context.lineTo(-2, 0);
  context.lineTo(-5, -4.5);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawRouteEndpoint(
  context: CanvasRenderingContext2D,
  project: ProjFn,
  colors: ThemeColors,
  code: string,
  coordinate: AircraftRouteWaypoint,
): void {
  const point = project(coordinate[0], coordinate[1]);
  if (point.z <= 0) return;
  context.fillStyle = colors.dim;
  context.beginPath();
  context.arc(point.x, point.y, 3, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = colors.text;
  context.fillText(code, point.x, point.y - 6);
}

type RouteHud = {
  readonly mach?: string;
  readonly tas?: string;
  readonly heading?: string;
  readonly eta?: string;
};

export function AircraftRouteMap({
  originCode,
  destCode,
  lat,
  lon,
  heading,
  waypoints,
  trail,
  hud,
}: {
  readonly originCode: string;
  readonly destCode: string;
  readonly lat: number;
  readonly lon: number;
  readonly heading?: number;
  readonly waypoints?: readonly AircraftRouteWaypoint[];
  readonly trail?: readonly { lat: number; lon: number }[];
  readonly hud?: RouteHud;
}) {
  const [, redraw] = useReducer((revision: number) => revision + 1, 0);

  useEffect(() => {
    enrichAirports(redraw);
  }, []);

  const origin = getAirport(originCode);
  const destination = getAirport(destCode);
  const camera = routeMapCamera(origin, destination, lat, lon);
  const drawOverlay = ({
    colors,
    context,
    project,
  }: DossierMiniGlobeDrawContext): void => {
    if (origin && destination) {
      drawPlannedRoute({
        colors,
        context,
        destination,
        latitude: lat,
        longitude: lon,
        origin,
        project,
        waypoints,
      });
    } else {
      drawRecordedTrail(context, project, colors, trail);
    }
    drawAircraftMarker(context, project, colors, lat, lon, heading);
  };
  const drawForeground = ({
    colors,
    context,
    project,
  }: DossierMiniGlobeDrawContext): void => {
    if (!origin || !destination) return;
    context.font = "700 11px monospace";
    context.textAlign = "center";
    drawRouteEndpoint(context, project, colors, originCode, origin);
    drawRouteEndpoint(context, project, colors, destCode, destination);
  };

  return (
    <DossierMiniGlobe
      ariaLabel="Route map: aircraft position and track over coastline"
      camera={camera}
      compactBorderRadius={true}
      drawForeground={drawForeground}
      drawOverlay={drawOverlay}
      resetKey={`${originCode}:${destCode}`}
    >
      {hud && (
        <>
          {hud.mach && <HudChip className="top-1.5 left-1.5" label="MACH" value={hud.mach} />}
          {hud.tas && <HudChip className="top-1.5 right-10" label="TAS" value={hud.tas} />}
          {hud.heading && <HudChip className="bottom-1.5 left-1.5" label="HDG" value={hud.heading} />}
          {hud.eta && <HudChip className="bottom-1.5 right-1.5" label="ETA" value={hud.eta} />}
        </>
      )}
    </DossierMiniGlobe>
  );
}

function HudChip({
  className,
  label,
  value,
}: {
  readonly className: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div
      className={`${AircraftRouteMapClassName.HudChip} ${className}`}
    >
      <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim leading-none">
        {label}
      </div>
      <div className="text-(length:--sig-text-sm) text-sig-bright leading-tight">{value}</div>
    </div>
  );
}
