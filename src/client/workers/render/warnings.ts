// ── Tropical watch/warning area renderer (worker) ────────────────────
// Bundled TS imported by pointWorker.ts. Draws NWS Alerts polygons
// (Polygon / MultiPolygon, in [lon, lat]) as translucent filled regions on the
// globe / flat map, UNDER the storm marker/cone so the eye + track stay legible.
//
// The globe-aware polygon primitives (simpleDraw / drawClippedPoly) live in the
// worker shell; they're passed in via the render context so this module stays
// free of worker globals and bundles cleanly.

import type { Ctx, Projected, ProjFn } from "@/features/environmental/cyclones/render/cycloneGeometry";

export type PolyPrims = {
  simpleDraw: (ctx: Ctx, pts: Projected[], fill: string, stroke: string, alpha: number) => void;
  drawClippedPoly: (
    ctx: Ctx,
    pts: Projected[],
    gcx: number,
    gcy: number,
    gr: number,
    fill: string,
    stroke: string,
    alpha: number,
  ) => void;
};

/** Per-frame render context — bundles the canvas, projection, globe metrics and
 *  polygon primitives so the draw helpers take one object, not a dozen args. */
type WarningCtx = {
  ctx: Ctx;
  proj: ProjFn;
  isFlat: boolean;
  gcx: number;
  gcy: number;
  gr: number;
  prims: PolyPrims;
};

export type WarningFeature = {
  id?: string;
  kind?: string;
  geometry?: { type?: string; coordinates?: unknown };
};

/** Walk one GeoJSON ring ([[lon,lat],…]) into projected screen points. */
function projectRing(ring: ReadonlyArray<ReadonlyArray<number>>, proj: ProjFn): Projected[] {
  const out: Projected[] = [];
  for (const c of ring) {
    const [lon, lat] = c;
    if (typeof lat === "number" && typeof lon === "number") out.push(proj(lat, lon));
  }
  return out;
}

/** Draw one projected ring with globe-aware clipping (mirrors drawLand). */
function drawRing(rc: WarningCtx, pts: Projected[], fill: string, alpha: number): void {
  if (pts.length < 3) return;
  if (rc.isFlat) {
    rc.prims.simpleDraw(rc.ctx, pts, fill, fill, alpha);
    return;
  }
  if (!pts.some((p) => p.z > 0)) return;
  if (pts.every((p) => p.z > 0)) rc.prims.simpleDraw(rc.ctx, pts, fill, fill, alpha);
  else rc.prims.drawClippedPoly(rc.ctx, pts, rc.gcx, rc.gcy, rc.gr, fill, fill, alpha);
}

/** Outer rings of a Polygon / each MultiPolygon (holes skipped — rare here). */
function outerRings(geometry: WarningFeature["geometry"]): number[][][] {
  if (!geometry || typeof geometry !== "object" || !geometry.coordinates) return [];
  if (geometry.type === "Polygon") {
    const ring = (geometry.coordinates as number[][][])[0];
    return ring ? [ring] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][])
      .map((poly) => poly[0])
      .filter((ring): ring is number[][] => Boolean(ring));
  }
  return [];
}

/** Alpha for a feature — warnings read stronger than watches; the selected
 *  area pulses brighter so the click reads on the map. */
function featureAlpha(f: WarningFeature, selectedId: string | null, t: number): number {
  const isWarn = f.kind === "warning";
  if (selectedId && f.id === selectedId) {
    const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 4);
    return (isWarn ? 0.42 : 0.34) + 0.2 * pulse;
  }
  return isWarn ? 0.22 : 0.14;
}

/** Draw all warning/watch features. warnColor/watchColor come from the theme. */
export function drawWarnings(
  rc: WarningCtx,
  features: ReadonlyArray<WarningFeature> | null | undefined,
  colors: { warn: string; watch: string },
  selectedId: string | null,
  t: number,
): void {
  if (!features || features.length === 0) return;
  for (const f of features) {
    if (!f) continue;
    const fill = f.kind === "warning" ? colors.warn : colors.watch;
    const alpha = featureAlpha(f, selectedId, t);
    for (const ring of outerRings(f.geometry)) {
      drawRing(rc, projectRing(ring, rc.proj), fill, alpha);
    }
  }
}
