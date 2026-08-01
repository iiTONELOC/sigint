// ── AircraftRouteMap ─────────────────────────────────────────────────
// Origin → destination view on an orthographic globe centered on the route.
// Rendering reuses the globe's own canvas renderers: drawLand (horizon
// clipping + theme coastFill/coast) and drawGrid with projGlobe, so the land
// matches the main globe instead of a hand-rolled copy. Only the route geometry
// (great-circle math) and the route/aircraft overlay live here.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getLand, enrichLand } from "@/lib/geo/landService";
import { getAirport, enrichAirports } from "@/lib/geo/airportService";
import { projectGeographicPoint as projGlobe } from "@/lib/geo/unitSphere";
import { drawLand } from "@/lib/geo/render/land";
import { drawGrid } from "@/lib/geo/render/grid";
import {
  CanvasLineStyle,
  type ProjFn,
} from "@/lib/geo/render/types";
import { DomEvent } from "@/runtime";
import { ButtonType } from "@/lib/ui/button";
import type { ThemeColors } from "@/config/theme";
import {
  AircraftRoutePolylineLimit,
  type AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import { TurnDeg } from "@shared/geo";

enum AircraftRouteMapMetric {
  GreatCircleSegmentCount = 48,
  HeightPx = 200,
  PaddingPx = 8,
  WidthPx = 264,
}

enum AircraftRouteMapClassName {
  HudChip = "absolute z-10 bg-sig-bg/55 border border-sig-border rounded px-1.5 py-0.5 backdrop-blur-sm",
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

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

type RouteMapPan = Readonly<{
  readonly rx: number;
  readonly ry: number;
}>;

type RouteMapCamera = Readonly<{
  readonly radius: number;
  readonly rotationX: number;
  readonly rotationY: number;
}>;

type SplitRoute = Readonly<{
  readonly flown: readonly AircraftRouteWaypoint[];
  readonly remaining: readonly AircraftRouteWaypoint[];
}>;

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

type AircraftRouteMapDrawOptions = Readonly<{
  readonly canvas: HTMLCanvasElement;
  readonly colors: ThemeColors;
  readonly destination: AircraftRouteWaypoint | null;
  readonly destinationCode: string;
  readonly heading?: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly origin: AircraftRouteWaypoint | null;
  readonly originCode: string;
  readonly pan: RouteMapPan;
  readonly trail?: readonly { lat: number; lon: number }[];
  readonly waypoints?: readonly AircraftRouteWaypoint[];
  readonly zoom: number;
}>;

function routeMapCamera(
  frameRadius: number,
  origin: AircraftRouteWaypoint | null,
  destination: AircraftRouteWaypoint | null,
  latitude: number,
  longitude: number,
  zoom: number,
  pan: RouteMapPan,
): RouteMapCamera {
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
    return {
      radius:
        Math.min(
          (frameRadius * 0.8) /
            Math.max(Math.sin(arcLength / 2), 0.05),
          frameRadius * 9,
        ) * zoom,
      rotationX: rad(midpoint.lat) + pan.rx,
      rotationY:
        rad(TurnDeg.Quarter) -
        rad(midpoint.lon + TurnDeg.Half) +
        pan.ry,
    };
  }

  return {
    radius: frameRadius * 4 * zoom,
    rotationX: rad(latitude) + pan.rx,
    rotationY:
      rad(TurnDeg.Quarter) -
      rad(longitude + TurnDeg.Half) +
      pan.ry,
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

function splitRouteAtAircraft(
  route: readonly AircraftRouteWaypoint[],
  latitude: number,
  longitude: number,
): SplitRoute {
  let segmentIndex = 0;
  let segmentFraction = 0;
  let nearestDistance = Infinity;

  for (let index = 0; index < route.length - 1; index++) {
    const startLongitude = route[index]![1];
    const startLatitude = route[index]![0];
    const longitudeDelta = route[index + 1]![1] - startLongitude;
    const latitudeDelta = route[index + 1]![0] - startLatitude;
    const segmentLength =
      longitudeDelta * longitudeDelta + latitudeDelta * latitudeDelta;
    const fraction = segmentLength > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((longitude - startLongitude) * longitudeDelta +
              (latitude - startLatitude) * latitudeDelta) /
              segmentLength,
          ),
        )
      : 0;
    const projectedLongitude = startLongitude + fraction * longitudeDelta;
    const projectedLatitude = startLatitude + fraction * latitudeDelta;
    const distance =
      (longitude - projectedLongitude) ** 2 +
      (latitude - projectedLatitude) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      segmentIndex = index;
      segmentFraction = fraction;
    }
  }

  const splitLatitude =
    route[segmentIndex]![0] +
    segmentFraction *
      (route[segmentIndex + 1]![0] - route[segmentIndex]![0]);
  const splitLongitude =
    route[segmentIndex]![1] +
    segmentFraction *
      (route[segmentIndex + 1]![1] - route[segmentIndex]![1]);
  const splitPoint: AircraftRouteWaypoint = [
    splitLatitude,
    splitLongitude,
  ];
  return {
    flown: [...route.slice(0, segmentIndex + 1), splitPoint],
    remaining: [splitPoint, ...route.slice(segmentIndex + 1)],
  };
}

function strokeRoute(
  context: CanvasRenderingContext2D,
  project: ProjFn,
  points: readonly AircraftRouteWaypoint[],
): void {
  context.beginPath();
  let penDown = false;
  for (const [latitude, longitude] of points) {
    const point = project(latitude, longitude);
    if (point.z <= 0) {
      penDown = false;
      continue;
    }
    if (penDown) context.lineTo(point.x, point.y);
    else context.moveTo(point.x, point.y);
    penDown = true;
  }
  context.stroke();
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
  strokeRoute(options.context, options.project, split.remaining);
  options.context.setLineDash([]);
  options.context.globalAlpha = 0.95;
  options.context.lineWidth = 2;
  strokeRoute(options.context, options.project, split.flown);
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
  strokeRoute(
    context,
    project,
    trail.map(
      (point): AircraftRouteWaypoint => [point.lat, point.lon],
    ),
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

function drawAircraftRouteMap(
  options: AircraftRouteMapDrawOptions,
): number | null {
  const width =
    options.canvas.clientWidth || AircraftRouteMapMetric.WidthPx;
  const height =
    options.canvas.clientHeight || AircraftRouteMapMetric.HeightPx;
  const pixelRatio = window.devicePixelRatio || 1;
  options.canvas.width = Math.round(width * pixelRatio);
  options.canvas.height = Math.round(height * pixelRatio);
  const context = options.canvas.getContext("2d");
  if (!context) return null;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const frameRadius =
    Math.min(width, height) / 2 - AircraftRouteMapMetric.PaddingPx;
  const camera = routeMapCamera(
    frameRadius,
    options.origin,
    options.destination,
    options.latitude,
    options.longitude,
    options.zoom,
    options.pan,
  );
  const project: ProjFn = (latitude, longitude) =>
    projGlobe(
      latitude,
      longitude,
      centerX,
      centerY,
      camera.radius,
      camera.rotationY,
      camera.rotationX,
    );

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, camera.radius, 0, Math.PI * 2);
  context.fillStyle = options.colors.oceanDeep;
  context.fill();
  context.clip();
  drawGrid(context, project, {
    isFlat: false,
    accentColor: options.colors.grid,
  });
  drawLand(context, project, {
    colors: options.colors,
    isFlat: false,
    horizon: {
      gcx: centerX,
      gcy: centerY,
      gr: camera.radius,
    },
  });
  context.lineCap = CanvasLineStyle.Round;
  context.lineJoin = CanvasLineStyle.Round;

  if (options.origin && options.destination) {
    drawPlannedRoute({
      colors: options.colors,
      context,
      destination: options.destination,
      latitude: options.latitude,
      longitude: options.longitude,
      origin: options.origin,
      project,
      waypoints: options.waypoints,
    });
  } else {
    drawRecordedTrail(context, project, options.colors, options.trail);
  }
  drawAircraftMarker(
    context,
    project,
    options.colors,
    options.latitude,
    options.longitude,
    options.heading,
  );
  context.restore();

  context.beginPath();
  context.arc(centerX, centerY, camera.radius, 0, Math.PI * 2);
  context.strokeStyle = options.colors.coast;
  context.globalAlpha = 0.4;
  context.lineWidth = 1;
  context.stroke();
  context.globalAlpha = 1;

  if (options.origin && options.destination) {
    context.font = "700 11px monospace";
    context.textAlign = "center";
    drawRouteEndpoint(
      context,
      project,
      options.colors,
      options.originCode,
      options.origin,
    );
    drawRouteEndpoint(
      context,
      project,
      options.colors,
      options.destinationCode,
      options.destination,
    );
  }
  return camera.radius;
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
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef({ ry: 0, rx: 0 });
  const dimsRef = useRef({ r: 1 });
  const [land, setLand] = useState(() => getLand());
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Reset pan + zoom when the flight changes.
  useEffect(() => {
    panRef.current = { ry: 0, rx: 0 };
    setZoom(1);
  }, [originCode, destCode]);

  useEffect(() => {
    if (land.length === 0) enrichLand((l) => setLand(l));
    enrichAirports(() => setLoaded(true));
  }, [land.length]);

  const o = getAirport(originCode);
  const d = getAirport(destCode);
  const colors = theme.colors;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = (): void => {
      const radius = drawAircraftRouteMap({
        canvas,
        colors,
        destination: d,
        destinationCode: destCode,
        heading,
        latitude: lat,
        longitude: lon,
        origin: o,
        originCode,
        pan: panRef.current,
        trail,
        waypoints,
        zoom,
      });
      if (radius !== null) dimsRef.current.r = radius;
    };

    // Drag to pan (rotate the little globe).
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rr = dimsRef.current.r || 1;
      // Pan like a map: content follows the cursor on both axes.
      panRef.current.ry += (e.clientX - lx) / rr;
      panRef.current.rx = Math.max(
        -1.2,
        Math.min(1.2, panRef.current.rx + (e.clientY - ly) / rr),
      );
      lx = e.clientX;
      ly = e.clientY;
      draw();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    canvas.addEventListener(DomEvent.PointerDown, onDown);
    canvas.addEventListener(DomEvent.PointerMove, onMove);
    canvas.addEventListener(DomEvent.PointerUp, onUp);
    canvas.addEventListener(DomEvent.PointerCancel, onUp);
    return () => {
      ro.disconnect();
      canvas.removeEventListener(DomEvent.PointerDown, onDown);
      canvas.removeEventListener(DomEvent.PointerMove, onMove);
      canvas.removeEventListener(DomEvent.PointerUp, onUp);
      canvas.removeEventListener(DomEvent.PointerCancel, onUp);
    };
  }, [o, d, lat, lon, heading, waypoints, trail, land, colors, loaded, originCode, destCode, zoom]);

  const zoomBtn =
    "w-6 h-6 flex items-center justify-center rounded bg-sig-panel/80 border border-sig-border/60 text-sig-dim hover:text-sig-accent hover:border-sig-accent/50 transition-colors touch-target";

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block rounded border border-sig-border touch-none cursor-grab active:cursor-grabbing"
        aria-label="Route map: aircraft position and track over coastline"
      />

      {hud && (
        <>
          {hud.mach && <HudChip className="top-1.5 left-1.5" label="MACH" value={hud.mach} />}
          {hud.tas && <HudChip className="top-1.5 right-10" label="TAS" value={hud.tas} />}
          {hud.heading && <HudChip className="bottom-1.5 left-1.5" label="HDG" value={hud.heading} />}
          {hud.eta && <HudChip className="bottom-1.5 right-1.5" label="ETA" value={hud.eta} />}
        </>
      )}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        <button
          type={ButtonType.Button}
          className={zoomBtn}
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(8, z * 1.4))}
        >
          +
        </button>
        <button
          type={ButtonType.Button}
          className={zoomBtn}
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))}
        >
          −
        </button>
      </div>
    </div>
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
