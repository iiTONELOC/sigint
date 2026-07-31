import type {
  HorizonCircle,
  Projected,
  ProjFn,
  Pt,
  RenderContext2D,
} from "@/lib/geo/render/types";

export type PolygonPolicy = Readonly<{
  minimumRingPoints: number;
  horizonArcSamples: number;
  strokeWidth: number;
  strokeAlphaGain: number;
  reentryMergeDistance: number;
  antimeridianJumpDegrees: number;
  defaultAlpha: number;
}>;

export const POLYGON_POLICY: PolygonPolicy = {
  minimumRingPoints: 3,
  horizonArcSamples: 12,
  strokeWidth: 0.7,
  strokeAlphaGain: 0.1,
  reentryMergeDistance: 1,
  antimeridianJumpDegrees: 120,
  defaultAlpha: 0.7,
};

enum PolygonFillRule {
  EvenOdd = "evenodd",
}

function edgeLerp(a: Projected, b: Projected): Pt {
  const t = a.z / (a.z - b.z);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function arcPts(
  cx: number,
  cy: number,
  r: number,
  a1: number,
  a2: number,
  samples: number = POLYGON_POLICY.horizonArcSamples,
): Pt[] {
  let diff = a2 - a1;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return Array.from({ length: samples }, (_, index) => {
    const angle = a1 + (diff * (index + 1)) / samples;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
}

function findReentryPoint(
  points: readonly Projected[],
  startIndex: number,
): Pt | null {
  const count = points.length;
  for (let step = 1; step < count; step++) {
    const previous = points[(startIndex + step) % count];
    const next = points[(startIndex + step + 1) % count];
    if (previous && next && previous.z <= 0 && next.z > 0) {
      return edgeLerp(previous, next);
    }
  }
  return null;
}

function appendPath(
  ctx: RenderContext2D,
  path: readonly Pt[],
): void {
  path.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

export function fillStrokePaths(
  ctx: RenderContext2D,
  paths: readonly (readonly Pt[])[],
  fillColor: string,
  strokeColor: string,
  alpha: number,
): void {
  const drawable = paths.filter(
    (path) => path.length >= POLYGON_POLICY.minimumRingPoints,
  );
  if (drawable.length === 0) return;
  ctx.beginPath();
  for (const path of drawable) appendPath(ctx, path);
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = alpha;
  ctx.fill(PolygonFillRule.EvenOdd);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = POLYGON_POLICY.strokeWidth;
  ctx.globalAlpha = alpha + POLYGON_POLICY.strokeAlphaGain;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function fillStrokePath(
  ctx: RenderContext2D,
  path: readonly Pt[],
  fillColor: string,
  strokeColor: string,
  alpha: number,
): void {
  fillStrokePaths(ctx, [path], fillColor, strokeColor, alpha);
}

export function simpleDraw(
  ctx: RenderContext2D,
  points: readonly Pt[],
  fillColor: string,
  strokeColor: string,
  alpha: number = POLYGON_POLICY.defaultAlpha,
): void {
  fillStrokePath(ctx, points, fillColor, strokeColor, alpha);
}

function appendExitTransition(
  path: Pt[],
  points: readonly Projected[],
  index: number,
  current: Projected,
  next: Projected,
  horizon: HorizonCircle,
): void {
  const exit = edgeLerp(current, next);
  path.push(exit);
  const reentry = findReentryPoint(points, index);
  if (!reentry) return;
  const exitAngle = Math.atan2(exit.y - horizon.gcy, exit.x - horizon.gcx);
  const reentryAngle = Math.atan2(
    reentry.y - horizon.gcy,
    reentry.x - horizon.gcx,
  );
  path.push(
    ...arcPts(horizon.gcx, horizon.gcy, horizon.gr, exitAngle, reentryAngle),
    reentry,
  );
}

function appendReentryTransition(
  path: Pt[],
  current: Projected,
  next: Projected,
): void {
  const reentry = edgeLerp(current, next);
  const last = path.at(-1);
  if (
    !last ||
    Math.abs(last.x - reentry.x) > POLYGON_POLICY.reentryMergeDistance ||
    Math.abs(last.y - reentry.y) > POLYGON_POLICY.reentryMergeDistance
  ) {
    path.push(reentry);
  }
}

export function drawClippedPoly(
  ctx: RenderContext2D,
  points: readonly Projected[],
  horizon: HorizonCircle,
  fillColor: string,
  strokeColor: string,
  alpha: number = POLYGON_POLICY.defaultAlpha,
): void {
  fillStrokePath(
    ctx,
    projectedRingPath(points, horizon),
    fillColor,
    strokeColor,
    alpha,
  );
}

export function projectedRingPath(
  points: readonly Projected[],
  horizon: HorizonCircle | null,
): readonly Pt[] {
  if (
    points.length < POLYGON_POLICY.minimumRingPoints ||
    !points.some((point) => point.z > 0)
  ) {
    return [];
  }
  if (!horizon || points.every((point) => point.z > 0)) {
    return points.map((point) => ({ x: point.x, y: point.y }));
  }

  const path: Pt[] = [];
  const count = points.length;

  for (let index = 0; index < count; index++) {
    const current = points[index];
    const next = points[(index + 1) % count];
    if (!current || !next) continue;
    const currentVisible = current.z > 0;
    const nextVisible = next.z > 0;
    if (currentVisible) path.push({ x: current.x, y: current.y });
    if (currentVisible === nextVisible) continue;
    if (currentVisible) {
      appendExitTransition(path, points, index, current, next, horizon);
    } else {
      appendReentryTransition(path, current, next);
    }
  }
  return path;
}

export function splitAntimeridianSegments(
  coordinates: readonly (readonly number[])[],
  project: ProjFn,
): Projected[][] {
  const segments: Projected[][] = [];
  let segment: Projected[] = [];
  let previousLongitude: number | null = null;

  for (const coordinate of coordinates) {
    const [longitude, latitude] = coordinate;
    if (typeof longitude !== "number" || typeof latitude !== "number") continue;
    if (
      previousLongitude !== null &&
      Math.abs(longitude - previousLongitude) >
        POLYGON_POLICY.antimeridianJumpDegrees
    ) {
      if (segment.length >= POLYGON_POLICY.minimumRingPoints) {
        segments.push(segment);
      }
      segment = [];
    }
    segment.push(project(latitude, longitude));
    previousLongitude = longitude;
  }

  if (segment.length >= POLYGON_POLICY.minimumRingPoints) {
    segments.push(segment);
  }
  return segments;
}
