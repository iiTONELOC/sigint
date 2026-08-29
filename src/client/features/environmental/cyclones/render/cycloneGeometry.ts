// ── Shared cyclone render geometry ───────────────────────────────────
// Geometry and painters shared by BOTH the globe worker (scene/cycloneLayer.ts)
// and the dossier mini-map (CycloneForecastMiniMap). Single source of truth so
// the two surfaces draw identical cones, wind footprints, and tracks.
//
// Geometry is parameterised by a `proj` callback so it works for the worker's
// projGlobe and the mini-map's local projection alike. The painters take a
// canvas context and the pre-computed screen points.

import type { ProjFn, Pt, RenderContext2D } from "@/lib/geo/render/types";
import { strokePoints, tracePoints } from "@/lib/geo/render/path";
import type { CycloneForecastFact } from "@shared/domain/cyclones";
import { GeoMeasurement } from "@shared/geo";
import { windColor, windRadiiBandColor } from "../classification";

// Quadrant center bearings (compass deg, 0=N clockwise): NE, SE, SW, NW.
const WR_QUAD_CENTER = [45, 135, 225, 315];
const WR_STEPS = 64;

/** Smoothstep-interpolated radius (nm) at a compass bearing from the four
 *  per-quadrant values [NE, SE, SW, NW], so a one-sided storm tapers smoothly
 *  instead of forming flat cardinal walls. */
export function wrRadiusAt(q: readonly number[], bearing: number): number {
  const hit = WR_QUAD_CENTER.map((center, i) => ({
    i,
    d: (((bearing - center) % 360) + 360) % 360,
  })).find(({ d }) => d <= 90);
  if (!hit) return 0;
  const v0 = Math.max(0, q[hit.i] ?? 0);
  const v1 = Math.max(0, q[(hit.i + 1) % 4] ?? 0);
  const t = hit.d / 90;
  return v0 + (v1 - v0) * (t * t * (3 - 2 * t)); // smoothstep
}

/** One wind-radii band as a closed loop of screen points around the eye.
 *  `pxPerNm` converts nm → screen px. Empty if the band has no extent. */
export function windRadiiBandPoints(
  q: readonly number[],
  eyeX: number,
  eyeY: number,
  pxPerNm: number,
): Array<[number, number]> {
  if (!q.some((v) => v > 0)) return [];
  return Array.from({ length: WR_STEPS + 1 }, (_, i) => {
    const bearing = (i / WR_STEPS) * 360;
    const r = wrRadiusAt(q, bearing) * pxPerNm;
    const a = ((bearing - 90) * Math.PI) / 180;
    return [eyeX + Math.cos(a) * r, eyeY + Math.sin(a) * r] as [number, number];
  });
}

type Point2 = [number, number];

export type ConeSegment = {
  /** outer rim quad: [aOuter, bOuter, bInner, aInner] screen points */
  quad: [Point2, Point2, Point2, Point2];
  /** taper factor 0 (near) → 1 (far), for alpha fade */
  t: number;
  /** forecast max wind (kt) at this band's NEAR point, for intensity coloring,
   *  so each band reads as the intensity at the position it leaves. 0 when the
   *  forecast carries no wind. */
  maxWindKt: number;
};

type ConePoint = { x: number; y: number; r: number; h: number; w: number; nx: number; ny: number };

/** Per-point rim normal: at an interior point, the miter (average) of the two
 *  adjacent segment normals so neighboring bands SHARE the rim corner and don't
 *  leave a wedge gap where the track turns. Endpoints use their one segment. */
function riveNormals(pts: ConePoint[]): void {
  const seg: Point2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    const dy = pts[i + 1]!.y - pts[i]!.y;
    const len = Math.hypot(dx, dy) || 1;
    seg.push([-dy / len, dx / len]); // left normal of segment i
  }
  for (let i = 0; i < pts.length; i++) {
    const a = seg[i - 1]; // segment entering point i
    const b = seg[i]; // segment leaving point i
    let nx: number, ny: number;
    if (a && b) {
      // Miter: average the two normals, renormalize, then scale by 1/cos(θ/2)
      // so the rim stays at radius r through the bend.
      let mx = a[0] + b[0];
      let my = a[1] + b[1];
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml;
      my /= ml;
      const cos = mx * a[0] + my * a[1]; // = cos(half-angle)
      const scale = cos > 0.2 ? 1 / cos : 1; // clamp absurd miters at sharp turns
      nx = mx * scale;
      ny = my * scale;
    } else {
      const s = (a ?? b)!;
      nx = s[0];
      ny = s[1];
    }
    pts[i]!.nx = nx;
    pts[i]!.ny = ny;
  }
}

/** Tapered segmented cone of uncertainty: a band between consecutive forecast
 *  points whose half-width is the NHC average track-error radius (nm) at that
 *  lead time. Starts from the eye (r=0) so there's no bulbous base. Rim corners
 *  are mitered at turns so bands meet without gaps. Each band carries the far
 *  point's forecast wind so the caller can color by intensity. */
export function segmentedConeSegments(
  eyeX: number,
  eyeY: number,
  forecast: ReadonlyArray<CycloneForecastFact>,
  proj: ProjFn,
  eyeWindKt = 0,
): ConeSegment[] {
  const pts: ConePoint[] = [{ x: eyeX, y: eyeY, r: 0, h: 0, w: eyeWindKt, nx: 0, ny: 0 }];
  for (const fc of forecast) {
    const p = proj(fc.lat, fc.lon);
    if (p.z <= 0) continue;
    const nb = proj(fc.lat + 1, fc.lon);
    if (nb.z <= 0) continue;
    const pxPerDeg = Math.hypot(nb.x - p.x, nb.y - p.y);
    pts.push({
      x: p.x, y: p.y,
      r:
        (fc.errorRadiusNm /
          GeoMeasurement.NauticalMilesPerDegree) *
        pxPerDeg,
      h: fc.fcstHour,
      w: fc.maxWindKt ?? 0,
      nx: 0, ny: 0,
    });
  }
  const last = pts.at(-1);
  if (!last || pts.length < 2) return [];
  const maxH = last.h || 1;
  riveNormals(pts);

  const segs: ConeSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i]!;
    const B = pts[i + 1]!;
    segs.push({
      t: B.h / maxH,
      // Color by the NEAR point so the band leaving each position reads as the
  // intensity AT that position, the band off the eye matches the storm's
      // current category, not the next forecast point's.
      maxWindKt: A.w,
      quad: [
        [A.x + A.nx * A.r, A.y + A.ny * A.r],
        [B.x + B.nx * B.r, B.y + B.ny * B.r],
        [B.x - B.nx * B.r, B.y - B.ny * B.r],
        [A.x - A.nx * A.r, A.y - A.ny * A.r],
      ],
    });
  }
  return segs;
}

export type WindRadiiBand = Readonly<{
  threshold: number;
  quadrants: readonly number[];
  fillAlpha: number;
}>;

/** The eye on screen plus the scale that turns nautical miles into pixels. */
export type EyeScale = Pt & Readonly<{ pixelsPerNm: number }>;

const WIND_BAND_RIM_WIDTH = 1;

/** Fill each wind band around the eye; a positive `strokeAlpha` also rims it. */
export function paintWindRadiiBands(
  context: RenderContext2D,
  eye: EyeScale,
  bands: Iterable<WindRadiiBand>,
  strokeAlpha = 0,
): void {
  for (const band of bands) {
    const points = windRadiiBandPoints(band.quadrants, eye.x, eye.y, eye.pixelsPerNm);
    if (points.length === 0) continue;
    tracePoints(context, points, true);
    context.fillStyle = windRadiiBandColor(band.threshold);
    context.globalAlpha = band.fillAlpha;
    context.fill();
    if (strokeAlpha <= 0) continue;
    context.globalAlpha = strokeAlpha;
    context.lineWidth = WIND_BAND_RIM_WIDTH;
    context.strokeStyle = windRadiiBandColor(band.threshold);
    context.stroke();
  }
}

enum ConeFill {
  BaseAlpha = 0.3,
  FadeSpan = 0.18,
}

enum ConeStroke {
  DividerStrokeWidth = 1,
  RimStrokeWidth = 1.25,
  DividerFadeSpan = 0.3,
  RimFadeSpan = 0.35,
  DividerBaseAlpha = 0.5,
  RimBaseAlpha = 0.6,
}

export type ConePaint = Readonly<{
  /** Multiplies every alpha; 1 on a flat surface. */
  depthAlpha: number;
  /** Colour for a segment whose forecast carries no wind. */
  fallbackColor: string;
  /** Stroke the outer rims and the segment dividers as the globe does. */
  rims: boolean;
}>;

function paintConeRims(
  context: RenderContext2D,
  segment: ConeSegment,
  color: string,
  depthAlpha: number,
): void {
  const [nearLeft, farLeft, farRight, nearRight] = segment.quad;
  context.strokeStyle = color;
  context.lineWidth = ConeStroke.RimStrokeWidth;
  context.globalAlpha =
    depthAlpha * (ConeStroke.RimBaseAlpha - ConeStroke.RimFadeSpan * segment.t);
  strokePoints(context, [nearLeft, farLeft]);
  strokePoints(context, [nearRight, farRight]);
  context.lineWidth = ConeStroke.DividerStrokeWidth;
  context.globalAlpha =
    depthAlpha * (ConeStroke.DividerBaseAlpha - ConeStroke.DividerFadeSpan * segment.t);
  strokePoints(context, [farLeft, farRight]);
}

/** Fill each cone segment by its intensity, fading towards the far end. */
export function paintConeSegments(
  context: RenderContext2D,
  segments: readonly ConeSegment[],
  paint: ConePaint,
): void {
  for (const segment of segments) {
    const color = segment.maxWindKt > 0 ? windColor(segment.maxWindKt) : paint.fallbackColor;
    tracePoints(context, segment.quad, true);
    context.fillStyle = color;
    context.globalAlpha =
      paint.depthAlpha * (ConeFill.BaseAlpha - ConeFill.FadeSpan * segment.t);
    context.fill();
    if (paint.rims) paintConeRims(context, segment, color, paint.depthAlpha);
  }
}

/** An X at the genesis point; the caller sets stroke colour, width, and alpha. */
export function drawGenesisMark(
  context: RenderContext2D,
  x: number,
  y: number,
  armLength: number,
): void {
  context.beginPath();
  context.moveTo(x - armLength, y - armLength);
  context.lineTo(x + armLength, y + armLength);
  context.moveTo(x - armLength, y + armLength);
  context.lineTo(x + armLength, y - armLength);
  context.stroke();
}
