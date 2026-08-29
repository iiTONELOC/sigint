import {
  renderSelectionIdentitiesEqual,
  type RenderSelectionOverlay,
  type RenderSelectionSnapshot,
} from "@/workers/render/protocol";
import type { RenderWorkerColors } from "@shared/domain/theme";
import {
  AircraftRoutePolylineLimit,
  splitRouteAtAircraft,
  routeGeoPoints,
  type AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import type { TrailPoint } from "@/lib/geo/trails/trailStore";
import { strokeGeoPath } from "@/lib/geo/render/path";
import { CanvasLineStyle, type Projected, type ProjFn } from "@/lib/geo/render/types";
import type { CameraPosition } from "@/workers/render/camera";
import { CAMERA_POLICY } from "@/workers/render/policy";

enum TrailRenderPolicy {
  MinimumPointCount = 2,
  GlowWidth = 6,
  GlowAlphaBase = 0.05,
  GlowAlphaSpan = 0.15,
  LineWidth = 2.5,
  LineAlphaBase = 0.3,
  LineAlphaSpan = 0.7,
  MarkerAlphaBase = 0.4,
  MarkerAlphaSpan = 0.6,
  MarkerRadius = 3,
}

enum RouteRenderPolicy {
  AheadAlpha = 0.6,
  AheadWidth = 1.25,
  DashLength = 6,
  DashGap = 4,
  FlownAlpha = 0.95,
  FlownWidth = 2.75,
  WaypointRadius = 1.4,
}

const FULL_CIRCLE_RADIANS = Math.PI * 2;

export type TrailHitTarget = Readonly<{
  point: TrailPoint;
  x: number;
  y: number;
}>;

type TrailHitTargets = Readonly<Record<string, TrailHitTarget>>;

export type SelectionOverlayPosition = CameraPosition &
  Readonly<{ interpolated: boolean }>;

export type SelectionOverlayDrawOptions = Readonly<{
  colors: RenderWorkerColors;
  context: OffscreenCanvasRenderingContext2D;
  enabled: boolean;
  position: SelectionOverlayPosition | null;
  project: ProjFn;
}>;

function strokeTrailPass(
  context: OffscreenCanvasRenderingContext2D,
  projected: readonly TrailHitTarget[],
  width: number,
  alphaBase: number,
  alphaSpan: number,
  color: string,
): void {
  context.lineWidth = width;
  context.strokeStyle = color;
  for (let index = 1; index < projected.length; index += 1) {
    const previous = projected[index - 1];
    const current = projected[index];
    if (!previous || !current) continue;
    context.globalAlpha =
      alphaBase + (index / projected.length) * alphaSpan;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.stroke();
  }
}

function projectTrail(
  trail: readonly TrailPoint[],
  position: SelectionOverlayPosition | null,
  project: ProjFn,
): TrailHitTarget[] {
  const points: TrailPoint[] = [...trail];
  if (position?.interpolated) {
    points.push({
      lat: position.latitude,
      lon: position.longitude,
      ts: Date.now(),
    });
  }
  const projected: TrailHitTarget[] = [];
  for (const point of points) {
    const position = project(point.lat, point.lon);
    if (position.z > 0) {
      projected.push({ point, x: position.x, y: position.y });
    }
  }
  return projected;
}

function drawTrail(
  context: OffscreenCanvasRenderingContext2D,
  project: ProjFn,
  trail: readonly TrailPoint[],
  position: SelectionOverlayPosition | null,
  colors: RenderWorkerColors,
): TrailHitTargets {
  const projected = projectTrail(trail, position, project);
  if (projected.length < TrailRenderPolicy.MinimumPointCount) return {};
  context.save();
  context.lineJoin = CanvasLineStyle.Round;
  context.lineCap = CanvasLineStyle.Round;
  strokeTrailPass(
    context,
    projected,
    TrailRenderPolicy.GlowWidth,
    TrailRenderPolicy.GlowAlphaBase,
    TrailRenderPolicy.GlowAlphaSpan,
    colors.accent,
  );
  strokeTrailPass(
    context,
    projected,
    TrailRenderPolicy.LineWidth,
    TrailRenderPolicy.LineAlphaBase,
    TrailRenderPolicy.LineAlphaSpan,
    colors.accent,
  );

  const hitTargets: Record<string, TrailHitTarget> = {};
  context.fillStyle = colors.bright;
  for (const [index, point] of projected.slice(0, -1).entries()) {
    context.globalAlpha =
      TrailRenderPolicy.MarkerAlphaBase +
      (index / projected.length) * TrailRenderPolicy.MarkerAlphaSpan;
    context.beginPath();
    context.arc(
      point.x,
      point.y,
      TrailRenderPolicy.MarkerRadius,
      0,
      FULL_CIRCLE_RADIANS,
    );
    context.fill();
    hitTargets[trailPointKey(point.point)] = point;
  }
  context.restore();
  return hitTargets;
}

function drawRoute(
  context: OffscreenCanvasRenderingContext2D,
  project: ProjFn,
  route: readonly AircraftRouteWaypoint[],
  position: CameraPosition,
  colors: RenderWorkerColors,
): void {
  if (route.length < AircraftRoutePolylineLimit.MinimumWaypointCount) return;
  const split = splitRouteAtAircraft(
    route,
    position.latitude,
    position.longitude,
  );
  context.save();
  context.lineJoin = CanvasLineStyle.Round;
  context.lineCap = CanvasLineStyle.Round;
  context.strokeStyle = colors.cyclones || colors.accent;
  context.globalAlpha = RouteRenderPolicy.AheadAlpha;
  context.lineWidth = RouteRenderPolicy.AheadWidth;
  context.setLineDash([
    RouteRenderPolicy.DashLength,
    RouteRenderPolicy.DashGap,
  ]);
  strokeGeoPath(context, project, routeGeoPoints(split.remaining));
  context.setLineDash([]);
  context.globalAlpha = RouteRenderPolicy.FlownAlpha;
  context.lineWidth = RouteRenderPolicy.FlownWidth;
  strokeGeoPath(context, project, routeGeoPoints(split.flown));

  context.fillStyle = colors.bright;
  for (const [latitude, longitude] of route) {
    const point = project(latitude, longitude);
    if (point.z <= 0) continue;
    context.beginPath();
    context.arc(
      point.x,
      point.y,
      RouteRenderPolicy.WaypointRadius,
      0,
      FULL_CIRCLE_RADIANS,
    );
    context.fill();
  }
  context.globalAlpha = 1;
  context.restore();
}

function segmentDistance(
  x: number,
  y: number,
  start: Projected,
  end: Projected,
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(x - start.x, y - start.y);
  }
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((x - start.x) * deltaX + (y - start.y) * deltaY) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    x - (start.x + ratio * deltaX),
    y - (start.y + ratio * deltaY),
  );
}

function trailPointKey(point: TrailPoint): string {
  return `${point.ts}:${point.lat}:${point.lon}`;
}

export class SelectionOverlayStore {
  private overlay: RenderSelectionOverlay | null = null;
  private trailHitTargets: TrailHitTargets = {};

  apply(
    overlay: RenderSelectionOverlay,
    selected: RenderSelectionSnapshot,
  ): boolean {
    if (
      overlay.selection.revision !== selected.revision ||
      !renderSelectionIdentitiesEqual(
        overlay.selection.identity,
        selected.identity,
      )
    ) {
      return false;
    }
    this.overlay = overlay;
    return true;
  }

  clear(): void {
    this.overlay = null;
    this.trailHitTargets = {};
  }

  snapshot(): RenderSelectionOverlay | null {
    return this.overlay;
  }

  draw(options: SelectionOverlayDrawOptions): void {
    const overlay = this.overlay;
    this.trailHitTargets = {};
    if (!options.enabled || !overlay) return;
    if (options.position && overlay.route) {
      drawRoute(
        options.context,
        options.project,
        overlay.route,
        options.position,
        options.colors,
      );
    }
    this.trailHitTargets = drawTrail(
      options.context,
      options.project,
      overlay.trail,
      options.position,
      options.colors,
    );
  }

  nearestTrail(x: number, y: number): TrailHitTarget | null {
    let closest: TrailHitTarget | null = null;
    let distance = CAMERA_POLICY.trailHitRadiusPx;
    for (const target of Object.values(this.trailHitTargets)) {
      const candidateDistance = Math.hypot(target.x - x, target.y - y);
      if (candidateDistance >= distance) continue;
      closest = target;
      distance = candidateDistance;
    }
    return closest;
  }

  routeContains(x: number, y: number, project: ProjFn | null): boolean {
    const route = this.overlay?.route;
    if (
      !route ||
      route.length < AircraftRoutePolylineLimit.MinimumWaypointCount ||
      !project
    ) {
      return false;
    }
    let previous: Projected | null = null;
    for (const [latitude, longitude] of route) {
      const point = project(latitude, longitude);
      if (point.z <= 0) {
        previous = null;
        continue;
      }
      if (
        Math.hypot(point.x - x, point.y - y) <
        CAMERA_POLICY.routeHitRadiusPx ||
        (previous !== null &&
          segmentDistance(x, y, previous, point) <
            CAMERA_POLICY.routeHitRadiusPx)
      ) {
        return true;
      }
      previous = point;
    }
    return false;
  }

  trailTarget(point: TrailPoint): TrailHitTarget | null {
    return this.trailHitTargets[trailPointKey(point)] ?? null;
  }
}
