import { getLand } from "@/lib/geo/landService";
import {
  POLYGON_POLICY,
  drawClippedPoly,
  simpleDraw,
  splitAntimeridianSegments,
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

    const points: Projected[] = [];
    for (const coordinate of ring) {
      const [longitude, latitude] = coordinate;
      if (typeof longitude !== "number" || typeof latitude !== "number") {
        continue;
      }
      points.push(proj(latitude, longitude));
    }
    drawProjectedLandRing(ctx, points, options.colors, alpha, options.horizon);
  }
}
