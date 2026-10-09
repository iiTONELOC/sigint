import { getLand } from "@/lib/geo/landService";
import {
  POLYGON_POLICY,
  drawClippedPoly,
  projectedRingPath,
  simpleDraw,
  splitAntimeridianSegments,
  strokeOutlinePaths,
  type PathOutline,
} from "@/lib/geo/render/polygon";
import type {
  HorizonCircle,
  LandColors,
  Projected,
  ProjFn,
  RenderContext2D,
} from "@/lib/geo/render/types";

export function drawProjectedLandRing(
  ctx: RenderContext2D,
  points: readonly Projected[],
  colors: LandColors,
  alpha: number = POLYGON_POLICY.defaultAlpha,
  horizon: HorizonCircle | null = null,
): void {
  if (points.length < POLYGON_POLICY.minimumRingPoints) return;
  if (!points.some((point) => point.z > 0)) return;

  if (!horizon || points.every((point) => point.z > 0)) {
    simpleDraw(ctx, points, colors.coastFill, colors.coast, alpha);
    return;
  }

  drawClippedPoly(
    ctx,
    points,
    horizon,
    colors.coastFill,
    colors.coast,
    alpha,
  );
}

export function drawFlatLandRing(
  ctx: RenderContext2D,
  coordinates: readonly (readonly number[])[],
  project: ProjFn,
  colors: LandColors,
  alpha: number = POLYGON_POLICY.defaultAlpha,
): void {
  for (const segment of splitAntimeridianSegments(coordinates, project)) {
    simpleDraw(ctx, segment, colors.coastFill, colors.coast, alpha);
  }
}

export type LandDrawOptions = Readonly<{
  colors: LandColors;
  isFlat: boolean;
  horizon: HorizonCircle;
  alpha?: number;
}>;

export function drawLand(
  ctx: RenderContext2D,
  proj: ProjFn,
  options: LandDrawOptions,
): void {
  const alpha = options.alpha ?? POLYGON_POLICY.defaultAlpha;

  for (const polygon of getLand()) {
    const ring = polygon[0];
    if (!ring) continue;

    if (options.isFlat) {
      drawFlatLandRing(ctx, ring, proj, options.colors, alpha);
      continue;
    }

    drawProjectedLandRing(ctx, projectRing(ring, proj), options.colors, alpha, options.horizon);
  }
}

function projectRing(
  ring: readonly (readonly number[])[],
  proj: ProjFn,
): Projected[] {
  const points: Projected[] = [];
  for (const [longitude, latitude] of ring) {
    if (typeof longitude !== "number" || typeof latitude !== "number") {
      continue;
    }
    points.push(proj(latitude, longitude));
  }
  return points;
}

export type CoastOutline = PathOutline & Readonly<{
  isFlat: boolean;
  horizon: HorizonCircle;
}>;

export function strokeCoastlines(
  ctx: RenderContext2D,
  proj: ProjFn,
  options: CoastOutline,
): void {
  const paths = getLand().flatMap((polygon) => {
    const ring = polygon[0];
    if (!ring) return [];
    if (options.isFlat) return splitAntimeridianSegments(ring, proj);
    return [projectedRingPath(projectRing(ring, proj), options.horizon)];
  });
  strokeOutlinePaths(ctx, paths, options);
}
