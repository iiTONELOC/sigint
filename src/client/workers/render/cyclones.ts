// ── Cyclone render module (worker) ───────────────────────────────────
// Bundled TS imported by pointWorker.ts. Draws the storm eye, glow, past
// track, segmented cone, forecast track, and wind-radii footprint on the
// globe's OffscreenCanvas. Geometry (cone segments, wind-radii footprint,
// band colors) comes from the SHARED module so the globe and the dossier
// mini-map render identically — single source of truth.
//
// WCAG 2.2 AA: the eye pulse, selection-ring oscillation, and forecast dash
// skip their time-based deltas when reducedMotion is true.

import {
  segmentedConeSegments,
  windRadiiBandPoints,
  WIND_RADII_BANDS,
  type Ctx,
  type LatLon,
  type ProjFn,
} from "@/features/environmental/cyclones/render/cycloneGeometry";
import { windColor } from "@/features/environmental/cyclones/classification";
import { drawCycloneModels, type ModelTrack } from "./models";
import { zoomScale } from "./workerMath";

/** Shape `drawCyclone` reads off a storm point. The worker projects lat/lon to
 *  screen space before calling, but still passes lat/lon for the wind-radii
 *  north-reference projection. */
export type CycloneRenderItem = {
  lat: number;
  lon: number;
  _zoom?: number;
  data?: {
    saffirSimpson?: number;
    maxWindKt?: number;
    forecast?: Array<{ lat: number; lon: number; fcstHour: number; errorRadiusNm: number; maxWindKt?: number }>;
    pastTrack?: LatLon[];
    windRadii?: { kt34: number[] | null; kt50: number[] | null; kt64: number[] | null };
    models?: ModelTrack[];
  };
};

/** Stroke a polyline through already-projected screen points. */
function strokePath(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

/** Per-layer visibility + motion flags for a storm draw. Grouped so the storm's
 *  toggles travel as one argument instead of a positional bool run. */
export type CycloneDrawFlags = {
  showForecast: boolean;
  showCone: boolean;
  showWindField: boolean;
  showModels: boolean;
  hiddenModels: ReadonlySet<string>;
  reducedMotion: boolean;
};

export function drawCyclone(
  ctx: Ctx,
  projFn: ProjFn,
  x: number,
  y: number,
  item: CycloneRenderItem,
  baseColor: string,
  depthAlpha: number,
  t: number,
  isSelected: boolean,
  flags: CycloneDrawFlags,
): void {
  const { showForecast, showCone, showWindField, showModels, hiddenModels, reducedMotion } = flags;
  const d = item.data ?? {};
  const cat = d.saffirSimpson ?? 0;
  // Color the storm by its Saffir-Simpson intensity (matches the dossier).
  const color = typeof d.maxWindKt === "number" ? windColor(d.maxWindKt) : baseColor;
  const baseSize = 2 + cat * 1.2; // TD/TS=2, HU5=8
  let s = baseSize * zoomScale(item._zoom ?? 1);
  if (isSelected) s *= 1.5;

  // Outer pulsing glow.
  const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 1.5) * 0.15;
  const gr = s * 3 * pulse;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, gr);
  glow.addColorStop(0, color + "60");
  glow.addColorStop(0.5, color + "30");
  glow.addColorStop(1, color + "00");
  ctx.fillStyle = glow;
  ctx.globalAlpha = depthAlpha * 0.7;
  ctx.beginPath();
  ctx.arc(x, y, gr, 0, Math.PI * 2);
  ctx.fill();

  // Spaghetti model tracks — under the marker/track so the official track stays
  // legible on top. Each model its own color (TV-style), same as the mini-map.
  if (showModels && d.models && d.models.length > 0) {
    const visible = d.models.filter((m) => !hiddenModels.has(m.model));
    if (visible.length > 0) drawCycloneModels(ctx, projFn, visible, depthAlpha);
  }

  // Observed past track (genesis → now), tied to the track toggle.
  if (showForecast) drawPastTrack(ctx, projFn, x, y, item, color, depthAlpha);

  // Eye dot.
  ctx.fillStyle = color;
  ctx.globalAlpha = depthAlpha;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();

  // Current-position marker: hollow ring + bright centre pip.
  ctx.strokeStyle = color;
  ctx.globalAlpha = depthAlpha * 0.95;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, s + 3.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = depthAlpha;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, s * 0.35), 0, Math.PI * 2);
  ctx.fill();

  // Forecast track + cone.
  if (showForecast && d.forecast && d.forecast.length > 0) {
    drawCycloneForecast(ctx, projFn, x, y, item, color, depthAlpha, showCone);
  }

  // Real 34/50/64-kt wind radii.
  if (showWindField) drawWindRadii(ctx, projFn, x, y, item, depthAlpha);

  // Selection ring.
  if (isSelected) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const ringDelta = reducedMotion ? 0 : Math.sin(t * 2) * 2;
    ctx.arc(x, y, s * 2.5 + ringDelta, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWindRadii(
  ctx: Ctx,
  projFn: ProjFn,
  x: number,
  y: number,
  item: CycloneRenderItem,
  depthAlpha: number,
): void {
  const wr = item.data?.windRadii;
  if (!wr) return;
  const north = projFn(item.lat + 1, item.lon);
  if (north.z <= 0) return;
  const pxPerNm = Math.hypot(north.x - x, north.y - y) / 60;
  if (!(pxPerNm > 0)) return;

  const bandQ: Record<number, number[] | null> = { 34: wr.kt34, 50: wr.kt50, 64: wr.kt64 };
  for (const { kt, color, alpha } of WIND_RADII_BANDS) {
    const q = bandQ[kt];
    if (!q) continue;
    const pts = windRadiiBandPoints(q, x, y, pxPerNm);
    if (pts.length === 0) continue;
    ctx.fillStyle = color;
    ctx.globalAlpha = depthAlpha * alpha;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPastTrack(
  ctx: Ctx,
  projFn: ProjFn,
  eyeX: number,
  eyeY: number,
  item: CycloneRenderItem,
  color: string,
  depthAlpha: number,
): void {
  const track = item.data?.pastTrack;
  if (!track || track.length < 2) return;
  const pts = track
    .map((p) => projFn(p.lat, p.lon))
    .filter((p) => p.z > 0)
    .map((p) => [p.x, p.y] as [number, number]);
  if (pts.length < 2) return;

  // Solid trail genesis → eye.
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = depthAlpha * 0.45;
  strokePath(ctx, [...pts, [eyeX, eyeY]]);

  // Past-position dots (skip genesis).
  ctx.fillStyle = color;
  ctx.globalAlpha = depthAlpha * 0.55;
  for (const [px, py] of pts.slice(1)) {
    ctx.beginPath();
    ctx.arc(px, py, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Genesis "X".
  const genesis = pts[0];
  if (!genesis) return;
  const [gx, gy] = genesis;
  const xs = 4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = depthAlpha * 0.9;
  ctx.beginPath();
  ctx.moveTo(gx - xs, gy - xs);
  ctx.lineTo(gx + xs, gy + xs);
  ctx.moveTo(gx - xs, gy + xs);
  ctx.lineTo(gx + xs, gy - xs);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCycloneForecast(
  ctx: Ctx,
  projFn: ProjFn,
  eyeX: number,
  eyeY: number,
  item: CycloneRenderItem,
  color: string,
  baseAlpha: number,
  showCone: boolean,
): void {
  const forecast = item.data?.forecast ?? [];
  const fp = forecast
    .map((f) => ({ p: projFn(f.lat, f.lon), f }))
    .filter(({ p }) => p.z > 0)
    .map(({ p, f }) => ({ x: p.x, y: p.y, ...f }));
  if (fp.length === 0) return;

  // Cone — tapered segments (shared geometry, same as the mini-map).
  if (showCone) {
    for (const seg of segmentedConeSegments(eyeX, eyeY, forecast, projFn, item.data?.maxWindKt ?? 0)) {
      // Color each band by its far-point forecast intensity (matches the dots).
      const segColor = seg.maxWindKt > 0 ? windColor(seg.maxWindKt) : color;
      ctx.beginPath();
      seg.quad.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = segColor;
      ctx.globalAlpha = baseAlpha * (0.3 - 0.18 * seg.t);
      ctx.fill();

      // Rim edges + far divider.
      ctx.strokeStyle = segColor;
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = baseAlpha * (0.6 - 0.35 * seg.t);
      const [a1, b1, b2, a2] = seg.quad;
      strokePath(ctx, [a1, b1]);
      strokePath(ctx, [a2, b2]);
      ctx.lineWidth = 1;
      ctx.globalAlpha = baseAlpha * (0.5 - 0.3 * seg.t);
      strokePath(ctx, [b1, b2]);
    }
    ctx.globalAlpha = 1;
  }

  // Forecast track polyline — eye → forecast points (dashed).
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.globalAlpha = baseAlpha * 0.7;
  strokePath(ctx, [[eyeX, eyeY], ...fp.map((p) => [p.x, p.y] as [number, number])]);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** One forecast-point dot — called from pointWorker's points loop. */
export function drawCycloneForecastPoint(
  ctx: Ctx,
  x: number,
  y: number,
  fcstHour: number,
  color: string,
  depthAlpha: number,
  motion: { isSelected: boolean; t: number; reducedMotion: boolean },
): void {
  const fade = 1 - Math.min(1, Math.max(0, fcstHour / 144));
  const s = motion.isSelected ? 4 : 2;
  ctx.fillStyle = color;
  ctx.globalAlpha = depthAlpha * fade;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();

  if (motion.isSelected) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const ringDelta = motion.reducedMotion ? 0 : Math.sin(motion.t * 2) * 2;
    ctx.beginPath();
    ctx.arc(x, y, s * 2.5 + ringDelta, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
